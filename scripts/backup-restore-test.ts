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
  buyListing,
  SessionService,
  moveItem,
  acceptQuest,
  recordKill,
  processKillEvent,
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
    const equipped = await adminGrantItem(ctx, {
      characterId: c.id,
      templateId: 'weapon.sword.iron_longsword',
      quantity: 1,
      actor: { accountId: null, characterId: null },
      reason: 'restore equipment proof',
    });
    await moveItem(ctx, {
      accountId,
      characterId: c.id,
      request: {
        itemInstanceId: equipped.instance.id,
        expectedVersion: equipped.instance.version,
        to: { kind: 'equipped', slotId: 'main_hand' },
      },
    });
    await acceptQuest(ctx, {
      characterId: c.id,
      questId: 'quest.greenvale.wolves_at_the_edge',
      npcId: 'npc.greenvale.elder_maren',
    });
    const killId = crypto.randomUUID();
    await recordKill(source.db, {
      killId,
      zoneId: 'zone.greenvale.meadows',
      enemyId: 'enemy.greenvale.grey_wolf',
      spawnPointId: 'restore.proof.wolf',
      groupId: null,
      characterId: c.id,
      diedAt: new Date(),
      respawnAt: new Date(Date.now() + 60000),
    });
    const reward = await processKillEvent(ctx, killId);
    if (reward.status !== 'rewarded') throw new Error('Restore fixture reward failed');
    await createListing(ctx, {
      actor: { accountId, characterId: c.id },
      itemInstanceId: item.instance.id,
      price: 100,
      durationHours: 24,
    });
    const sale = await adminGrantItem(ctx, {
      characterId: c.id,
      templateId: 'weapon.sword.iron_longsword',
      quantity: 1,
      actor: { accountId: null, characterId: null },
      reason: 'restore completed sale',
    });
    const listing = await createListing(ctx, {
      actor: { accountId, characterId: c.id },
      itemInstanceId: sale.instance.id,
      price: 100,
      durationHours: 24,
    });
    const buyerId = await provisionPasswordAccount(
      ctx,
      'restore_buyer',
      'another disposable proof password',
    );
    const buyer = await createCharacter(ctx, {
      accountId: buyerId,
      name: 'Restorebuyer',
      classId: 'class.warrior',
    });
    await buyListing(ctx, {
      actor: { accountId: buyerId, characterId: buyer.id },
      listingId: listing.id,
      expectedPrice: 100,
    });
  } finally {
    await source.close();
  }
  await run('backup', urlFor(sourceName));
  await run('restore', urlFor(targetName));
  const restored = createDb({ url: urlFor(targetName) });
  try {
    await runMigrations(restored.db); // migration hashes and final schema remain valid
    for (const table of [
      'accounts',
      'characters',
      'item_instances',
      'item_history',
      'containers',
      'currency_balances',
      'currency_ledger',
      'character_quests',
      'marketplace_listings',
      'marketplace_transactions',
      'kill_events',
      'kill_rewards',
      'sessions',
    ]) {
      const rows = await restored.pool.query(`select count(*)::int n from ${table}`);
      if (rows.rows[0].n < 1) throw new Error(`Restore fixture missing ${table}`);
    }
    const equipment = await restored.pool.query(
      "select count(*)::int n from item_instances where location_kind='equipped'",
    );
    if (equipment.rows[0].n !== 1) throw new Error('Equipment restore failed');
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
