import { describe, expect, it } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import { schema } from '@mmo/db';
import { xpToNextLevel } from '@mmo/game-data';
import { uuidv7 } from '@mmo/shared';
import {
  activeRespawns,
  awardKill,
  createCharacter,
  saveAbilityCooldowns,
  dueKillEvents,
  processKillEvent,
  recordKill,
  getBalances,
  getCharacterItems,
  getCombatProfile,
  grantItemInTx,
  inTransaction,
  moveItem,
  saveCharacterHealth,
} from '../src/index';
import type { KillEventRecord } from '../src/index';
import { containerId, expectCode, makePlayer, setupContext } from './helpers';

const ctx = setupContext();
const WOLF = 'enemy.greenvale.grey_wolf';
const ZONE = 'zone.greenvale.meadows';

describe('combat profile', () => {
  it('uses the equipped main-hand weapon and effective stats; unarmed otherwise', async () => {
    const p = await makePlayer(ctx, 'class.warrior');
    const bare = await getCombatProfile(ctx.db, ctx, p.characterId);
    expect(bare.weapon).toMatchObject({
      ...ctx.gameData.raw.combatRules.unarmed.damage,
      templateId: null,
    });
    expect(bare.maxHealth).toBe(120 + 12 * 2);
    expect(bare.health).toBe(bare.maxHealth);

    const { created } = await inTransaction(ctx, (tx) =>
      grantItemInTx(tx, ctx, {
        ...p,
        templateId: 'weapon.sword.iron_longsword',
        quantity: 1,
        method: 'system',
        actor: { accountId: null, characterId: null },
      }),
    );
    await moveItem(ctx, {
      ...p,
      request: {
        itemInstanceId: created.id,
        expectedVersion: created.version,
        to: { kind: 'equipped', slotId: 'main_hand' },
      },
    });
    const armed = await getCombatProfile(ctx.db, ctx, p.characterId);
    expect(armed.weapon).toEqual({
      min: 7,
      max: 13,
      attackSpeedMs: 2400,
      templateId: 'weapon.sword.iron_longsword',
    });
    expect(armed.stats.strength).toBe(
      bare.stats.strength! + (created.stats as { strength: number }).strength,
    );

    await saveCharacterHealth(ctx.db, p.characterId, 9);
    expect((await getCombatProfile(ctx.db, ctx, p.characterId)).health).toBe(9);
  });
});

describe('class persistence', () => {
  it('only playable classes can be created; the persisted class feeds the combat profile', async () => {
    const { accountId } = await makePlayer(ctx, 'class.warrior');
    await expectCode(
      createCharacter(ctx, { accountId, name: 'Rangerperson', classId: 'class.ranger' }),
      'VALIDATION_FAILED',
    );
    await expectCode(
      createCharacter(ctx, { accountId, name: 'Nobodyclass', classId: 'class.nope' }),
      'VALIDATION_FAILED',
    );
    const mage = await makePlayer(ctx, 'class.mage');
    const profile = await getCombatProfile(ctx.db, ctx, mage.characterId);
    expect(profile).toMatchObject({ classId: 'class.mage', abilityCooldowns: {} });
    await saveAbilityCooldowns(
      ctx.db,
      mage.characterId,
      { 'ability.mage.firebolt': Date.now() + 5000, 'ability.mage.flame_burst': Date.now() - 1 },
      Date.now(),
    );
    const again = await getCombatProfile(ctx.db, ctx, mage.characterId);
    expect(Object.keys(again.abilityCooldowns)).toEqual(['ability.mage.firebolt']);
  });
});

describe('kill rewards', () => {
  it('awards XP, gold and loot through the item pipeline with provenance', async () => {
    const p = await makePlayer(ctx, 'class.warrior');
    const killId = uuidv7();
    const r = await awardKill(ctx, {
      killId,
      characterId: p.characterId,
      enemyId: WOLF,
      zoneId: ZONE,
    });
    expect(r.xpGained).toBe(Math.round(45 * 1.1)); // wolf level 2 vs player level 1
    expect(r.xp).toBe(r.xpGained);
    expect(r.gold).toBeGreaterThanOrEqual(5);
    expect(r.items.length).toBeGreaterThan(0);
    const rows = await ctx.db
      .select()
      .from(schema.itemInstances)
      .where(sql`${schema.itemInstances.sourceRef} like ${`kill:${killId}:%`}`);
    expect(rows.length).toBe(2); // two rolls, empty chance 0 (merged stacks still keep their own row)
    expect(
      rows.every(
        (x) => x.acquisitionMethod === 'loot_drop' && x.ownerCharacterId === p.characterId,
      ),
    ).toBe(true);
    const history = await ctx.db
      .select()
      .from(schema.itemHistory)
      .where(eq(schema.itemHistory.correlationId, killId));
    expect(history.filter((h) => h.eventType === 'created')).toHaveLength(2);
    const [character] = await ctx.db
      .select()
      .from(schema.characters)
      .where(eq(schema.characters.id, p.characterId));
    expect(character!.xp).toBe(r.xpGained);
    const gold = (await getBalances(ctx.db, p.accountId, p.characterId)).find(
      (b) => b.currencyId === 'gold',
    )!.amount;
    expect(gold).toBe(1000 + r.gold);
  });

  it('cannot award the same kill twice, even concurrently (XP, gold and items stay single)', async () => {
    const p = await makePlayer(ctx, 'class.warrior');
    const killId = uuidv7();
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        awardKill(ctx, { killId, characterId: p.characterId, enemyId: WOLF, zoneId: ZONE }),
      ),
    );
    expect(results.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    for (const x of results)
      if (x.status === 'rejected')
        expect((x.reason as { code: string }).code).toBe('ALREADY_CLAIMED');
    await expectCode(
      awardKill(ctx, { killId, characterId: p.characterId, enemyId: WOLF, zoneId: ZONE }),
      'ALREADY_CLAIMED',
    );
    const [character] = await ctx.db
      .select()
      .from(schema.characters)
      .where(eq(schema.characters.id, p.characterId));
    expect(character!.xp).toBe(Math.round(45 * 1.1));
    const [{ n }] = (await ctx.db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.itemInstances)
      .where(sql`${schema.itemInstances.sourceRef} like ${`kill:${killId}:%`}`)) as [{ n: number }];
    expect(n).toBe(2);
    const ledger = await ctx.db
      .select()
      .from(schema.currencyLedger)
      .where(eq(schema.currencyLedger.correlationId, killId));
    expect(ledger).toHaveLength(1);
  });

  it('persists level-ups', async () => {
    const p = await makePlayer(ctx, 'class.warrior');
    const need = xpToNextLevel(ctx.gameData.raw.experienceCurve, 1);
    await ctx.db
      .update(schema.characters)
      .set({ xp: need - 10 })
      .where(eq(schema.characters.id, p.characterId));
    const r = await awardKill(ctx, {
      killId: uuidv7(),
      characterId: p.characterId,
      enemyId: WOLF,
      zoneId: ZONE,
    });
    expect(r).toMatchObject({ level: 2, levelsGained: 1, xp: need - 10 + r.xpGained - need });
    const profile = await getCombatProfile(ctx.db, ctx, p.characterId);
    expect(profile.level).toBe(2);
    expect(profile.maxHealth).toBeGreaterThan(144); // level growth raises health
  });

  it('delivers loot that does not fit the bags to the mailbox (nothing lost, no partial stacks)', async () => {
    const p = await makePlayer(ctx, 'class.warrior');
    await fillBags(p);
    const killId = uuidv7();
    const r = await awardKill(ctx, {
      killId,
      characterId: p.characterId,
      enemyId: WOLF,
      zoneId: ZONE,
    });
    expect(r.mailedItems).toHaveLength(2);
    expect(r.items).toHaveLength(2);
    expect(
      r.items.every(
        (i) =>
          i.instance.location.kind === 'container' &&
          i.instance.location.containerKind === 'mailbox',
      ),
    ).toBe(true);
    expect(r.xpGained).toBeGreaterThan(0);
    const inv = await getCharacterItems(ctx.db, ctx, p.accountId, p.characterId);
    expect(
      inv.containers
        .find((c) => c.container.kind === 'material_pouch')!
        .items.every((i) => i.instance.quantity === 200),
    ).toBe(true);
    const mailbox = inv.containers.find((c) => c.container.kind === 'mailbox')!;
    expect(mailbox.items).toHaveLength(2);
    // provenance is the same as any other drop
    expect(
      mailbox.items.every((i) => i.instance.acquisition.sourceRef?.startsWith(`kill:${killId}:`)),
    ).toBe(true);
  });

  it('creates a mailbox lazily for characters that predate it', async () => {
    const p = await makePlayer(ctx, 'class.warrior');
    await ctx.db
      .delete(schema.containers)
      .where(
        and(
          eq(schema.containers.ownerCharacterId, p.characterId),
          eq(schema.containers.kind, 'mailbox'),
        ),
      );
    await fillBags(p);
    const r = await awardKill(ctx, {
      killId: uuidv7(),
      characterId: p.characterId,
      enemyId: WOLF,
      zoneId: ZONE,
    });
    expect(r.mailedItems).toHaveLength(2);
  });

  it('players can take items out of the mailbox but never put items in', async () => {
    const p = await makePlayer(ctx, 'class.warrior');
    await fillBags(p, false);
    const r = await awardKill(ctx, {
      killId: uuidv7(),
      characterId: p.characterId,
      enemyId: WOLF,
      zoneId: ZONE,
    });
    const mailed = r.items.find(
      (i) =>
        i.instance.location.kind === 'container' && i.instance.location.containerKind === 'mailbox',
    )!;
    const backpack = await containerId(ctx, p, 'backpack');
    const mailbox = await containerId(ctx, p, 'mailbox');
    // backpack is full: retrieving fails cleanly and the item stays in the mailbox
    await expectCode(
      moveItem(ctx, {
        ...p,
        request: {
          itemInstanceId: mailed.instance.id,
          expectedVersion: mailed.instance.version,
          to: { kind: 'container', containerId: backpack },
        },
      }),
      'CONTAINER_FULL',
    );
    const inv = await getCharacterItems(ctx.db, ctx, p.accountId, p.characterId);
    const sword = inv.containers.find((c) => c.container.kind === 'backpack')!.items[0]!;
    await expectCode(
      moveItem(ctx, {
        ...p,
        request: {
          itemInstanceId: sword.instance.id,
          expectedVersion: sword.instance.version,
          to: { kind: 'container', containerId: mailbox },
        },
      }),
      'CONTAINER_KIND_MISMATCH',
    );
  });
});

/** Fills the backpack (24 swords) and, optionally, the material pouch (40 full pelt stacks). */
async function fillBags(p: { accountId: string; characterId: string }, pouch = true) {
  const grant = (templateId: string, quantity: number) =>
    inTransaction(ctx, (tx) =>
      grantItemInTx(tx, ctx, {
        ...p,
        templateId,
        quantity,
        method: 'system',
        actor: { accountId: null, characterId: null },
      }),
    );
  for (let i = 0; i < 24; i++) await grant('weapon.sword.iron_longsword', 1);
  if (pouch) for (let i = 0; i < 40; i++) await grant('material.hide.wolf_pelt', 200);
}

describe('durable kill events (outbox)', () => {
  const event = (
    p: { characterId: string },
    over: Partial<KillEventRecord> = {},
  ): KillEventRecord => ({
    killId: uuidv7(),
    zoneId: ZONE,
    enemyId: WOLF,
    spawnPointId: 'spawn.greenvale.wolf_den_north_a',
    groupId: 'group.greenvale.wolf_den_north',
    characterId: p.characterId,
    diedAt: new Date(),
    respawnAt: new Date(Date.now() + 30_000),
    ...over,
  });
  const xpOf = async (characterId: string) =>
    (await ctx.db.select().from(schema.characters).where(eq(schema.characters.id, characterId)))[0]!
      .xp;
  const eventRow = async (killId: string) =>
    (await ctx.db.select().from(schema.killEvents).where(eq(schema.killEvents.killId, killId)))[0]!;

  it('recording is idempotent and processing rewards exactly once', async () => {
    const p = await makePlayer(ctx);
    const e = event(p);
    await recordKill(ctx.db, e);
    await recordKill(ctx.db, e); // retried write after a lost ack
    expect(
      (await dueKillEvents(ctx.db, { now: new Date() })).filter((k) => k === e.killId),
    ).toHaveLength(1);
    const first = await processKillEvent(ctx, e.killId);
    expect(first.status).toBe('rewarded');
    expect(await processKillEvent(ctx, e.killId)).toEqual({ status: 'done' });
    expect(await xpOf(p.characterId)).toBe(Math.round(45 * 1.1));
    expect(await eventRow(e.killId)).toMatchObject({ status: 'rewarded', attempts: 1 });
    expect(await dueKillEvents(ctx.db, { now: new Date() })).not.toContain(e.killId);
    expect(await processKillEvent(ctx, uuidv7())).toEqual({ status: 'missing' });
  });

  it('concurrent processors (live pipeline vs recovery sweep) reward once', async () => {
    const p = await makePlayer(ctx);
    const e = event(p);
    await recordKill(ctx.db, e);
    const results = await Promise.all(
      Array.from({ length: 6 }, () => processKillEvent(ctx, e.killId)),
    );
    expect(results.filter((r) => r.status === 'rewarded')).toHaveLength(1);
    expect(results.every((r) => ['rewarded', 'busy', 'done'].includes(r.status))).toBe(true);
    expect(await xpOf(p.characterId)).toBe(Math.round(45 * 1.1));
    const [{ n }] = (await ctx.db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.itemInstances)
      .where(sql`${schema.itemInstances.sourceRef} like ${`kill:${e.killId}:%`}`)) as [
      { n: number },
    ];
    expect(n).toBe(2);
  });

  it('a kill rewarded through the direct path is marked done instead of rewarded again', async () => {
    const p = await makePlayer(ctx);
    const e = event(p);
    await recordKill(ctx.db, e);
    await awardKill(ctx, {
      killId: e.killId,
      characterId: p.characterId,
      enemyId: WOLF,
      zoneId: ZONE,
    });
    expect(await processKillEvent(ctx, e.killId)).toEqual({ status: 'done' });
    expect(await eventRow(e.killId)).toMatchObject({ status: 'rewarded' });
    expect(await xpOf(p.characterId)).toBe(Math.round(45 * 1.1));
  });

  it('a full mailbox keeps the event pending with backoff (retried later, never lost)', async () => {
    const p = await makePlayer(ctx);
    await fillBags(p);
    const mailbox = await containerId(ctx, p, 'mailbox');
    await ctx.db
      .update(schema.containers)
      .set({ capacity: 1 })
      .where(eq(schema.containers.id, mailbox));
    await inTransaction(ctx, (tx) =>
      grantItemInTx(tx, ctx, {
        ...p,
        templateId: 'weapon.sword.iron_longsword',
        quantity: 1,
        method: 'system',
        actor: { accountId: null, characterId: null },
        containerKind: 'mailbox',
      }),
    ); // the one mailbox slot is now taken
    const xpBefore = await xpOf(p.characterId);
    const e = event(p);
    await recordKill(ctx.db, e);
    const r = await processKillEvent(ctx, e.killId);
    expect(r.status).toBe('retry');
    const row = await eventRow(e.killId);
    expect(row).toMatchObject({ status: 'pending', attempts: 1 });
    expect(row.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
    expect(await xpOf(p.characterId)).toBe(xpBefore); // nothing partially applied
    expect(await dueKillEvents(ctx.db, { now: new Date() })).not.toContain(e.killId);
    // room is made: the retry succeeds
    await ctx.db
      .update(schema.containers)
      .set({ capacity: 200 })
      .where(eq(schema.containers.id, mailbox));
    expect((await processKillEvent(ctx, e.killId)).status).toBe('rewarded');
    expect(await eventRow(e.killId)).toMatchObject({ status: 'rewarded', attempts: 2 });
  });

  it('voids events for deleted characters instead of retrying forever', async () => {
    const p = await makePlayer(ctx);
    const e = event(p);
    await recordKill(ctx.db, e);
    await ctx.db
      .update(schema.characters)
      .set({ deletedAt: new Date() })
      .where(eq(schema.characters.id, p.characterId));
    expect((await processKillEvent(ctx, e.killId)).status).toBe('void');
    expect(await eventRow(e.killId)).toMatchObject({ status: 'void' });
  });

  it('lists not-yet-elapsed respawn slots per zone (pending or rewarded)', async () => {
    const p = await makePlayer(ctx);
    const zoneId = `zone.test.${uuidv7()}`;
    const live = event(p, { zoneId, respawnAt: new Date(Date.now() + 60_000) });
    const elapsed = event(p, { zoneId, respawnAt: new Date(Date.now() - 1_000) });
    await recordKill(ctx.db, live);
    await recordKill(ctx.db, elapsed);
    const slots = await activeRespawns(ctx.db, zoneId, new Date());
    expect(slots).toEqual([
      {
        spawnPointId: live.spawnPointId,
        groupId: live.groupId,
        respawnAtMs: live.respawnAt.getTime(),
      },
    ]);
  });
});
