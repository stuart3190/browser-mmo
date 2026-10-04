import { describe, expect, it } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import { schema } from '@mmo/db';
import { uuidv7 } from '@mmo/shared';
import {
  acceptQuest,
  awardKill,
  getBalances,
  getCharacterItems,
  getQuestLog,
  grantItemInTx,
  inTransaction,
  npcDialogue,
  processKillEvent,
  questRecords,
  recordKill,
  turnInQuest,
} from '../src/index';
import type { ContainerKind } from '@mmo/schemas';
import { containerId, expectCode, makePlayer, setupContext } from './helpers';
import type { TestPlayer } from './helpers';

const ctx = setupContext();
const Q = 'quest.greenvale.wolves_at_the_edge';
const MAREN = 'npc.greenvale.elder_maren';
const WOLF = 'enemy.greenvale.grey_wolf';
const PELT = 'material.hide.wolf_pelt';
const CLOAK = 'accessory.cloak.wayfarer_cloak';
const ZONE = 'zone.greenvale.meadows';
const SYSTEM = { accountId: null, characterId: null };

const view = async (p: TestPlayer) =>
  (await getQuestLog(ctx.db, ctx, p.characterId)).find((q) => q.questId === Q)!;
const grant = (
  p: TestPlayer,
  templateId: string,
  quantity: number,
  containerKind?: ContainerKind,
) =>
  inTransaction(ctx, (tx) =>
    grantItemInTx(tx, ctx, {
      ...p,
      templateId,
      quantity,
      method: 'system',
      actor: SYSTEM,
      ...(containerKind ? { containerKind } : {}),
    }),
  );
const character = async (p: TestPlayer) =>
  (
    await ctx.db.select().from(schema.characters).where(eq(schema.characters.id, p.characterId))
  )[0]!;
const gold = async (p: TestPlayer) =>
  (await getBalances(ctx.db, p.accountId, p.characterId)).find((b) => b.currencyId === 'gold')!
    .amount;
const itemsOf = async (p: TestPlayer, templateId: string) =>
  (await getCharacterItems(ctx.db, ctx, p.accountId, p.characterId)).containers
    .flatMap((c) => c.items.map((i) => ({ ...i, kind: c.container.kind })))
    .filter((i) => i.template.id === templateId);
const pelts = async (p: TestPlayer) =>
  (await itemsOf(p, PELT)).reduce((n, i) => n + i.instance.quantity, 0);
/** Marks the kill objective complete directly (kill counting itself is tested separately). */
const setKills = (p: TestPlayer, n: number) =>
  ctx.db
    .update(schema.characterQuests)
    .set({ progress: { kill_wolves: n } })
    .where(
      and(
        eq(schema.characterQuests.characterId, p.characterId),
        eq(schema.characterQuests.questId, Q),
      ),
    );
async function readyPlayer(peltCount = 3) {
  const p = await makePlayer(ctx);
  await acceptQuest(ctx, { characterId: p.characterId, questId: Q, npcId: MAREN });
  await setKills(p, 5);
  if (peltCount) await grant(p, PELT, peltCount);
  return p;
}

describe('accepting', () => {
  it('available -> accepted (persisted active); dialogue reflects it; second accept rejected', async () => {
    const p = await makePlayer(ctx);
    expect((await view(p)).state).toBe('available');
    const d = await npcDialogue(ctx.db, ctx, p.characterId, MAREN);
    expect(d.quests).toEqual([expect.objectContaining({ action: 'accept' })]);
    const log = await acceptQuest(ctx, { characterId: p.characterId, questId: Q, npcId: MAREN });
    expect(log.find((q) => q.questId === Q)).toMatchObject({
      state: 'active',
      objectives: [
        { id: 'kill_wolves', current: 0, required: 5, done: false },
        { id: 'wolf_pelts', current: 0, required: 3, done: false },
      ],
    });
    expect(await questRecords(ctx.db, p.characterId)).toMatchObject([
      { questId: Q, status: 'active' },
    ]);
    expect((await npcDialogue(ctx.db, ctx, p.characterId, MAREN)).quests[0]).toMatchObject({
      action: null,
      quest: { state: 'active' },
    });
    await expectCode(
      acceptQuest(ctx, { characterId: p.characterId, questId: Q, npcId: MAREN }),
      'QUEST_NOT_AVAILABLE',
    );
  });

  it('concurrent accepts create exactly one row; wrong NPC / unknown / placeholder quests rejected', async () => {
    const p = await makePlayer(ctx);
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        acceptQuest(ctx, { characterId: p.characterId, questId: Q, npcId: MAREN }),
      ),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await questRecords(ctx.db, p.characterId)).toHaveLength(1);
    const q = await makePlayer(ctx);
    await expectCode(
      acceptQuest(ctx, { characterId: q.characterId, questId: Q, npcId: 'npc.nobody' }),
      'WRONG_NPC',
    );
    await expectCode(
      acceptQuest(ctx, { characterId: q.characterId, questId: 'quest.nope', npcId: MAREN }),
      'NOT_FOUND',
    );
    await expectCode(
      acceptQuest(ctx, {
        characterId: q.characterId,
        questId: 'quest.greenvale.letter_to_captain',
        npcId: MAREN,
      }),
      'NOT_FOUND',
    );
  });
});

describe('progress', () => {
  it('each recorded wolf kill counts exactly once (duplicates, replays and concurrent processors)', async () => {
    const p = await makePlayer(ctx);
    // kills before accepting do not count
    await awardKill(ctx, {
      killId: uuidv7(),
      characterId: p.characterId,
      enemyId: WOLF,
      zoneId: ZONE,
    });
    await acceptQuest(ctx, { characterId: p.characterId, questId: Q, npcId: MAREN });
    expect((await view(p)).objectives[0]!.current).toBe(0);

    const killId = uuidv7();
    const r = await awardKill(ctx, {
      killId,
      characterId: p.characterId,
      enemyId: WOLF,
      zoneId: ZONE,
    });
    expect(r.questsProgressed).toEqual([Q]);
    await expectCode(
      awardKill(ctx, { killId, characterId: p.characterId, enemyId: WOLF, zoneId: ZONE }),
      'ALREADY_CLAIMED',
    );
    // the outbox path: one recorded event processed by 4 concurrent workers
    const k2 = uuidv7();
    await recordKill(ctx.db, {
      killId: k2,
      zoneId: ZONE,
      enemyId: WOLF,
      spawnPointId: 'spawn.x',
      groupId: null,
      characterId: p.characterId,
      diedAt: new Date(),
      respawnAt: new Date(Date.now() + 30_000),
    });
    await Promise.all(Array.from({ length: 4 }, () => processKillEvent(ctx, k2)));
    expect((await view(p)).objectives[0]!.current).toBe(2);

    for (let i = 0; i < 5; i++)
      await awardKill(ctx, {
        killId: uuidv7(),
        characterId: p.characterId,
        enemyId: WOLF,
        zoneId: ZONE,
      });
    const v = await view(p);
    expect(v.objectives[0]).toMatchObject({ current: 5, done: true }); // capped
    expect((await questRecords(ctx.db, p.characterId))[0]!.progress).toEqual({ kill_wolves: 5 });
  });

  it('pelt progress is derived from the bags AND Recovered loot; locked or vaulted pelts do not count', async () => {
    const p = await makePlayer(ctx);
    await acceptQuest(ctx, { characterId: p.characterId, questId: Q, npcId: MAREN });
    await grant(p, PELT, 1);
    await grant(p, PELT, 1, 'mailbox');
    expect((await view(p)).objectives[1]!.current).toBe(2);
    const vaulted = await grant(p, PELT, 5, 'character_vault');
    expect((await view(p)).objectives[1]!.current).toBe(2);
    await ctx.db
      .update(schema.itemInstances)
      .set({ isLocked: true })
      .where(eq(schema.itemInstances.id, vaulted.created.id));
    const locked = await grant(p, PELT, 1, 'backpack');
    await ctx.db
      .update(schema.itemInstances)
      .set({ isLocked: true })
      .where(eq(schema.itemInstances.id, locked.created.id));
    expect((await view(p)).objectives[1]!.current).toBe(2);
    await setKills(p, 5);
    expect((await view(p)).state).toBe('active');
    await grant(p, PELT, 1);
    expect((await view(p)).state).toBe('ready_to_turn_in');
  });
});

describe('turning in', () => {
  it('rejects before objectives are complete, at the wrong NPC, and when not accepted — state unchanged', async () => {
    const p = await makePlayer(ctx);
    await expectCode(
      turnInQuest(ctx, { characterId: p.characterId, questId: Q, npcId: MAREN }),
      'QUEST_NOT_ACTIVE',
    );
    await acceptQuest(ctx, { characterId: p.characterId, questId: Q, npcId: MAREN });
    await grant(p, PELT, 3);
    await setKills(p, 4);
    const xp = (await character(p)).xp;
    await expectCode(
      turnInQuest(ctx, { characterId: p.characterId, questId: Q, npcId: MAREN }),
      'QUEST_INCOMPLETE',
    );
    await setKills(p, 5);
    await expectCode(
      turnInQuest(ctx, { characterId: p.characterId, questId: Q, npcId: 'npc.someone_else' }),
      'WRONG_NPC',
    );
    expect(await pelts(p)).toBe(3);
    expect((await character(p)).xp).toBe(xp);
    expect((await view(p)).state).toBe('ready_to_turn_in');
  });

  it('consumes exactly the required pelts, pays XP + gold + item once, completes permanently', async () => {
    const p = await readyPlayer(5);
    await grant(p, PELT, 1, 'mailbox');
    const goldBefore = await gold(p);
    const r = await turnInQuest(ctx, { characterId: p.characterId, questId: Q, npcId: MAREN });
    expect(r).toMatchObject({ xpGained: 300, gold: 250, mailedItems: [] });
    expect(r.items.map((i) => i.template.id)).toEqual([CLOAK]);
    expect(await pelts(p)).toBe(3); // 6 - 3, mailbox consumed first
    expect((await itemsOf(p, PELT)).some((i) => i.kind === 'mailbox')).toBe(false);
    expect(await gold(p)).toBe(goldBefore + 250);
    expect((await character(p)).xp).toBe(r.xp);
    expect(await itemsOf(p, CLOAK)).toHaveLength(1);
    const v = await view(p);
    expect(v.state).toBe('completed');
    expect(v.completedAt).not.toBeNull();
    const [row] = await ctx.db
      .select()
      .from(schema.characterQuests)
      .where(eq(schema.characterQuests.characterId, p.characterId));
    expect(row!.rewardedAt).not.toBeNull();
    // permanently completed: no second turn-in, no re-accept
    await expectCode(
      turnInQuest(ctx, { characterId: p.characterId, questId: Q, npcId: MAREN }),
      'QUEST_ALREADY_COMPLETED',
    );
    await expectCode(
      acceptQuest(ctx, { characterId: p.characterId, questId: Q, npcId: MAREN }),
      'QUEST_ALREADY_COMPLETED',
    );
    expect((await npcDialogue(ctx.db, ctx, p.characterId, MAREN)).quests[0]).toMatchObject({
      action: null,
      quest: { state: 'completed' },
    });
    // consumption provenance
    const history = await ctx.db
      .select()
      .from(schema.itemHistory)
      .where(eq(schema.itemHistory.correlationId, r.turnInId));
    expect(history.some((h) => h.eventType === 'destroyed' || h.eventType === 'modified')).toBe(
      true,
    );
  });

  it('concurrent turn-ins pay exactly once', async () => {
    const p = await readyPlayer(3);
    const goldBefore = await gold(p);
    const xpBefore = (await character(p)).xp;
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        turnInQuest(ctx, { characterId: p.characterId, questId: Q, npcId: MAREN }),
      ),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    for (const r of results)
      if (r.status === 'rejected')
        expect(['QUEST_ALREADY_COMPLETED', 'QUEST_INCOMPLETE']).toContain(
          (r.reason as { code: string }).code,
        );
    expect(await gold(p)).toBe(goldBefore + 250);
    expect((await character(p)).xp).toBe(xpBefore + 300);
    expect(await itemsOf(p, CLOAK)).toHaveLength(1);
    const ledger = await ctx.db
      .select()
      .from(schema.currencyLedger)
      .where(
        eq(
          schema.currencyLedger.correlationId,
          (
            results.find((x) => x.status === 'fulfilled') as PromiseFulfilledResult<{
              turnInId: string;
            }>
          ).value.turnInId,
        ),
      );
    expect(ledger).toHaveLength(1);
  });

  it('a crash mid turn-in (after consuming, before rewards) rolls everything back', async () => {
    const p = await readyPlayer(3);
    const goldBefore = await gold(p);
    await expect(
      turnInQuest(ctx, {
        characterId: p.characterId,
        questId: Q,
        npcId: MAREN,
        afterConsume: () => Promise.reject(new Error('process died')),
      }),
    ).rejects.toThrow('process died');
    expect(await pelts(p)).toBe(3);
    expect(await gold(p)).toBe(goldBefore);
    expect((await view(p)).state).toBe('ready_to_turn_in');
    // and the retry after "restart" succeeds once
    await turnInQuest(ctx, { characterId: p.characterId, questId: Q, npcId: MAREN });
    expect(await pelts(p)).toBe(0);
    expect((await view(p)).state).toBe('completed');
  });

  it('full bags: the reward item goes to Recovered loot; full mailbox too: nothing happens at all', async () => {
    const p = await readyPlayer(3);
    for (let i = 0; i < 24; i++) await grant(p, 'weapon.sword.iron_longsword', 1);
    const r = await turnInQuest(ctx, { characterId: p.characterId, questId: Q, npcId: MAREN });
    expect(r.mailedItems).toEqual([{ itemTemplateId: CLOAK, quantity: 1 }]);
    expect((await itemsOf(p, CLOAK))[0]!.kind).toBe('mailbox');

    const q = await readyPlayer(3);
    for (let i = 0; i < 24; i++) await grant(q, 'weapon.sword.iron_longsword', 1);
    const mailbox = await containerId(ctx, q, 'mailbox');
    await ctx.db
      .update(schema.containers)
      .set({ capacity: 1 })
      .where(eq(schema.containers.id, mailbox));
    await grant(q, 'weapon.sword.iron_longsword', 1, 'mailbox');
    const goldBefore = await gold(q);
    await expectCode(
      turnInQuest(ctx, { characterId: q.characterId, questId: Q, npcId: MAREN }),
      'CONTAINER_FULL',
    );
    expect(await pelts(q)).toBe(3);
    expect(await gold(q)).toBe(goldBefore);
    expect((await view(q)).state).toBe('ready_to_turn_in');
  });

  it('items removed between the check and consumption cannot be double-counted', async () => {
    const p = await readyPlayer(3);
    // another transaction takes a pelt away while a turn-in is attempted: one of them wins cleanly
    const [pelt] = await itemsOf(p, PELT);
    await ctx.db
      .update(schema.itemInstances)
      .set({ quantity: 2 })
      .where(eq(schema.itemInstances.id, pelt!.instance.id));
    await expectCode(
      turnInQuest(ctx, { characterId: p.characterId, questId: Q, npcId: MAREN }),
      'QUEST_INCOMPLETE',
    );
    const [{ n }] = (await ctx.db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.characterQuests)
      .where(
        and(
          eq(schema.characterQuests.characterId, p.characterId),
          eq(schema.characterQuests.status, 'completed'),
        ),
      )) as [{ n: number }];
    expect(n).toBe(0);
  });
});
