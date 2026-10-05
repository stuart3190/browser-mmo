import { expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { schema } from '@mmo/db';
import { uuidv7 } from '@mmo/shared';
import {
  acceptQuest,
  processKillEvent,
  recordKill,
  questRecords,
  turnInQuest,
  recordExploration,
  getBalances,
} from '../src/index';
import { setupContext, makePlayer, expectCode } from './helpers';
const ctx = setupContext();
const Q = 'quest.greenvale.keeper_outpost',
  R = 'npc.greenvale.elder_maren';
it('requires well survey, shares sentinel credit but not personal survey; concurrent reward replay pays once', async () => {
  const players = [await makePlayer(ctx), await makePlayer(ctx)];
  for (const p of players) {
    await expectCode(
      acceptQuest(ctx, { characterId: p.characterId, questId: Q, npcId: R }),
      'QUEST_NOT_AVAILABLE',
    );
    // Fixture: prior quest completed; no Stillwater objectives or rewards injected.
    await ctx.db
      .update(schema.characters)
      .set({ level: 3 })
      .where(eq(schema.characters.id, p.characterId));
    await ctx.db.insert(schema.characterQuests).values({
      characterId: p.characterId,
      questId: 'quest.greenvale.well_records',
      status: 'completed',
      progress: { silence_lantern: 1 },
      acceptedAt: new Date(),
      completedAt: new Date(),
      rewardedAt: new Date(),
      turnInId: uuidv7(),
    });
    await acceptQuest(ctx, { characterId: p.characterId, questId: Q, npcId: R });
    await expectCode(
      turnInQuest(ctx, { characterId: p.characterId, questId: Q, npcId: R }),
      'QUEST_INCOMPLETE',
    );
  }
  const killId = uuidv7();
  await recordKill(ctx.db, {
    killId,
    characterId: players[0]!.characterId,
    recipients: players.map((p) => p.characterId),
    lootCharacterId: players[1]!.characterId,
    enemyId: 'enemy.greenvale.last_door_sentinel',
    zoneId: 'zone.greenvale.meadows',
    spawnPointId: 'spawn.greenvale.last_door_sentinel',
    groupId: null,
    diedAt: new Date(),
    respawnAt: new Date(),
  });
  const results = await Promise.all([processKillEvent(ctx, killId), processKillEvent(ctx, killId)]);
  expect(results.filter((r) => r.status === 'rewarded')).toHaveLength(1);
  const rewards = await ctx.db
    .select()
    .from(schema.killRewards)
    .where(eq(schema.killRewards.killId, killId));
  expect(rewards).toHaveLength(2);
  expect(rewards.reduce((n, r) => n + r.itemCount, 0)).toBe(1);
  expect(rewards.every((r) => r.xp === 121)).toBe(true);
  for (const p of players) {
    expect(
      (await questRecords(ctx.db, p.characterId)).find((q) => q.questId === Q)!.progress,
    ).toEqual({ quiet_aster: 1 });
    await expectCode(
      turnInQuest(ctx, { characterId: p.characterId, questId: Q, npcId: R }),
      'QUEST_INCOMPLETE',
    );
    await Promise.all([
      recordExploration(ctx, {
        characterId: p.characterId,
        zoneId: 'zone.greenvale.meadows',
        position: { x: 24, y: 0, z: 110 },
        health: 100,
      }),
      recordExploration(ctx, {
        characterId: p.characterId,
        zoneId: 'zone.greenvale.meadows',
        position: { x: 24, y: 0, z: 110 },
        health: 100,
      }),
    ]);
    expect(
      (await questRecords(ctx.db, p.characterId)).find((q) => q.questId === Q)!.progress,
    ).toEqual({ quiet_aster: 1, read_oath: 1 });
    const before = await getBalances(ctx.db, p.accountId, p.characterId);
    const turnins = await Promise.allSettled([
      turnInQuest(ctx, { characterId: p.characterId, questId: Q, npcId: R }),
      turnInQuest(ctx, { characterId: p.characterId, questId: Q, npcId: R }),
    ]);
    expect(turnins.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const after = await getBalances(ctx.db, p.accountId, p.characterId);
    expect(after[0]!.amount - before[0]!.amount).toBe(300);
    const items = await ctx.db
      .select()
      .from(schema.itemInstances)
      .where(eq(schema.itemInstances.sourceRef, `quest:${Q}:${p.characterId}:0`));
    expect(items).toHaveLength(1);
    expect(items[0]!.templateId).toBe('accessory.cloak.oathkeepers_mantle');
    expect(items[0]!.boundCharacterId).toBe(p.characterId);
  }
});
