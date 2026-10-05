import { afterAll, expect, it } from 'vitest';
import { mkdtemp, cp, appendFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { createDb, runMigrations } from '@mmo/db';
import { MIGRATIONS_FOLDER } from '../../db/src/migrate';
const handle = createDb({ url: process.env.TEST_DATABASE_URL! });
afterAll(() => handle.close());
it('reapplies safely and rejects changes to an already applied migration', async () => {
  await runMigrations(handle.db);
  const dir = await mkdtemp(resolve(tmpdir(), 'mmo-migrations-'));
  try {
    await cp(MIGRATIONS_FOLDER, dir, { recursive: true });
    await appendFile(resolve(dir, '0000_init.sql'), '\n-- tampered applied migration\n');
    await expect(runMigrations(handle.db, dir)).rejects.toThrow('checksum mismatch');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
it('refuses a concurrent migration runner without leaking its connection', async () => {
  const client = await handle.pool.connect();
  try {
    await client.query('select pg_advisory_lock(717724,1)');
    await expect(runMigrations(handle.db)).rejects.toThrow('Another migration runner');
  } finally {
    await client.query('select pg_advisory_unlock_all()');
    client.release();
  }
  await runMigrations(handle.db);
});
it('preserves populated recovery payloads during the Marches content migration', async () => {
  const { readFile } = await import('node:fs/promises');
  const { sql } = await import('drizzle-orm');
  const payload = {
    contentHash: '96afea3256a20111a723829672002fc96e7b5151ecb0d809fa27f4d6c3899081',
    simulation: '{"health":43,"cooldowns":{"*":999},"position":{"x":29,"z":33}}',
    players: [{ characterId: 'preserved-controller', lingerUntil: 999 }],
    pending: [{ killId: 'preserved-kill' }],
  };
  const migration = (
    await readFile(resolve(MIGRATIONS_FOLDER, '0016_marches_gathering.sql'), 'utf8')
  ).split('--> statement-breakpoint')[1]!;
  try {
    await handle.db.execute(
      sql`insert into zone_checkpoints(zone_id,version,payload) values('test.marches.migration',1,${JSON.stringify(payload)})`,
    );
    await handle.db.execute(sql.raw(migration));
    const result = await handle.db.execute(
      sql`select payload from zone_checkpoints where zone_id='test.marches.migration'`,
    );
    expect(JSON.parse((result.rows[0] as { payload: string }).payload)).toEqual({
      ...payload,
      contentHash: '5a781d5c88c14adf05c8a453d5959699fa1e635cf1d9fa8a8122ea19be7f8dd7',
    });
  } finally {
    await handle.db.execute(
      sql`delete from zone_checkpoints where zone_id='test.marches.migration'`,
    );
  }
});
