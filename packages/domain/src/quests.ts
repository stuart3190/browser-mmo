import { and, eq, sql } from 'drizzle-orm';
import { schema } from '@mmo/db';
import type { DbOrTx, Tx } from '@mmo/db';
import {
  applyExperience,
  applyKill,
  applyTalk,
  applyExploration,
  questAvailability,
  questDialogue,
  questView,
  turnInCheck,
  turnInNpcOf,
  xpToNextLevel,
} from '@mmo/game-data';
import type { QuestRecord } from '@mmo/game-data';
import type { ContainerKind, Item, QuestDefinition, QuestView } from '@mmo/schemas';
import { DomainError, ErrorCode, uuidv7 } from '@mmo/shared';
import type { DomainContext } from './context';
import { ensureMailbox } from './containers';
import { adjustBalanceInTx } from './currency';
import { consumeItemsInTx, countCharacterItems, grantItemInTx } from './items';
import type { ItemRow } from './items';
import { itemViews } from './mappers';
import { inTransaction } from './tx';

/**
 * Containers whose contents count towards collect objectives and are consumed on turn-in, in
 * consumption order. Recovered loot (mailbox) counts — loot that overflowed there is still the
 * player's — and is consumed first; vaults, equipped items, escrow and locked items never count.
 */
export const QUEST_ITEM_CONTAINERS: ContainerKind[] = ['mailbox', 'material_pouch', 'backpack'];

type QuestRow = typeof schema.characterQuests.$inferSelect;

function toRecord(r: QuestRow): QuestRecord {
  return {
    questId: r.questId,
    status: r.status as QuestRecord['status'],
    progress: r.progress,
    acceptedAt: r.acceptedAt.toISOString(),
    completedAt: r.completedAt?.toISOString() ?? null,
  };
}

async function questRows(db: DbOrTx, characterId: string, forUpdate = false): Promise<QuestRow[]> {
  const q = db
    .select()
    .from(schema.characterQuests)
    .where(eq(schema.characterQuests.characterId, characterId));
  return forUpdate ? q.for('update') : q;
}

async function lockCharacter(tx: Tx, characterId: string) {
  const [character] = await tx
    .select()
    .from(schema.characters)
    .where(eq(schema.characters.id, characterId))
    .for('update');
  if (!character || character.deletedAt)
    throw new DomainError(ErrorCode.NOT_FOUND, 'Character not found');
  return character;
}

function offeredQuests(ctx: DomainContext): QuestDefinition[] {
  return [...ctx.gameData.quests.values()].filter((q) => !q.placeholder);
}

/** Every (non-placeholder) quest with this character's authoritative state and progress. */
export async function getQuestLog(
  db: DbOrTx,
  ctx: DomainContext,
  characterId: string,
): Promise<QuestView[]> {
  const [character] = await db
    .select({ level: schema.characters.level })
    .from(schema.characters)
    .where(eq(schema.characters.id, characterId));
  if (!character) throw new DomainError(ErrorCode.NOT_FOUND, 'Character not found');
  const records = new Map((await questRows(db, characterId)).map((r) => [r.questId, toRecord(r)]));
  const counts = await countCharacterItems(db, characterId, QUEST_ITEM_CONTAINERS);
  const count = (id: string) => counts.get(id) ?? 0;
  return offeredQuests(ctx).map((def) => questView(def, character.level, records, count));
}

export interface NpcDialogue {
  npcId: string;
  name: string;
  title: string | null;
  greeting: string;
  quests: { quest: QuestView; line: string; action: 'accept' | 'turn_in' | null }[];
}

/**
 * What an NPC says to this character right now: an ambient greeting plus every quest it gives or
 * takes back, with the line and the one action (accept / turn in) the server would allow.
 * The caller (realtime host) has already validated the NPC entity and the player's range.
 */
export async function npcDialogue(
  db: DbOrTx,
  ctx: DomainContext,
  characterId: string,
  npcId: string,
): Promise<NpcDialogue> {
  const npc = ctx.gameData.npcs.get(npcId);
  if (!npc) throw new DomainError(ErrorCode.NOT_FOUND, 'Unknown NPC');
  const log = await getQuestLog(db, ctx, characterId);
  const quests: NpcDialogue['quests'] = [];
  for (const view of log) {
    const def = ctx.gameData.quest(view.questId);
    const gives = def.giverNpcId === npcId;
    const takes = turnInNpcOf(def) === npcId;
    if (!gives && !takes) continue;
    if (view.state === 'unavailable') continue;
    if (!gives && (view.state === 'available' || view.state === 'completed')) continue;
    const line = questDialogue(def, view.state);
    if (!line) continue;
    quests.push({
      quest: view,
      line,
      action:
        view.state === 'available' && gives
          ? 'accept'
          : view.state === 'ready_to_turn_in' && takes
            ? 'turn_in'
            : null,
    });
  }
  return {
    npcId,
    name: npc.name,
    title: npc.title,
    greeting: npc.dialogue[0] ?? `${npc.name} nods at you.`,
    quests,
  };
}

/**
 * Accepts a quest from an NPC. The character row lock serialises quest changes per character and
 * the (character, quest) primary key makes a duplicate accept impossible even across processes.
 */
export async function acceptQuest(
  ctx: DomainContext,
  input: { characterId: string; questId: string; npcId: string },
): Promise<QuestView[]> {
  const def = ctx.gameData.quests.get(input.questId);
  if (!def || def.placeholder) throw new DomainError(ErrorCode.NOT_FOUND, 'Unknown quest');
  if (def.giverNpcId !== input.npcId)
    throw new DomainError(ErrorCode.WRONG_NPC, 'This person does not offer that quest');
  await inTransaction(ctx, async (tx) => {
    const character = await lockCharacter(tx, input.characterId);
    const records = new Map(
      (await questRows(tx, input.characterId, true)).map((r) => [r.questId, toRecord(r)]),
    );
    const ok = questAvailability(def, character.level, records);
    if (!ok.ok) {
      throw new DomainError(
        ok.reason === 'ALREADY_COMPLETED'
          ? ErrorCode.QUEST_ALREADY_COMPLETED
          : ErrorCode.QUEST_NOT_AVAILABLE,
        ok.reason === 'ALREADY_ACTIVE'
          ? 'You are already on that quest'
          : ok.reason === 'ALREADY_COMPLETED'
            ? 'You have already completed that quest'
            : 'That quest is not available to you',
        { reason: ok.reason },
      );
    }
    const previous = records.get(def.id);
    if (previous?.status === 'completed' && def.repeatable) {
      await tx
        .update(schema.characterQuests)
        .set({
          status: 'active',
          progress: {},
          acceptedAt: ctx.now(),
          completedAt: null,
          rewardedAt: null,
          turnInId: null,
          version: sql`${schema.characterQuests.version} + 1`,
          updatedAt: ctx.now(),
        })
        .where(
          and(
            eq(schema.characterQuests.characterId, input.characterId),
            eq(schema.characterQuests.questId, def.id),
          ),
        );
      return;
    }
    const inserted = await tx
      .insert(schema.characterQuests)
      .values({
        characterId: input.characterId,
        questId: def.id,
        status: 'active',
        progress: {},
        acceptedAt: ctx.now(),
        updatedAt: ctx.now(),
      })
      .onConflictDoNothing()
      .returning({ questId: schema.characterQuests.questId });
    if (inserted.length === 0)
      throw new DomainError(ErrorCode.QUEST_NOT_AVAILABLE, 'You are already on that quest');
  });
  return getQuestLog(ctx.db, ctx, input.characterId);
}

/**
 * Applies one credited kill to the character's active quests, inside the kill-reward transaction
 * (which is itself exactly-once per kill event), so a kill can never count twice — not on retry,
 * replay, restart or a second realtime node. Returns the quests whose progress changed.
 */
export async function applyKillToQuestsInTx(
  tx: Tx,
  ctx: DomainContext,
  characterId: string,
  enemyId: string,
): Promise<string[]> {
  const changed: string[] = [];
  const rows = (await questRows(tx, characterId, true)).filter((r) => r.status === 'active');
  for (const row of rows) {
    const def = ctx.gameData.quests.get(row.questId);
    if (!def) continue;
    const next = applyKill(def, row.progress, enemyId);
    if (!next) continue;
    await tx
      .update(schema.characterQuests)
      .set({ progress: next, version: row.version + 1, updatedAt: ctx.now() })
      .where(
        and(
          eq(schema.characterQuests.characterId, characterId),
          eq(schema.characterQuests.questId, row.questId),
        ),
      );
    changed.push(row.questId);
  }
  return changed;
}

export interface QuestReward {
  questId: string;
  name: string;
  turnInId: string;
  xpGained: number;
  level: number;
  xp: number;
  xpToNext: number;
  levelsGained: number;
  gold: number;
  /** Reward items (bags or mailbox). */
  items: Item[];
  /** Reward items that did not fit and went to Recovered loot. */
  mailedItems: { itemTemplateId: string; quantity: number }[];
  /** Item rows changed by consuming collect-objective items. */
  consumed: Item[];
}

/**
 * Turns a quest in: validates state, NPC and objectives, consumes required items, pays XP, gold
 * and item rewards and marks the quest completed — all in ONE transaction. A crash or any failure
 * (not enough items, mailbox full, ...) rolls everything back, so there is never a half turn-in;
 * the row lock + `status = 'active'` check make a second turn-in impossible, and reward items carry
 * a unique `source_ref` (`quest:<quest>:<character>:<n>`) as a second guard.
 * The realtime host validates the NPC entity and the player's range before calling this.
 */
export async function turnInQuest(
  ctx: DomainContext,
  input: {
    characterId: string;
    questId: string;
    npcId: string;
    /** Test-only: runs after items are consumed, before rewards (simulates a crash mid-turn-in). */
    afterConsume?: () => Promise<void>;
  },
): Promise<QuestReward> {
  const def = ctx.gameData.quests.get(input.questId);
  if (!def || def.placeholder) throw new DomainError(ErrorCode.NOT_FOUND, 'Unknown quest');
  const curve = ctx.gameData.raw.experienceCurve;
  try {
    return await inTransaction(ctx, async (tx) => {
      const character = await lockCharacter(tx, input.characterId);
      const actor = { accountId: character.accountId, characterId: character.id };
      const [row] = await tx
        .select()
        .from(schema.characterQuests)
        .where(
          and(
            eq(schema.characterQuests.characterId, input.characterId),
            eq(schema.characterQuests.questId, def.id),
          ),
        )
        .for('update');
      const counts = await countCharacterItems(tx, input.characterId, QUEST_ITEM_CONTAINERS);
      const check = turnInCheck(
        def,
        row ? toRecord(row) : undefined,
        input.npcId,
        (id) => counts.get(id) ?? 0,
      );
      if (!check.ok) {
        const map = {
          NOT_ACTIVE: [ErrorCode.QUEST_NOT_ACTIVE, 'You are not on that quest'],
          ALREADY_COMPLETED: [ErrorCode.QUEST_ALREADY_COMPLETED, 'Quest already completed'],
          WRONG_NPC: [ErrorCode.WRONG_NPC, 'Turn this quest in to someone else'],
          OBJECTIVES_INCOMPLETE: [ErrorCode.QUEST_INCOMPLETE, 'Objectives are not complete'],
        } as const;
        const [code, message] = map[check.reason];
        throw new DomainError(code, message);
      }
      const correlationId = uuidv7();

      // 1. Consume required items (re-validated under container + item locks).
      const consumed: ItemRow[] = [];
      for (const o of def.objectives) {
        if (o.kind !== 'collect' || !o.consumeOnTurnIn) continue;
        consumed.push(
          ...(await consumeItemsInTx(tx, ctx, {
            characterId: character.id,
            templateId: o.itemTemplateId,
            quantity: o.count,
            containerKinds: QUEST_ITEM_CONTAINERS,
            actor,
            reason: 'quest_turn_in',
            correlationId,
          })),
        );
      }
      await input.afterConsume?.();

      // 2. XP / level
      const progressed = applyExperience(
        curve,
        { level: character.level, xp: character.xp },
        def.rewards.xp,
      );
      if (def.rewards.xp > 0)
        await tx
          .update(schema.characters)
          .set({ level: progressed.level, xp: progressed.xp, updatedAt: ctx.now() })
          .where(eq(schema.characters.id, character.id));

      // 3. Currency (a failure aborts the turn-in rather than silently dropping the reward)
      let gold = 0;
      for (const c of def.rewards.currency) {
        if (c.amount === 0) continue;
        await adjustBalanceInTx(tx, ctx, {
          currencyId: c.currencyId,
          accountId: character.accountId,
          characterId: character.id,
          delta: c.amount,
          reason: 'quest_reward',
          correlationId,
        });
        if (c.currencyId === 'gold') gold += c.amount;
      }

      // 4. Items: bags first, Recovered loot on overflow (a full mailbox aborts the turn-in).
      const granted: ItemRow[] = [];
      const mailedItems: QuestReward['mailedItems'] = [];
      for (const [n, reward] of def.rewards.items.entries()) {
        const grant = {
          accountId: character.accountId,
          characterId: character.id,
          templateId: reward.itemTemplateId,
          quantity: reward.quantity,
          method: 'quest_reward' as const,
          sourceRef: def.repeatable
            ? `quest:${def.id}:${character.id}:${row!.acceptedAt.toISOString()}:${n}`
            : `quest:${def.id}:${character.id}:${n}`,
          actor,
          correlationId,
        };
        try {
          granted.push(...(await tx.transaction((sp) => grantItemInTx(sp, ctx, grant))).changed);
        } catch (err) {
          if (!(err instanceof DomainError && err.code === ErrorCode.CONTAINER_FULL)) throw err;
          await ensureMailbox(tx, character.accountId, character.id);
          granted.push(
            ...(await grantItemInTx(tx, ctx, { ...grant, containerKind: 'mailbox' })).changed,
          );
          mailedItems.push({ itemTemplateId: reward.itemTemplateId, quantity: reward.quantity });
        }
      }

      // 5. Complete (guarded: only an active row at the version we read can be completed).
      const now = ctx.now();
      const done = await tx
        .update(schema.characterQuests)
        .set({
          status: 'completed',
          completedAt: now,
          rewardedAt: now,
          turnInId: correlationId,
          version: row!.version + 1,
          updatedAt: now,
        })
        .where(
          and(
            eq(schema.characterQuests.characterId, character.id),
            eq(schema.characterQuests.questId, def.id),
            eq(schema.characterQuests.status, 'active'),
            eq(schema.characterQuests.version, row!.version),
          ),
        )
        .returning({ questId: schema.characterQuests.questId });
      if (done.length !== 1)
        throw new DomainError(ErrorCode.QUEST_ALREADY_COMPLETED, 'Quest already completed');

      return {
        questId: def.id,
        name: def.name,
        turnInId: correlationId,
        xpGained: def.rewards.xp,
        level: progressed.level,
        xp: progressed.xp,
        xpToNext: xpToNextLevel(curve, progressed.level),
        levelsGained: progressed.levelsGained,
        gold,
        items: await itemViews(tx, ctx.gameData, granted),
        mailedItems,
        consumed: await itemViews(tx, ctx.gameData, consumed),
      };
    });
  } catch (err) {
    const constraint = err instanceof DomainError ? err.details?.constraint : undefined;
    if (constraint === 'item_instances_source_ref_uq')
      throw new DomainError(ErrorCode.QUEST_ALREADY_COMPLETED, 'Quest already completed');
    throw err;
  }
}

/** Test/admin helper: raw persisted rows (status, progress) for a character. */
export async function questRecords(db: DbOrTx, characterId: string): Promise<QuestRecord[]> {
  return (await questRows(db, characterId)).map(toRecord);
}

/** Called only after zone.npcInteraction has validated range, life and the NPC entity. */
export async function recordNpcTalk(
  ctx: DomainContext,
  characterId: string,
  npcId: string,
): Promise<void> {
  await inTransaction(ctx, async (tx) => {
    await lockCharacter(tx, characterId);
    for (const row of await questRows(tx, characterId, true)) {
      if (row.status !== 'active') continue;
      const def = ctx.gameData.quests.get(row.questId);
      const next = def && applyTalk(def, row.progress, npcId);
      if (!next) continue;
      await tx
        .update(schema.characterQuests)
        .set({ progress: next, version: row.version + 1, updatedAt: ctx.now() })
        .where(
          and(
            eq(schema.characterQuests.characterId, characterId),
            eq(schema.characterQuests.questId, row.questId),
          ),
        );
    }
  });
}

/** SERVER ONLY: no API/message accepts coordinates or completion claims from a client.
 * Caller supplies a sample taken from its owned zone simulation. Visits are personal and
 * idempotent; the character lock serialises this with acceptance, rewards and other progress.
 */
export async function recordExploration(
  ctx: DomainContext,
  input: {
    characterId: string;
    zoneId: string;
    position: { x: number; y: number; z: number };
    health: number;
  },
): Promise<boolean> {
  const zone = ctx.gameData.zones.get(input.zoneId);
  if (!zone) return false;
  return inTransaction(ctx, async (tx) => {
    await lockCharacter(tx, input.characterId);
    let changed = false;
    for (const row of await questRows(tx, input.characterId, true)) {
      if (row.status !== 'active') continue;
      const def = ctx.gameData.quests.get(row.questId);
      const next = def && applyExploration(def, row.progress, zone, input.position, input.health);
      if (!next) continue;
      await tx
        .update(schema.characterQuests)
        .set({ progress: next, version: row.version + 1, updatedAt: ctx.now() })
        .where(
          and(
            eq(schema.characterQuests.characterId, input.characterId),
            eq(schema.characterQuests.questId, row.questId),
          ),
        );
      changed = true;
    }
    return changed;
  });
}
