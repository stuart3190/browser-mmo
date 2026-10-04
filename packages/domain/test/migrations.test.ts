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
