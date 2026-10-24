import { expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { schema } from '@mmo/db';
import { uuidv7 } from '@mmo/shared';
import {
  awardKill,
  getCombatProfile,
  getBalances,
  grantItemInTx,
  inTransaction,
  moveItem,
  adjustBalanceInTx,
} from '../src/index';
import { repairAtNpc } from '../src/durability';
import { makePlayer, setupContext, expectCode } from './helpers';
const ctx = setupContext();
const npcId = 'npc.world.greenvale_marches.profession';
async function equippedPlayer() {
  const p = await makePlayer(ctx);
  const grant = await inTransaction(ctx, (tx) =>
    grantItemInTx(tx, ctx, {
      ...p,
      templateId: 'weapon.sword.iron_longsword',
      quantity: 1,
      method: 'system',
      actor: p,
    }),
  );
  await moveItem(ctx, {
    ...p,
    request: {
      itemInstanceId: grant.created.id,
      expectedVersion: grant.created.version,
      to: { kind: 'equipped', slotId: 'main_hand' },
    },
  });
  const row = async () =>
    (
      await ctx.db
        .select()
        .from(schema.itemInstances)
        .where(eq(schema.itemInstances.id, grant.created.id))
    )[0]!;
  return { p, row, id: grant.created.id };
}
it('wears equipped gear once per credited kill, preserves bags, and never destroys broken equipment', async () => {
  const { p, row, id } = await equippedPlayer();
  const bag = await inTransaction(ctx, (tx) =>
    grantItemInTx(tx, ctx, {
      ...p,
      templateId: 'armor.cloth.apprentice_robe',
      quantity: 1,
      method: 'system',
      actor: p,
    }),
  );
  const before = await row();
  const kill = {
    killId: uuidv7(),
    characterId: p.characterId,
    enemyId: 'enemy.greenvale.grey_wolf',
    zoneId: 'zone.greenvale.meadows',
  };
  await awardKill(ctx, kill);
  await expectCode(awardKill(ctx, kill), 'ALREADY_CLAIMED');
  expect((await row()).durabilityCurrent).toBe(before.durabilityCurrent! - 1);
  expect(
    (
      await ctx.db
        .select()
        .from(schema.itemInstances)
        .where(eq(schema.itemInstances.id, bag.created.id))
    )[0]!.durabilityCurrent,
  ).toBe(bag.created.durabilityCurrent);
  await ctx.db
    .update(schema.itemInstances)
    .set({ durabilityCurrent: 1 })
    .where(eq(schema.itemInstances.id, id));
  await awardKill(ctx, { ...kill, killId: uuidv7() });
  expect(await row()).toMatchObject({ durabilityCurrent: 0, locationKind: 'equipped' });
  expect((await getCombatProfile(ctx.db, ctx, p.characterId)).weapon.templateId).toBeNull();
  await awardKill(ctx, { ...kill, killId: uuidv7() });
  expect((await row()).durabilityCurrent).toBe(0);
});
it('atomically repairs and restores stats, with one debit under concurrent replay and no repair of later damage', async () => {
  const { p, row, id } = await equippedPlayer();
  const healthy = await getCombatProfile(ctx.db, ctx, p.characterId);
  await ctx.db
    .update(schema.itemInstances)
    .set({ durabilityCurrent: 0 })
    .where(eq(schema.itemInstances.id, id));
  const broken = await getCombatProfile(ctx.db, ctx, p.characterId);
  expect(broken.appearance.mainHandTemplateId).toBe('weapon.sword.iron_longsword');
  expect(broken.stats.strength).toBeLessThan(healthy.stats.strength!);
  await inTransaction(ctx, (tx) =>
    adjustBalanceInTx(tx, ctx, {
      ...p,
      currencyId: 'gold',
      delta: 100,
      reason: 'admin_adjustment',
      correlationId: uuidv7(),
    }),
  );
  const before = await getBalances(ctx.db, p.accountId, p.characterId);
  const request = { ...p, npcId, maxCopper: 100, requestId: uuidv7() };
  const results = await Promise.all(Array.from({ length: 4 }, () => repairAtNpc(ctx, request)));
  expect(results.filter((r) => !r.duplicate)).toHaveLength(1);
  const item = await row();
  expect(item.durabilityCurrent).toBe(item.durabilityMax);
  const after = await getBalances(ctx.db, p.accountId, p.characterId);
  expect(
    before.find((b) => b.currencyId === 'gold')!.amount -
      after.find((b) => b.currencyId === 'gold')!.amount,
  ).toBe(Math.ceil(item.durabilityMax! / 10));
  expect((await getCombatProfile(ctx.db, ctx, p.characterId)).stats).toEqual(healthy.stats);
  expect((await getCombatProfile(ctx.db, ctx, p.characterId)).appearance.mainHandTemplateId).toBe(
    'weapon.sword.iron_longsword',
  );
  await ctx.db
    .update(schema.itemInstances)
    .set({ durabilityCurrent: 1 })
    .where(eq(schema.itemInstances.id, id));
  await repairAtNpc(ctx, request);
  expect((await row()).durabilityCurrent).toBe(1);
});
it('rejects wrong NPC, ownership, insufficient money and stale quotes without changing items', async () => {
  const { p, row, id } = await equippedPlayer();
  const other = await makePlayer(ctx);
  await ctx.db
    .update(schema.itemInstances)
    .set({ durabilityCurrent: 0 })
    .where(eq(schema.itemInstances.id, id));
  const request = { ...p, npcId, maxCopper: 100, requestId: uuidv7() };
  await expectCode(
    repairAtNpc(ctx, { ...request, npcId: 'npc.greenvale.elder_maren' }),
    'WRONG_NPC',
  );
  await expectCode(repairAtNpc(ctx, { ...request, accountId: other.accountId }), 'NOT_FOUND');
  await expectCode(repairAtNpc(ctx, { ...request, maxCopper: 0 }), 'CONFLICT');
  await ctx.db
    .update(schema.currencyBalances)
    .set({ amount: 0 })
    .where(eq(schema.currencyBalances.ownerCharacterId, p.characterId));
  await expectCode(repairAtNpc(ctx, request), 'INSUFFICIENT_FUNDS');
  expect((await row()).durabilityCurrent).toBe(0);
  expect(
    await ctx.db
      .select()
      .from(schema.serviceReceipts)
      .where(eq(schema.serviceReceipts.characterId, p.characterId)),
  ).toHaveLength(0);
});
