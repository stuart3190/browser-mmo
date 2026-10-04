/** Repeatable non-production backup/restore exercise with real economy rows. */
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { createDb, runMigrations, syncItemTemplates } from '../packages/db/src/index';
import { getGameData } from '../packages/game-data/src/index';
import {
  createDomainContext,
  provisionPasswordAccount,
  createCharacter,
  adminGrantItem,
  createListing,
  SessionService,
} from '../packages/domain/src/index';
const adminUrl = process.env.TEST_DATABASE_URL;
if (!adminUrl || adminUrl === process.env.DATABASE_URL)
  throw new Error('Set a dedicated TEST_DATABASE_URL distinct from DATABASE_URL');
const suffix = `${Date.now()}`;
const sourceName = `mmo_backup_${suffix}`;
const targetName = `mmo_restore_${suffix}`;
const admin = createDb({ url: adminUrl });
const urlFor = (name: string) => {
  const u = new URL(adminUrl);
  u.pathname = `/${name}`;
  return u.toString();
};
const out = process.env.BACKUP_TEST_DIR ?? resolve(tmpdir(), `mmo-backup-${suffix}`);
await mkdir(out, { recursive: true, mode: 0o700 });
const run = (mode: string, dbUrl: string) =>
  new Promise<void>((resolve, reject) => {
    const p = spawn('pnpm', ['exec', 'tsx', 'scripts/db-backup.ts', mode, `${out}/proof.dump`], {
      env: { ...process.env, DATABASE_URL: dbUrl },
      stdio: 'inherit',
    });
    p.on('error', reject);
    p.on('exit', (n) => (n === 0 ? resolve() : reject(new Error(`${mode} failed`))));
  });
try {
  await admin.pool.query(`create database "${sourceName}"`);
  await admin.pool.query(`create database "${targetName}"`);
  const source = createDb({ url: urlFor(sourceName) });
  try {
    await runMigrations(source.db);
    await syncItemTemplates(source.db, getGameData());
    const ctx = createDomainContext({ db: source.db, gameData: getGameData() });
    const accountId = await provisionPasswordAccount(
      ctx,
      'restore_proof',
      'disposable restore proof password',
    );
    await new SessionService(1).create(ctx, accountId, 'game_web');
    const c = await createCharacter(ctx, {
      accountId,
      name: 'Restoreproof',
      classId: 'class.warrior',
    });
    const item = await adminGrantItem(ctx, {
      characterId: c.id,
      templateId: 'weapon.sword.iron_longsword',
      quantity: 1,
      actor: { accountId: null, characterId: null },
      reason: 'restore proof',
    });
    await createListing(ctx, {
      actor: { accountId, characterId: c.id },
      itemInstanceId: item.instance.id,
      price: 100,
      durationHours: 24,
    });
  } finally {
    await source.close();
  }
  await run('backup', urlFor(sourceName));
  await run('restore', urlFor(targetName));
  const restored = createDb({ url: urlFor(targetName) });
  try {
    const sessions = await restored.pool.query(
      'select count(*)::int n from sessions where revoked_at is null',
    );
    if (sessions.rows[0].n !== 0) throw new Error('Restored sessions were not revoked');
  } finally {
    await restored.close();
  }
  // Refuse a second restore into an occupied database.
  let refused = false;
  try {
    await run('restore', urlFor(targetName));
  } catch {
    refused = true;
  }
  if (!refused) throw new Error('Occupied restore target was not refused');
  console.log(`BACKUP_RESTORE_PASS ${out}`);
} finally {
  await admin.pool.query(`drop database if exists "${sourceName}" with (force)`);
  await admin.pool.query(`drop database if exists "${targetName}" with (force)`);
  await admin.close();
}
