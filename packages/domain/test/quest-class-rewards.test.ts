import { expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { schema } from '@mmo/db';
import { uuidv7 } from '@mmo/shared';
import {
  acceptQuest,
  getQuestLog,
  turnInQuest,
  grantItemInTx,
  inTransaction,
  moveItem,
  getCombatProfile,
} from '../src/index';
import { setupContext, makePlayer, expectCode } from './helpers';
const ctx = setupContext();
const questId = 'quest.greenvale.marches_remedy',
  npcId = 'npc.world.greenvale_marches.profession';
it.each([
  ['class.warrior', 'armor.leather.trapper_cap', 'head'],
  ['class.mage', 'armor.cloth.apprentice_robe', 'chest'],
] as const)(
  'offers, grants once and equips usable trailwear for %s',
  async (classId, templateId, slotId) => {
    const p = await makePlayer(ctx, classId),
      action = { characterId: p.characterId, questId, npcId };
    const offer = (await getQuestLog(ctx.db, ctx, p.characterId)).find(
      (q) => q.questId === questId,
    )!;
    expect(offer.state).toBe('available');
    expect(offer.rewards.items).toEqual([{ itemTemplateId: templateId, quantity: 1 }]);
    await acceptQuest(ctx, action);
    await expectCode(turnInQuest(ctx, action), 'QUEST_INCOMPLETE');
    for (const material of ['material.world.field_hide', 'material.world.wild_herb'])
      await inTransaction(ctx, (tx) =>
        grantItemInTx(tx, ctx, {
          ...p,
          templateId: material,
          quantity: 2,
          method: 'system',
          actor: p,
        }),
      );
    const results = await Promise.allSettled([turnInQuest(ctx, action), turnInQuest(ctx, action)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rows = await ctx.db
      .select()
      .from(schema.itemInstances)
      .where(eq(schema.itemInstances.sourceRef, `quest:${questId}:${p.characterId}:0`));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.templateId).toBe(templateId);
    const items = await ctx.db
      .select()
      .from(schema.itemInstances)
      .where(
        and(
          eq(schema.itemInstances.ownerCharacterId, p.characterId),
          eq(schema.itemInstances.locationKind, 'container'),
        ),
      );
    expect(
      items.filter((i) =>
        ['material.world.field_hide', 'material.world.wild_herb'].includes(i.templateId),
      ),
    ).toHaveLength(0);
    await moveItem(ctx, {
      ...p,
      request: {
        itemInstanceId: rows[0]!.id,
        expectedVersion: rows[0]!.version,
        to: { kind: 'equipped', slotId },
      },
    });
    expect((await getCombatProfile(ctx.db, ctx, p.characterId)).appearance.gear?.[slotId]).toBe(
      templateId,
    );
    await expectCode(turnInQuest(ctx, action), 'QUEST_ALREADY_COMPLETED');
  },
);
it('leaves a previously rewarded Mage cap intact and refuses a second payout', async () => {
  const p = await makePlayer(ctx, 'class.mage');
  const old = await inTransaction(ctx, (tx) =>
    grantItemInTx(tx, ctx, {
      ...p,
      templateId: 'armor.leather.trapper_cap',
      quantity: 1,
      method: 'quest_reward',
      sourceRef: `quest:${questId}:${p.characterId}:0`,
      actor: p,
    }),
  );
  await ctx.db
    .insert(schema.characterQuests)
    .values({
      characterId: p.characterId,
      questId,
      status: 'completed',
      progress: {},
      acceptedAt: new Date(),
      completedAt: new Date(),
      rewardedAt: new Date(),
      turnInId: uuidv7(),
    });
  await expectCode(
    turnInQuest(ctx, { characterId: p.characterId, questId, npcId }),
    'QUEST_ALREADY_COMPLETED',
  );
  const rows = await ctx.db
    .select()
    .from(schema.itemInstances)
    .where(eq(schema.itemInstances.sourceRef, `quest:${questId}:${p.characterId}:0`));
  expect(rows).toHaveLength(1);
  expect(rows[0]!.id).toBe(old.created.id);
  expect(rows[0]!.templateId).toBe('armor.leather.trapper_cap');
});
