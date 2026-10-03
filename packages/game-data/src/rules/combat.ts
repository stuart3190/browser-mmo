import type { CombatRules, ExperienceCurve, LootTable, StatBlock } from '@mmo/schemas';
import type { Rng } from './random';
import { randomInt, weightedPick } from './random';

/**
 * Combat formulas — pure, deterministic given an RNG, used ONLY by the server for outcomes.
 * Deliberately simple first-pass rules (see docs/gameplay/combat.md). Balance lives in data.
 */

export interface WeaponProfile {
  min: number;
  max: number;
  attackSpeedMs: number;
}

export interface AttackerProfile {
  level: number;
  /** Effective stats (players: getCharacterStats().total; enemies: {}). */
  stats: StatBlock;
  weapon: WeaponProfile;
}

export interface DefenderProfile {
  level: number;
  armor: number;
}

export type AttackOutcome = 'hit' | 'crit' | 'miss';

export interface AttackResult {
  outcome: AttackOutcome;
  /** Final damage after mitigation (0 on miss, otherwise >= 1). */
  damage: number;
}

/** Effective max health from effective stats. */
export function maxHealthFromStats(rules: CombatRules, stats: StatBlock): number {
  return Math.max(
    1,
    Math.round((stats.max_health ?? 0) + (stats.stamina ?? 0) * rules.healthPerStamina),
  );
}

/** Fraction of incoming physical damage removed by armour (0..maxMitigation). */
export function armorMitigation(rules: CombatRules, armor: number, attackerLevel: number): number {
  if (armor <= 0) return 0;
  const m = armor / (armor + rules.armorConstant + rules.armorPerAttackerLevel * attackerLevel);
  return Math.min(rules.maxMitigation, m);
}

export function hitChance(
  rules: CombatRules,
  attackerLevel: number,
  defenderLevel: number,
): number {
  const c = rules.baseHitChance + (attackerLevel - defenderLevel) * rules.levelHitModifier;
  return Math.min(1, Math.max(0.05, c));
}

export function critChance(rules: CombatRules, stats: StatBlock): number {
  return Math.min(1, rules.baseCritChance + (stats.crit_rating ?? 0) * rules.critPerRating);
}

/** Flat per-swing bonus from strength and attack power. */
export function damageBonus(rules: CombatRules, stats: StatBlock): number {
  return (
    (stats.strength ?? 0) * rules.strengthToDamage +
    (stats.attack_power ?? 0) * rules.attackPowerToDamage
  );
}

/**
 * Resolves one melee swing: hit roll → weapon damage roll + stat bonus → crit → armour.
 * Consumes RNG in a fixed order (hit, damage, crit) so seeded tests are stable.
 */
export function resolveAttack(
  rules: CombatRules,
  attacker: AttackerProfile,
  defender: DefenderProfile,
  rng: Rng,
): AttackResult {
  if (rng.next() >= hitChance(rules, attacker.level, defender.level))
    return { outcome: 'miss', damage: 0 };
  const raw =
    randomInt(rng, Math.floor(attacker.weapon.min), Math.floor(attacker.weapon.max)) +
    damageBonus(rules, attacker.stats);
  const crit = rng.next() < critChance(rules, attacker.stats);
  const afterCrit = crit ? raw * rules.critMultiplier : raw;
  const mitigated = afterCrit * (1 - armorMitigation(rules, defender.armor, attacker.level));
  return { outcome: crit ? 'crit' : 'hit', damage: Math.max(1, Math.round(mitigated)) };
}

/** Server-clock swing timer: may the next swing happen at `nowMs`? */
export function isAttackReady(nextAttackAtMs: number, nowMs: number): boolean {
  return nowMs >= nextAttackAtMs;
}

/** Next allowed swing time after swinging at `nowMs`. Never earlier than the previous schedule. */
export function nextSwingAt(
  previousNextAtMs: number,
  nowMs: number,
  attackSpeedMs: number,
): number {
  return Math.max(previousNextAtMs, nowMs) + attackSpeedMs;
}

export function isInRange(distance: number, range: number, tolerance: number): boolean {
  return distance <= range + tolerance;
}

/** Health after damage, and whether this damage killed (alive → dead transition). */
export function applyDamage(health: number, damage: number): { health: number; killed: boolean } {
  if (health <= 0) return { health: 0, killed: false }; // already dead: no second death
  const next = Math.max(0, health - Math.max(0, damage));
  return { health: next, killed: next === 0 };
}

/** Out-of-combat regeneration amount for one tick. */
export function regenAmount(rules: CombatRules, maxHealth: number, dtMs: number): number {
  return (maxHealth * rules.regenFractionPerSecond * dtMs) / 1000;
}

export function canPlayerRespawn(rules: CombatRules, diedAtMs: number, nowMs: number): boolean {
  return nowMs - diedAtMs >= rules.playerRespawnDelayMs;
}

/** XP for killing an enemy, scaled by level difference; 0 when the enemy is "grey". */
export function xpForKill(
  rules: CombatRules,
  baseXp: number,
  enemyLevel: number,
  playerLevel: number,
  curve: ExperienceCurve,
): number {
  if (playerLevel >= curve.maxLevel) return 0;
  const diff = enemyLevel - playerLevel;
  if (-diff >= rules.greyLevelDifference) return 0;
  const mult = Math.min(
    rules.xpMultiplierMax,
    Math.max(rules.xpMultiplierMin, 1 + diff * rules.xpPerLevelDifference),
  );
  return Math.round(baseXp * mult);
}

export interface LootRoll {
  items: { itemTemplateId: string; quantity: number; rarityId: string | null }[];
  currency: { currencyId: string; amount: number } | null;
}

/** Rolls a loot table (server only). Item instances are created later by the domain layer. */
export function rollLootTable(table: LootTable, rng: Rng): LootRoll {
  const items: LootRoll['items'] = [];
  for (let i = 0; i < table.rolls; i++) {
    if (rng.next() < table.emptyChance) continue;
    const entry = weightedPick(rng, table.entries);
    if (!entry) continue;
    items.push({
      itemTemplateId: entry.itemTemplateId,
      quantity: randomInt(rng, entry.minQuantity, entry.maxQuantity),
      rarityId: entry.rarityId,
    });
  }
  const currency = table.currency
    ? {
        currencyId: table.currency.currencyId,
        amount: randomInt(rng, table.currency.min, table.currency.max),
      }
    : null;
  return { items, currency: currency && currency.amount > 0 ? currency : null };
}
