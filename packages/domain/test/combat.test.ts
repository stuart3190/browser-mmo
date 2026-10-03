import { describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { schema } from '@mmo/db';
import { xpToNextLevel } from '@mmo/game-data';
import { uuidv7 } from '@mmo/shared';
import {
  awardKill,
  getBalances,
  getCharacterItems,
  getCombatProfile,
  grantItemInTx,
  inTransaction,
  moveItem,
  saveCharacterHealth,
} from '../src/index';
import { expectCode, makePlayer, setupContext } from './helpers';

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

  it('keeps XP and gold but reports items as lost when bags are full (no partial stacks)', async () => {
    const p = await makePlayer(ctx, 'class.warrior');
    const fill = (templateId: string) =>
      inTransaction(ctx, (tx) =>
        grantItemInTx(tx, ctx, {
          ...p,
          templateId,
          quantity: 1,
          method: 'system',
          actor: { accountId: null, characterId: null },
        }),
      );
    for (let i = 0; i < 24; i++) await fill('weapon.sword.iron_longsword');
    for (let i = 0; i < 40; i++) {
      await inTransaction(ctx, (tx) =>
        grantItemInTx(tx, ctx, {
          ...p,
          templateId: 'material.hide.wolf_pelt',
          quantity: 200,
          method: 'system',
          actor: { accountId: null, characterId: null },
        }),
      );
    }
    const killId = uuidv7();
    const r = await awardKill(ctx, {
      killId,
      characterId: p.characterId,
      enemyId: WOLF,
      zoneId: ZONE,
    });
    expect(r.items).toHaveLength(0);
    expect(r.lostItems).toHaveLength(2);
    expect(r.xpGained).toBeGreaterThan(0);
    const inv = await getCharacterItems(ctx.db, ctx, p.accountId, p.characterId);
    expect(
      inv.containers
        .find((c) => c.container.kind === 'material_pouch')!
        .items.every((i) => i.instance.quantity === 200),
    ).toBe(true);
  });
});
