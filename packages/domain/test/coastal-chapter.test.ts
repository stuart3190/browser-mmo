import { expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { schema } from '@mmo/db';
import { uuidv7 } from '@mmo/shared';
import { tidewatch } from '@mmo/game-data';
import {
  acceptQuest,
  turnInQuest,
  recordNpcTalk,
  recordExploration,
  awardKill,
  questRecords,
} from '../src/index';
import { setupContext, makePlayer, expectCode } from './helpers';
const ctx = setupContext();
it('persists the complete coastal chapter, requires personal surveys and grants its final seal exactly once', async () => {
  const p = await makePlayer(ctx),
    [crossing, marks, bell] = tidewatch.questIds as [string, string, string];
  const action = (questId: string, npcId = tidewatch.npcId) => ({
    characterId: p.characterId,
    questId,
    npcId,
  });
  await expectCode(
    acceptQuest(ctx, action(crossing, 'npc.greenvale.elder_maren')),
    'QUEST_NOT_AVAILABLE',
  );
  await ctx.db
    .update(schema.characters)
    .set({ level: 5 })
    .where(eq(schema.characters.id, p.characterId));
  await ctx.db.insert(schema.characterQuests).values({
    characterId: p.characterId,
    questId: 'quest.greenvale.marches_home',
    status: 'completed',
    progress: {},
    acceptedAt: new Date(),
    completedAt: new Date(),
    rewardedAt: new Date(),
    turnInId: uuidv7(),
  });
  await acceptQuest(ctx, action(crossing, 'npc.greenvale.elder_maren'));
  await expectCode(turnInQuest(ctx, action(crossing)), 'QUEST_INCOMPLETE');
  await recordNpcTalk(ctx, p.characterId, tidewatch.npcId);
  await turnInQuest(ctx, action(crossing));
  await acceptQuest(ctx, action(marks));
  const kill = (enemyId: string) =>
    awardKill(ctx, {
      characterId: p.characterId,
      killId: uuidv7(),
      enemyId,
      zoneId: tidewatch.zoneId,
    });
  await kill('enemy.amber_coast.glassback_crab');
  await kill('enemy.amber_coast.glassback_crab');
  await expectCode(turnInQuest(ctx, action(marks)), 'QUEST_INCOMPLETE');
  for (const landmark of tidewatch.landmarks.slice(0, 2))
    await recordExploration(ctx, {
      characterId: p.characterId,
      zoneId: tidewatch.zoneId,
      position: landmark.position,
      health: 100,
    });
  await turnInQuest(ctx, action(marks));
  await acceptQuest(ctx, action(bell));
  await kill('enemy.amber_coast.drowned_bellkeeper');
  await expectCode(turnInQuest(ctx, action(bell)), 'QUEST_INCOMPLETE');
  await recordExploration(ctx, {
    characterId: p.characterId,
    zoneId: tidewatch.zoneId,
    position: tidewatch.landmarks[2]!.position,
    health: 100,
  });
  const paid = await Promise.allSettled([
    turnInQuest(ctx, action(bell)),
    turnInQuest(ctx, action(bell)),
  ]);
  expect(paid.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(
    (await questRecords(ctx.db, p.characterId))
      .filter((q) => tidewatch.questIds.includes(q.questId))
      .every((q) => q.status === 'completed'),
  ).toBe(true);
  const seals = await ctx.db
    .select()
    .from(schema.itemInstances)
    .where(eq(schema.itemInstances.sourceRef, `quest:${bell}:${p.characterId}:0`));
  expect(seals).toHaveLength(1);
  expect(seals[0]!.templateId).toBe('accessory.ring.tideglass_seal');
  expect(seals[0]!.boundCharacterId).toBe(p.characterId);
});
