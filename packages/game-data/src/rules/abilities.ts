import type { AbilityDefinition, CombatRules } from '@mmo/schemas';
import type { GameData } from '../registry';
import { armorMitigation, critChance, hitChance } from './combat';
import type { AttackResult, AttackerProfile, DefenderProfile } from './combat';
import type { Rng } from './random';
import { randomInt } from './random';

/**
 * Ability rules — pure, used by the server (authoritative) and the client (display only).
 * First-pass formulas, not balanced (docs/gameplay/classes.md).
 */

/** A class's bar, in slot order (locked abilities included; check `abilityAvailability`). */
export function classAbilities(gameData: GameData, classId: string): AbilityDefinition[] {
  const cls = gameData.classes.get(classId);
  if (!cls) return [];
  return cls.baseAbilityIds
    .map((id) => gameData.abilities.get(id))
    .filter((a): a is AbilityDefinition => a !== undefined);
}

export type AbilityAvailability =
  { ok: true } | { ok: false; reason: 'UNKNOWN' | 'WRONG_CLASS' | 'LOCKED' | 'NOT_IMPLEMENTED' };

/** May a character of this class and level use the ability at all (ignoring cooldown/target)? */
export function abilityAvailability(
  gameData: GameData,
  abilityId: string,
  classId: string,
  level: number,
): AbilityAvailability {
  const a = gameData.abilities.get(abilityId);
  if (!a) return { ok: false, reason: 'UNKNOWN' };
  const cls = gameData.classes.get(classId);
  if (!cls || !cls.baseAbilityIds.includes(a.id) || (a.classId !== null && a.classId !== classId))
    return { ok: false, reason: 'WRONG_CLASS' };
  if (a.placeholder) return { ok: false, reason: 'NOT_IMPLEMENTED' };
  if (level < a.unlockLevel) return { ok: false, reason: 'LOCKED' };
  return { ok: true };
}

/** Abilities that become usable when going from `fromLevel` to `toLevel`. */
export function newlyUnlockedAbilities(
  gameData: GameData,
  classId: string,
  fromLevel: number,
  toLevel: number,
): AbilityDefinition[] {
  return classAbilities(gameData, classId).filter(
    (a) => !a.placeholder && a.unlockLevel > fromLevel && a.unlockLevel <= toLevel,
  );
}

/**
 * Server-clock cooldown check. `readyAtMs` is the ability's own cooldown, `globalReadyAtMs` the
 * shared global cooldown. Client-supplied times are never involved.
 */
export function cooldownRemainingMs(
  readyAtMs: number,
  globalReadyAtMs: number,
  nowMs: number,
): number {
  return Math.max(0, readyAtMs - nowMs, globalReadyAtMs - nowMs);
}

/** New cooldown state after using `ability` at `nowMs`. */
export function startCooldown(
  rules: CombatRules,
  ability: AbilityDefinition,
  nowMs: number,
): { readyAtMs: number; globalReadyAtMs: number } {
  return {
    readyAtMs: nowMs + ability.cooldownMs,
    globalReadyAtMs: nowMs + rules.abilityGlobalCooldownMs,
  };
}

/** Pre-mitigation damage before the random rolls are applied (for tooltips/tests). */
export function abilityScalingBonus(
  ability: AbilityDefinition,
  stats: Record<string, number | undefined>,
): number {
  let bonus = 0;
  for (const [stat, perPoint] of Object.entries(ability.damage?.scaling ?? {}))
    bonus += (stats[stat] ?? 0) * perPoint;
  return bonus;
}

/**
 * Resolves one damaging ability use:
 *   raw = base roll + weapon roll × weaponMultiplier + Σ stat × scaling
 *   hit roll as for melee; crit as for melee; physical damage is reduced by armour,
 *   magic damage is not (no resistances yet). Minimum 1 on a hit.
 * RNG order: hit, base, weapon (only if weaponMultiplier > 0), crit.
 */
export function resolveAbility(
  rules: CombatRules,
  ability: AbilityDefinition,
  attacker: AttackerProfile,
  defender: DefenderProfile,
  rng: Rng,
): AttackResult {
  const dmg = ability.damage;
  if (!dmg) throw new Error(`ability ${ability.id} has no damage`);
  if (rng.next() >= hitChance(rules, attacker.level, defender.level))
    return { outcome: 'miss', damage: 0 };
  let raw = randomInt(rng, Math.floor(dmg.base.min), Math.floor(dmg.base.max));
  if (dmg.weaponMultiplier > 0)
    raw +=
      randomInt(rng, Math.floor(attacker.weapon.min), Math.floor(attacker.weapon.max)) *
      dmg.weaponMultiplier;
  raw += abilityScalingBonus(ability, attacker.stats);
  const crit = rng.next() < critChance(rules, attacker.stats);
  const afterCrit = crit ? raw * rules.critMultiplier : raw;
  const mitigated =
    dmg.school === 'physical'
      ? afterCrit * (1 - armorMitigation(rules, defender.armor, attacker.level))
      : afterCrit;
  return { outcome: crit ? 'crit' : 'hit', damage: Math.max(1, Math.round(mitigated)) };
}
