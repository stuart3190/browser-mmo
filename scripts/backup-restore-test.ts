/** Repeatable non-production backup/restore exercise with real economy rows. */
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { deepStrictEqual } from 'node:assert';
import { verifyLegacyUpgrade } from './fixtures/legacy-upgrade';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { createDb, runMigrations, syncItemTemplates } from '../packages/db/src/index';
import { MIGRATIONS_FOLDER } from '../packages/db/src/migrate';
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
  createDirectTrade,
  actOnDirectTrade,
  requestFriend,
  actOnFriend,
  sendDirectMessage,
  readDirectMessages,
} from '../packages/domain/src/index';
const adminUrl = process.env.TEST_DATABASE_URL;
if (!adminUrl || adminUrl === process.env.DATABASE_URL)
  throw new Error('Set a dedicated TEST_DATABASE_URL distinct from DATABASE_URL');
const suffix = `${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
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
const durableTables = [
  'accounts',
  'characters',
  'containers',
  'item_instances',
  'item_history',
  'currency_balances',
  'currency_ledger',
  'character_quests',
  'marketplace_listings',
  'marketplace_transactions',
  'kill_events',
  'kill_rewards',
  'direct_trades',
  'friendships',
  'social_blocks',
  'direct_messages',
];
const durableBefore = new Map<string, unknown>();
let sourceCreated = false,
  targetCreated = false;
try {
  await admin.pool.query(`create database "${sourceName}"`);
  sourceCreated = true;
  await admin.pool.query(`create database "${targetName}"`);
  targetCreated = true;
  const source = createDb({ url: urlFor(sourceName) });
  try {
    await verifyLegacyUpgrade(source, MIGRATIONS_FOLDER, out);
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
    const tradeItem = await adminGrantItem(ctx, {
      characterId: c.id,
      templateId: 'weapon.sword.iron_longsword',
      quantity: 1,
      actor: { accountId: null, characterId: null },
      reason: 'restore trade proof',
    });
    const sellerActor = { accountId, characterId: c.id },
      buyerActor = { accountId: buyerId, characterId: buyer.id };
    const trade = await createDirectTrade(ctx, sellerActor, buyer.name, crypto.randomUUID());
    await actOnDirectTrade(ctx, sellerActor, trade.id, {
      action: 'offer',
      revision: 0,
      offer: {
        items: [{ id: tradeItem.instance.id, version: tradeItem.instance.version }],
        copper: 20,
      },
    });
    await actOnDirectTrade(ctx, buyerActor, trade.id, {
      action: 'offer',
      revision: 1,
      offer: { items: [], copper: 70 },
    });
    for (const actor of [sellerActor, buyerActor])
      await actOnDirectTrade(ctx, actor, trade.id, { action: 'lock', revision: 2 });
    for (const actor of [sellerActor, buyerActor])
      await actOnDirectTrade(ctx, actor, trade.id, { action: 'confirm', revision: 2 });
    await createDirectTrade(ctx, sellerActor, buyer.name, crypto.randomUUID());
    await requestFriend(ctx, sellerActor, buyer.name);
    await actOnFriend(ctx, buyerActor, accountId, 'accept');
    const message = await sendDirectMessage(
      ctx,
      sellerActor,
      buyerId,
      crypto.randomUUID(),
      'Persistent restore conversation',
    );
    await readDirectMessages(ctx, buyerActor, accountId, [message.id]);
    await sendDirectMessage(ctx, buyerActor, accountId, crypto.randomUUID(), 'An unread reply');
    const legacy = (
      await source.pool.query(
        "select c.id,c.account_id,c.name from characters c join accounts a on a.id=c.account_id where a.username='legacy_restore'",
      )
    ).rows[0];
    await requestFriend(ctx, { accountId: legacy.account_id, characterId: legacy.id }, c.name);
    await actOnFriend(ctx, buyerActor, legacy.account_id, 'block');

    for (const table of durableTables) {
      const rows = await source.pool.query(
        `SELECT to_jsonb(t) data FROM ${table} t ORDER BY to_jsonb(t)::text`,
      );
      durableBefore.set(table, rows.rows);
    }
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
    for (const table of durableTables) {
      const rows = await restored.pool.query(
        `SELECT to_jsonb(t) data FROM ${table} t ORDER BY to_jsonb(t)::text`,
      );
      deepStrictEqual(
        rows.rows,
        durableBefore.get(table),
        `Restore changed durable rows in ${table}`,
      );
    }
    const trades = await restored.pool.query('SELECT status FROM direct_trades ORDER BY status');
    deepStrictEqual(trades.rows, [{ status: 'completed' }, { status: 'open' }]);
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
  await writeFile(
    resolve(out, 'result.json'),
    JSON.stringify(
      {
        ok: true,
        legacyUpgrade: '0005 -> current',
        durableTables,
        tradeStates: ['completed', 'open'],
        sessionsRevoked: true,
        occupiedTargetRefused: true,
      },
      null,
      2,
    ),
  );
  console.log(`BACKUP_RESTORE_PASS ${out}`);
} finally {
  if (sourceCreated) await admin.pool.query(`drop database if exists "${sourceName}" with (force)`);
  if (targetCreated) await admin.pool.query(`drop database if exists "${targetName}" with (force)`);
  await admin.close();
}
