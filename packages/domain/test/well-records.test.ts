import { expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { schema } from '@mmo/db';
import { uuidv7 } from '@mmo/shared';
import {
  acceptQuest,
  recordExploration,
  questRecords,
  turnInQuest,
  getBalances,
} from '../src/index';
import { setupContext, makePlayer, expectCode } from './helpers';
const ctx = setupContext(),
  Q = 'quest.greenvale.well_records',
  npcId = 'npc.greenvale.elder_maren';
it('requires Stillwater, persists personal visits, retries/concurrent visit and turn-in pay once; reward failure rolls back', async () => {
  const [a, b] = [await makePlayer(ctx), await makePlayer(ctx)];
  for (const p of [a, b]) {
    await expectCode(
      acceptQuest(ctx, { characterId: p.characterId, questId: Q, npcId }),
      'QUEST_NOT_AVAILABLE',
    );
    await ctx.db
      .update(schema.characters)
      .set({ level: 3 })
      .where(eq(schema.characters.id, p.characterId));
    await ctx.db.insert(schema.characterQuests).values({
      characterId: p.characterId,
      questId: 'quest.greenvale.stillwater',
      status: 'completed',
      progress: {},
      acceptedAt: new Date(),
      completedAt: new Date(),
      rewardedAt: new Date(),
      turnInId: uuidv7(),
    });
    await acceptQuest(ctx, { characterId: p.characterId, questId: Q, npcId });
  }
  const visit = {
    characterId: a!.characterId,
    zoneId: 'zone.greenvale.meadows',
    position: { x: 8, y: 0, z: 12 },
    health: 100,
  };
  expect(await recordExploration(ctx, { ...visit, health: 0 })).toBe(false);
  expect(await recordExploration(ctx, { ...visit, position: { x: 8, y: 0, z: 20 } })).toBe(false);
  const visits = await Promise.all([recordExploration(ctx, visit), recordExploration(ctx, visit)]);
  expect(visits.filter(Boolean)).toHaveLength(1);
  expect(
    (await questRecords(ctx.db, b!.characterId)).find((q) => q.questId === Q)!.progress,
  ).toEqual({});
  await expectCode(
    turnInQuest(ctx, { characterId: a!.characterId, questId: Q, npcId }),
    'QUEST_INCOMPLETE',
  );
  expect(await recordExploration(ctx, { ...visit, position: { x: 8, y: 0, z: 110 } })).toBe(true);
  await expect(
    turnInQuest(ctx, {
      characterId: a!.characterId,
      questId: Q,
      npcId,
      afterConsume: async () => {
        throw Error('crash');
      },
    }),
  ).rejects.toThrow('crash');
  expect((await questRecords(ctx.db, a!.characterId)).find((q) => q.questId === Q)!.status).toBe(
    'active',
  );
  const before = await getBalances(ctx.db, a!.accountId, a!.characterId);
  const results = await Promise.allSettled([
    turnInQuest(ctx, { characterId: a!.characterId, questId: Q, npcId }),
    turnInQuest(ctx, { characterId: a!.characterId, questId: Q, npcId }),
  ]);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(
    (await getBalances(ctx.db, a!.accountId, a!.characterId))[0]!.amount - before[0]!.amount,
  ).toBe(150);
  expect(
    await ctx.db
      .select()
      .from(schema.itemInstances)
      .where(eq(schema.itemInstances.sourceRef, `quest:${Q}:${a!.characterId}:0`)),
  ).toHaveLength(1);
  expect(await recordExploration(ctx, visit)).toBe(false);
});
