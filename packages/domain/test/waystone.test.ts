import { expect, it } from 'vitest';
import { eq, and } from 'drizzle-orm';
import { schema } from '@mmo/db';
import { uuidv7 } from '@mmo/shared';
import {
  acceptQuest,
  awardKill,
  grantItemInTx,
  inTransaction,
  turnInQuest,
  recordNpcTalk,
  getQuestLog,
  getBalances,
} from '../src/index';
import { setupContext, makePlayer, expectCode } from './helpers';
const ctx = setupContext();
const WOLVES = 'quest.greenvale.wolves_at_the_edge',
  Q = 'quest.greenvale.old_waystone',
  MAREN = 'npc.greenvale.elder_maren',
  RILL = 'npc.greenvale.keeper_rill';
it('Waystone requires prior completion; talk progress is personal, durable, replay-safe and pays once', async () => {
  const a = await makePlayer(ctx),
    b = await makePlayer(ctx);
  await expectCode(
    acceptQuest(ctx, { characterId: a.characterId, questId: Q, npcId: MAREN }),
    'QUEST_NOT_AVAILABLE',
  );
  await recordNpcTalk(ctx, a.characterId, RILL); // Visiting before acceptance earns nothing.
  await acceptQuest(ctx, { characterId: a.characterId, questId: WOLVES, npcId: MAREN });
  for (let n = 0; n < 5; n++)
    await awardKill(ctx, {
      killId: uuidv7(),
      characterId: a.characterId,
      enemyId: 'enemy.greenvale.grey_wolf',
      zoneId: 'zone.greenvale.meadows',
    });
  await inTransaction(ctx, (tx) =>
    grantItemInTx(tx, ctx, {
      ...a,
      templateId: 'material.hide.wolf_pelt',
      quantity: 3,
      method: 'system',
      actor: { accountId: null, characterId: null },
    }),
  );
  await turnInQuest(ctx, { characterId: a.characterId, questId: WOLVES, npcId: MAREN });
  await acceptQuest(ctx, { characterId: a.characterId, questId: Q, npcId: MAREN });
  await expectCode(
    turnInQuest(ctx, { characterId: a.characterId, questId: Q, npcId: MAREN }),
    'QUEST_INCOMPLETE',
  );
  await recordNpcTalk(ctx, a.characterId, MAREN);
  expect((await getQuestLog(ctx.db, ctx, a.characterId)).find((q) => q.questId === Q)!.state).toBe(
    'active',
  );
  await Promise.all([
    recordNpcTalk(ctx, a.characterId, RILL),
    recordNpcTalk(ctx, a.characterId, RILL),
  ]);
  expect((await getQuestLog(ctx.db, ctx, a.characterId)).find((q) => q.questId === Q)!.state).toBe(
    'ready_to_turn_in',
  );
  expect((await getQuestLog(ctx.db, ctx, b.characterId)).find((q) => q.questId === Q)!.state).toBe(
    'unavailable',
  );
  await expectCode(
    turnInQuest(ctx, { characterId: a.characterId, questId: Q, npcId: RILL }),
    'WRONG_NPC',
  );
  const before = await getBalances(ctx.db, a.accountId, a.characterId);
  const results = await Promise.allSettled([
    turnInQuest(ctx, { characterId: a.characterId, questId: Q, npcId: MAREN }),
    turnInQuest(ctx, { characterId: a.characterId, questId: Q, npcId: MAREN }),
  ]);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  const [row] = await ctx.db
    .select()
    .from(schema.characterQuests)
    .where(
      and(
        eq(schema.characterQuests.characterId, a.characterId),
        eq(schema.characterQuests.questId, Q),
      ),
    );
  expect(row).toMatchObject({ status: 'completed', progress: { speak_to_rill: 1 } });
  const after = await getBalances(ctx.db, a.accountId, a.characterId);
  expect(after[0]!.amount - before[0]!.amount).toBe(75);
  const items = await ctx.db
    .select()
    .from(schema.itemInstances)
    .where(eq(schema.itemInstances.sourceRef, `quest:${Q}:${a.characterId}:0`));
  expect(items).toHaveLength(1);
  expect(items[0]!.templateId).toBe('accessory.ring.copper_band');
});
