import { and, eq } from 'drizzle-orm';
import { schema } from '@mmo/db';
import type { DbOrTx } from '@mmo/db';
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
import { adjustBalanceInTx } from './currency';
import { grantItemInTx } from './items';
import type { ItemRow } from './items';
import { itemViews } from './mappers';
import { getCharacterStats } from './stats';
import { inTransaction } from './tx';

/** Everything the zone simulation needs to fight as this character (all server-derived). */
export interface CombatProfile {
  characterId: string;
  level: number;
  xp: number;
  xpToNext: number;
  stats: StatBlock;
  maxHealth: number;
  /** Persisted health (null in DB = full). */
  health: number;
  weapon: WeaponProfile & { templateId: string | null };
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
    level: character.level,
    xp: character.xp,
    xpToNext: xpToNextLevel(ctx.gameData.raw.experienceCurve, character.level),
    stats,
    maxHealth,
    health: Math.min(maxHealth, character.currentHealth ?? maxHealth),
    weapon,
  };
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
  items: Item[];
  gold: number;
  /** Items that could not be placed (bags full). There is no corpse looting yet, so they are lost. */
  lostItems: { itemTemplateId: string; quantity: number }[];
}

/**
 * Awards XP, gold and loot for one enemy death to one character — exactly once.
 *
 * Everything happens in one transaction: the character row is locked, XP/level are applied with the
 * shared experience rules, the loot table is rolled with the server RNG, items are minted through
 * the single creation path (`grantItemInTx`, source_ref `kill:<kill>:<character>:<n>`, provenance
 * correlated by killId) and gold goes through the currency ledger. The `kill_rewards` primary key
 * (kill_id, character_id) makes any duplicate attempt fail with ALREADY_CLAIMED and roll back.
 * Items that do not fit are skipped via savepoints (no partial stack merges) and reported as lost.
 */
export async function awardKill(
  ctx: DomainContext,
  input: { killId: string; characterId: string; enemyId: string; zoneId: string },
): Promise<KillReward> {
  const enemy = ctx.gameData.enemies.get(input.enemyId);
  if (!enemy) throw new DomainError(ErrorCode.VALIDATION_FAILED, `Unknown enemy ${input.enemyId}`);
  const rules = ctx.gameData.raw.combatRules;
  const curve = ctx.gameData.raw.experienceCurve;
  try {
    return await inTransaction(ctx, async (tx) => {
      const [character] = await tx
        .select()
        .from(schema.characters)
        .where(eq(schema.characters.id, input.characterId))
        .for('update');
      if (!character || character.deletedAt)
        throw new DomainError(ErrorCode.NOT_FOUND, 'Character not found');
      const actor = { accountId: character.accountId, characterId: character.id };

      // XP / level
      const xpGained = xpForKill(rules, enemy.xpReward, enemy.level, character.level, curve);
      const progressed = applyExperience(
        curve,
        { level: character.level, xp: character.xp },
        xpGained,
      );
      if (xpGained > 0) {
        await tx
          .update(schema.characters)
          .set({ level: progressed.level, xp: progressed.xp, updatedAt: ctx.now() })
          .where(eq(schema.characters.id, character.id));
      }

      // Loot
      const table = enemy.lootTableId ? ctx.gameData.lootTables.get(enemy.lootTableId) : undefined;
      const roll = table ? rollLootTable(table, ctx.rng) : { items: [], currency: null };
      const changed: ItemRow[] = [];
      const lostItems: KillReward['lostItems'] = [];
      for (const [n, drop] of roll.items.entries()) {
        try {
          const res = await tx.transaction((sp) =>
            grantItemInTx(sp, ctx, {
              accountId: character.accountId,
              characterId: character.id,
              templateId: drop.itemTemplateId,
              quantity: drop.quantity,
              ...(drop.rarityId ? { rarityId: drop.rarityId } : {}),
              method: 'loot_drop',
              sourceRef: `kill:${input.killId}:${character.id}:${n}`,
              actor,
              correlationId: input.killId,
            }),
          );
          changed.push(...res.changed);
        } catch (err) {
          if (err instanceof DomainError && err.code === ErrorCode.CONTAINER_FULL) {
            lostItems.push({ itemTemplateId: drop.itemTemplateId, quantity: drop.quantity });
            continue;
          }
          throw err;
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
        itemCount: roll.items.length - lostItems.length,
        lostItemCount: lostItems.length,
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
        lostItems,
      };
    });
  } catch (err) {
    const constraint = err instanceof DomainError ? err.details?.constraint : undefined;
    if (
      constraint === 'kill_rewards_kill_id_character_id_pk' ||
      constraint === 'item_instances_source_ref_uq'
    ) {
      throw new DomainError(ErrorCode.ALREADY_CLAIMED, 'Reward for this kill was already granted');
    }
    throw err;
  }
}
