import { and, asc, eq, gt, inArray, lte, sql } from 'drizzle-orm';
import { schema } from '@mmo/db';
import type { DbOrTx, Tx } from '@mmo/db';
import {
  applyExperience,
  maxHealthFromStats,
  rollLootTable,
  xpForKill,
  xpToNextLevel,
} from '@mmo/game-data';
import type { WeaponProfile } from '@mmo/game-data';
import type { Item, StatBlock } from '@mmo/schemas';
import { DomainError, ErrorCode } from '@mmo/shared';
import type { DomainContext } from './context';
import { ensureMailbox } from './containers';
import { adjustBalanceInTx } from './currency';
import { applyKillToQuestsInTx } from './quests';
import { grantItemInTx } from './items';
import type { ItemRow } from './items';
import { itemViews } from './mappers';
import { getCharacterStats } from './stats';
import { inTransaction } from './tx';

/** Everything the zone simulation needs to fight as this character (all server-derived). */
export interface CombatProfile {
  characterId: string;
  /** Persisted class (set at creation; the client never supplies it during play). */
  classId: string;
  level: number;
  xp: number;
  xpToNext: number;
  stats: StatBlock;
  maxHealth: number;
  /** Persisted health (null in DB = full). */
  health: number;
  weapon: WeaponProfile & { templateId: string | null };
  /** Persisted, possibly still running ability cooldowns (epoch ms). */
  abilityCooldowns: Record<string, number>;
}

/**
 * Builds a character's combat profile from persisted, already-validated state: effective stats
 * (class + level + equipment) and the weapon actually equipped in the main hand. Because equip
 * validation (class/proficiency/level) happens in moveItem, an unusable weapon can never be here.
 */
export async function getCombatProfile(
  db: DbOrTx,
  ctx: DomainContext,
  characterId: string,
): Promise<CombatProfile> {
  const [character] = await db
    .select()
    .from(schema.characters)
    .where(eq(schema.characters.id, characterId));
  if (!character) throw new DomainError(ErrorCode.NOT_FOUND, 'Character not found');
  const stats = (await getCharacterStats(db, ctx, characterId)).total;
  const [mainHand] = await db
    .select({ templateId: schema.itemInstances.templateId })
    .from(schema.itemInstances)
    .where(
      and(
        eq(schema.itemInstances.locationKind, 'equipped'),
        eq(schema.itemInstances.equipCharacterId, characterId),
        eq(schema.itemInstances.equipSlot, 'main_hand'),
      ),
    );
  const rules = ctx.gameData.raw.combatRules;
  const weaponBlock = mainHand
    ? ctx.gameData.template(mainHand.templateId).equipment?.weapon
    : null;
  const weapon = weaponBlock
    ? {
        min: weaponBlock.minDamage,
        max: weaponBlock.maxDamage,
        attackSpeedMs: weaponBlock.attackSpeedMs,
        templateId: mainHand!.templateId,
      }
    : {
        min: rules.unarmed.damage.min,
        max: rules.unarmed.damage.max,
        attackSpeedMs: rules.unarmed.attackSpeedMs,
        templateId: null,
      };
  const maxHealth = maxHealthFromStats(rules, stats);
  return {
    characterId,
    classId: character.classId,
    abilityCooldowns: character.abilityCooldowns,
    level: character.level,
    xp: character.xp,
    xpToNext: xpToNextLevel(ctx.gameData.raw.experienceCurve, character.level),
    stats,
    maxHealth,
    health: Math.min(maxHealth, character.currentHealth ?? maxHealth),
    weapon,
  };
}

/** Persists cooldowns that are still running (on leaving the world); expired ones are dropped. */
export async function saveAbilityCooldowns(
  db: DbOrTx,
  characterId: string,
  cooldowns: Record<string, number>,
  nowMs: number,
): Promise<void> {
  const running = Object.fromEntries(Object.entries(cooldowns).filter(([, t]) => t > nowMs));
  await db
    .update(schema.characters)
    .set({ abilityCooldowns: running })
    .where(eq(schema.characters.id, characterId));
}

/** Persists current health (called on disconnect and periodically, like position). */
export async function saveCharacterHealth(
  db: DbOrTx,
  characterId: string,
  health: number,
): Promise<void> {
  await db
    .update(schema.characters)
    .set({ currentHealth: Math.max(0, Math.round(health)) })
    .where(eq(schema.characters.id, characterId));
}

export interface KillReward {
  killId: string;
  characterId: string;
  enemyId: string;
  xpGained: number;
  level: number;
  xp: number;
  xpToNext: number;
  levelsGained: number;
  /** Every item row whose state changed (bag stacks and/or mailbox deliveries). */
  items: Item[];
  gold: number;
  /** Drops that did not fit the bags and were delivered to the mailbox ("Recovered loot"). */
  mailedItems: { itemTemplateId: string; quantity: number }[];
  /** Quests whose kill progress this kill advanced (same transaction, so exactly once). */
  questsProgressed: string[];
}

export interface AwardKillInput {
  killId: string;
  characterId: string;
  enemyId: string;
  zoneId: string;
  shareCount?: number;
  receivesLoot?: boolean;
}

/**
 * Awards XP, gold and loot for one enemy death to one character inside an existing transaction.
 *
 * The character row is locked, XP/level are applied with the shared experience rules, the loot
 * table is rolled with the server RNG, items are minted through the single creation path
 * (`grantItemInTx`, source_ref `kill:<kill>:<character>:<n>`, provenance correlated by killId) and
 * gold goes through the currency ledger. The `kill_rewards` primary key (kill_id, character_id)
 * makes any duplicate attempt fail and roll back.
 *
 * Loot is never lost: a drop that does not fit the bags (savepoint, so no partial stack merge) is
 * delivered to the character's mailbox instead. If even the mailbox is full the whole transaction
 * fails with CONTAINER_FULL, so the durable kill event stays pending and is retried later.
 */
export async function awardKillInTx(
  tx: Tx,
  ctx: DomainContext,
  input: AwardKillInput,
): Promise<KillReward> {
  const enemy = ctx.gameData.enemies.get(input.enemyId);
  if (!enemy) throw new DomainError(ErrorCode.VALIDATION_FAILED, `Unknown enemy ${input.enemyId}`);
  const rules = ctx.gameData.raw.combatRules;
  const curve = ctx.gameData.raw.experienceCurve;
  const [character] = await tx
    .select()
    .from(schema.characters)
    .where(eq(schema.characters.id, input.characterId))
    .for('update');
  if (!character || character.deletedAt)
    throw new DomainError(ErrorCode.NOT_FOUND, 'Character not found');
  const actor = { accountId: character.accountId, characterId: character.id };

  // XP / level
  const xpGained = Math.floor(
    xpForKill(rules, enemy.xpReward, enemy.level, character.level, curve) / (input.shareCount ?? 1),
  );
  const progressed = applyExperience(curve, { level: character.level, xp: character.xp }, xpGained);
  if (xpGained > 0) {
    await tx
      .update(schema.characters)
      .set({ level: progressed.level, xp: progressed.xp, updatedAt: ctx.now() })
      .where(eq(schema.characters.id, character.id));
  }

  // Loot (bags first, mailbox on overflow)
  const table = enemy.lootTableId ? ctx.gameData.lootTables.get(enemy.lootTableId) : undefined;
  const roll =
    table && input.receivesLoot !== false
      ? rollLootTable(table, ctx.rng)
      : { items: [], currency: null };
  const changed: ItemRow[] = [];
  const mailedItems: KillReward['mailedItems'] = [];
  for (const [n, drop] of roll.items.entries()) {
    const grant = {
      accountId: character.accountId,
      characterId: character.id,
      templateId: drop.itemTemplateId,
      quantity: drop.quantity,
      ...(drop.rarityId ? { rarityId: drop.rarityId } : {}),
      method: 'loot_drop' as const,
      sourceRef: `kill:${input.killId}:${character.id}:${n}`,
      actor,
      correlationId: input.killId,
    };
    try {
      const res = await tx.transaction((sp) => grantItemInTx(sp, ctx, grant));
      changed.push(...res.changed);
    } catch (err) {
      if (!(err instanceof DomainError && err.code === ErrorCode.CONTAINER_FULL)) throw err;
      await ensureMailbox(tx, character.accountId, character.id);
      // Not caught: a full mailbox aborts the reward so the kill event is retried, never lost.
      const res = await grantItemInTx(tx, ctx, { ...grant, containerKind: 'mailbox' });
      changed.push(...res.changed);
      mailedItems.push({ itemTemplateId: drop.itemTemplateId, quantity: drop.quantity });
    }
  }
  let gold = 0;
  if (roll.currency) {
    try {
      await tx.transaction((sp) =>
        adjustBalanceInTx(sp, ctx, {
          currencyId: roll.currency!.currencyId,
          accountId: character.accountId,
          characterId: character.id,
          delta: roll.currency!.amount,
          reason: 'loot',
          correlationId: input.killId,
        }),
      );
      gold = roll.currency.amount;
    } catch (err) {
      if (!(err instanceof DomainError)) throw err; // wallet cap reached: skip gold
    }
  }

  // Quest kill objectives advance in the same exactly-once transaction.
  const questsProgressed = await applyKillToQuestsInTx(tx, ctx, character.id, enemy.id);

  // Exactly-once marker (PK violation => whole transaction rolls back).
  await tx.insert(schema.killRewards).values({
    killId: input.killId,
    characterId: character.id,
    enemyId: enemy.id,
    zoneId: input.zoneId,
    xp: xpGained,
    levelBefore: character.level,
    levelAfter: progressed.level,
    gold,
    itemCount: roll.items.length,
    lostItemCount: 0,
    occurredAt: ctx.now(),
  });

  return {
    killId: input.killId,
    characterId: character.id,
    enemyId: enemy.id,
    xpGained,
    level: progressed.level,
    xp: progressed.xp,
    xpToNext: xpToNextLevel(curve, progressed.level),
    levelsGained: progressed.levelsGained,
    items: await itemViews(tx, ctx.gameData, changed),
    gold,
    mailedItems,
    questsProgressed,
  };
}

function mapAlreadyClaimed(err: unknown): unknown {
  const constraint = err instanceof DomainError ? err.details?.constraint : undefined;
  if (
    constraint === 'kill_rewards_kill_id_character_id_pk' ||
    constraint === 'item_instances_source_ref_uq'
  ) {
    return new DomainError(ErrorCode.ALREADY_CLAIMED, 'Reward for this kill was already granted');
  }
  return err;
}

/** Awards one kill directly (no outbox). Duplicate attempts fail with ALREADY_CLAIMED. */
export async function awardKill(ctx: DomainContext, input: AwardKillInput): Promise<KillReward> {
  try {
    return await inTransaction(ctx, (tx) => awardKillInTx(tx, ctx, input));
  } catch (err) {
    throw mapAlreadyClaimed(err);
  }
}

// ---------------------------------------------------------------------------
// Durable kill events (outbox)
// ---------------------------------------------------------------------------

export interface KillEventRecord {
  killId: string;
  zoneId: string;
  enemyId: string;
  spawnPointId: string;
  groupId: string | null;
  characterId: string;
  recipients?: string[];
  lootCharacterId?: string;
  diedAt: Date;
  respawnAt: Date;
}

/**
 * Write-ahead step: durably records an enemy death. Idempotent (a retried write after a lost
 * acknowledgement is a no-op). The zone only makes the death visible after this succeeds.
 */
export async function recordKill(db: DbOrTx, event: KillEventRecord): Promise<void> {
  await db
    .insert(schema.killEvents)
    .values({ ...event, status: 'pending', nextAttemptAt: event.diedAt })
    .onConflictDoNothing({ target: schema.killEvents.killId });
}

export type ProcessKillResult =
  | { status: 'rewarded'; reward: KillReward; rewards: KillReward[] }
  /** Already rewarded or voided earlier (or by a concurrent processor that just finished). */
  | { status: 'done' }
  /** Another processor holds the event right now; it will finish it. */
  | { status: 'busy' }
  /** No such event. */
  | { status: 'missing' }
  /** Permanently unrewardable (character deleted, unknown enemy); recorded, never retried. */
  | { status: 'void'; error: string }
  /** Transient failure; the event stays pending and is retried at nextAttemptAt. */
  | { status: 'retry'; error: string; nextAttemptAt: Date };

const MAX_BACKOFF_MS = 5 * 60_000;

/** Retry delay after `attempts` failures: 1 s, 2 s, 4 s ... capped at 5 minutes. */
export function killRetryDelayMs(attempts: number): number {
  return Math.min(MAX_BACKOFF_MS, 1000 * 2 ** Math.max(0, attempts - 1));
}

/**
 * Applies the rewards of one recorded kill exactly once.
 *
 * The event row is locked with FOR UPDATE SKIP LOCKED, so concurrent processors (two realtime
 * nodes, the live pipeline racing startup recovery) never both work on it; the reward and the
 * `rewarded` status commit in the same transaction, so a crash at any point leaves the event either
 * untouched-and-pending or fully done. `kill_rewards` and item source refs remain as a second
 * line of defence.
 */
export async function processKillEvent(
  ctx: DomainContext,
  killId: string,
): Promise<ProcessKillResult> {
  try {
    return await inTransaction(ctx, async (tx): Promise<ProcessKillResult> => {
      const [event] = await tx
        .select()
        .from(schema.killEvents)
        .where(eq(schema.killEvents.killId, killId))
        .for('update', { skipLocked: true });
      if (!event) {
        const [exists] = await tx
          .select({ status: schema.killEvents.status })
          .from(schema.killEvents)
          .where(eq(schema.killEvents.killId, killId));
        return exists ? { status: 'busy' } : { status: 'missing' };
      }
      if (event.status !== 'pending') return { status: 'done' };
      const markDone = (status: 'rewarded' | 'void', error: string | null = null) =>
        tx
          .update(schema.killEvents)
          .set({
            status,
            attempts: event.attempts + 1,
            processedAt: ctx.now(),
            lastError: error,
          })
          .where(eq(schema.killEvents.killId, killId));
      const recipients = event.recipients ?? [event.characterId];
      const lootOwner = event.lootCharacterId ?? event.characterId;
      if (recipients.length === 0) {
        await markDone('rewarded');
        return { status: 'done' };
      }
      if (
        recipients.length < 1 ||
        recipients.length > 5 ||
        new Set(recipients).size !== recipients.length ||
        !recipients.includes(lootOwner)
      )
        throw new DomainError(ErrorCode.VALIDATION_FAILED, 'Invalid kill reward recipients');
      const existing = await tx
        .select()
        .from(schema.killRewards)
        .where(eq(schema.killRewards.killId, killId));
      if (existing.length) {
        // All party rewards commit together. A partial pre-existing group is corruption, not success.
        if (
          existing.length !== recipients.length ||
          !existing.every((r) => recipients.includes(r.characterId))
        )
          throw new Error('Partial kill reward set requires investigation');
        await markDone('rewarded');
        return { status: 'done' };
      }
      const rewards: KillReward[] = [];
      // Stable character lock order for overlapping group kills.
      for (const characterId of [...recipients].sort())
        rewards.push(
          await awardKillInTx(tx, ctx, {
            killId,
            characterId,
            enemyId: event.enemyId,
            zoneId: event.zoneId,
            shareCount: recipients.length,
            receivesLoot: characterId === lootOwner,
          }),
        );
      await markDone('rewarded');
      return { status: 'rewarded', reward: rewards[0]!, rewards };
    });
  } catch (err) {
    const mapped = mapAlreadyClaimed(err);
    const message = mapped instanceof Error ? mapped.message : String(mapped);
    const permanent =
      mapped instanceof DomainError &&
      (mapped.code === ErrorCode.NOT_FOUND || mapped.code === ErrorCode.VALIDATION_FAILED);
    if (mapped instanceof DomainError && mapped.code === ErrorCode.ALREADY_CLAIMED) {
      await ctx.db
        .update(schema.killEvents)
        .set({ status: 'rewarded', processedAt: ctx.now() })
        .where(and(eq(schema.killEvents.killId, killId), eq(schema.killEvents.status, 'pending')));
      return { status: 'done' };
    }
    const [row] = await ctx.db
      .update(schema.killEvents)
      .set(
        permanent
          ? {
              status: 'void',
              attempts: sql`${schema.killEvents.attempts} + 1`,
              lastError: message,
              processedAt: ctx.now(),
            }
          : {
              attempts: sql`${schema.killEvents.attempts} + 1`,
              lastError: message,
              nextAttemptAt: sql`now() + make_interval(secs => least(${MAX_BACKOFF_MS / 1000}, power(2, ${schema.killEvents.attempts})))`,
            },
      )
      .where(and(eq(schema.killEvents.killId, killId), eq(schema.killEvents.status, 'pending')))
      .returning({ nextAttemptAt: schema.killEvents.nextAttemptAt });
    if (permanent) return { status: 'void', error: message };
    return { status: 'retry', error: message, nextAttemptAt: row?.nextAttemptAt ?? ctx.now() };
  }
}

/** Pending kill events whose next attempt is due (recovery sweep / startup recovery). */
export async function dueKillEvents(
  db: DbOrTx,
  opts: { now: Date; limit?: number; zoneIds?: string[] },
): Promise<string[]> {
  const rows = await db
    .select({ killId: schema.killEvents.killId })
    .from(schema.killEvents)
    .where(
      and(
        eq(schema.killEvents.status, 'pending'),
        lte(schema.killEvents.nextAttemptAt, opts.now),
        opts.zoneIds ? inArray(schema.killEvents.zoneId, opts.zoneIds) : undefined,
      ),
    )
    .orderBy(asc(schema.killEvents.nextAttemptAt))
    .limit(opts.limit ?? 100);
  return rows.map((r) => r.killId);
}

/**
 * Spawn slots still waiting to respawn in a zone: used to rebuild population state after a
 * restart so recorded deaths are not resurrected early.
 */
export async function activeRespawns(
  db: DbOrTx,
  zoneId: string,
  now: Date,
): Promise<{ spawnPointId: string; groupId: string | null; respawnAtMs: number }[]> {
  const rows = await db
    .select({
      spawnPointId: schema.killEvents.spawnPointId,
      groupId: schema.killEvents.groupId,
      respawnAt: schema.killEvents.respawnAt,
    })
    .from(schema.killEvents)
    .where(and(eq(schema.killEvents.zoneId, zoneId), gt(schema.killEvents.respawnAt, now)));
  return rows.map((r) => ({
    spawnPointId: r.spawnPointId,
    groupId: r.groupId,
    respawnAtMs: r.respawnAt.getTime(),
  }));
}
