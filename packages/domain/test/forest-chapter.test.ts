import { expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { schema } from '@mmo/db';
import { uuidv7 } from '@mmo/shared';
import { livingSeal } from '@mmo/game-data';
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
it('persists the complete forest chapter, requires personal surveys and grants its Heartwood Knot exactly once', async () => {
  const p = await makePlayer(ctx),
    [crossing, marks, bell] = livingSeal.questIds as [string, string, string];
  const action = (questId: string, npcId = livingSeal.npcId) => ({
    characterId: p.characterId,
    questId,
    npcId,
  });
  await expectCode(
    acceptQuest(ctx, action(crossing, 'npc.amber_coast.iona')),
    'QUEST_NOT_AVAILABLE',
  );
  await ctx.db
    .update(schema.characters)
    .set({ level: 5, xp: 2150 })
    .where(eq(schema.characters.id, p.characterId));
  await ctx.db.insert(schema.characterQuests).values({
    characterId: p.characterId,
    questId: 'quest.amber_coast.last_bell',
    status: 'completed',
    progress: {},
    acceptedAt: new Date(),
    completedAt: new Date(),
    rewardedAt: new Date(),
    turnInId: uuidv7(),
  });
  await acceptQuest(ctx, action(crossing, 'npc.amber_coast.iona'));
  await expectCode(turnInQuest(ctx, action(crossing)), 'QUEST_INCOMPLETE');
  await recordNpcTalk(ctx, p.characterId, livingSeal.npcId);
  await turnInQuest(ctx, action(crossing));
  await acceptQuest(ctx, action(marks));
  const kill = (enemyId: string) =>
    awardKill(ctx, {
      characterId: p.characterId,
      killId: uuidv7(),
      enemyId,
      zoneId: livingSeal.zoneId,
    });
  await kill('enemy.elderwood.briar_spitter');
  await kill('enemy.elderwood.briar_spitter');
  await expectCode(turnInQuest(ctx, action(marks)), 'QUEST_INCOMPLETE');
  for (const landmark of livingSeal.landmarks.slice(0, 2))
    await recordExploration(ctx, {
      characterId: p.characterId,
      zoneId: livingSeal.zoneId,
      position: landmark.position,
      health: 100,
    });
  await turnInQuest(ctx, action(marks));
  await acceptQuest(ctx, action(bell));
  await kill('enemy.elderwood.rootbound_cantor');
  await expectCode(turnInQuest(ctx, action(bell)), 'QUEST_INCOMPLETE');
  await recordExploration(ctx, {
    characterId: p.characterId,
    zoneId: livingSeal.zoneId,
    position: livingSeal.landmarks[2]!.position,
    health: 100,
  });
  const paid = await Promise.allSettled([
    turnInQuest(ctx, action(bell)),
    turnInQuest(ctx, action(bell)),
  ]);
  expect(paid.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(
    (await questRecords(ctx.db, p.characterId))
      .filter((q) => livingSeal.questIds.includes(q.questId))
      .every((q) => q.status === 'completed'),
  ).toBe(true);
  const seals = await ctx.db
    .select()
    .from(schema.itemInstances)
    .where(eq(schema.itemInstances.sourceRef, `quest:${bell}:${p.characterId}:0`));
  expect(seals).toHaveLength(1);
  expect(seals[0]!.templateId).toBe('accessory.necklace.heartwood_knot');
  expect(seals[0]!.boundCharacterId).toBe(p.characterId);
  const [character] = await ctx.db
    .select()
    .from(schema.characters)
    .where(eq(schema.characters.id, p.characterId));
  expect(character!.level).toBe(6);
});
