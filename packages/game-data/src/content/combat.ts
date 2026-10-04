import type { CombatRules } from '@mmo/schemas';

/**
 * Global combat tunables. First-pass placeholder numbers (not balanced). Formulas that use them
 * are in src/rules/combat.ts and documented in docs/gameplay/combat.md.
 */
export const combatRules: CombatRules = {
  unarmed: { damage: { min: 1, max: 3 }, attackSpeedMs: 2000 },
  abilityGlobalCooldownMs: 1000,
  playerMeleeRange: 3.5,
  rangeTolerance: 0.75,
  baseHitChance: 0.95,
  levelHitModifier: 0.02,
  baseCritChance: 0.05,
  critPerRating: 0.002,
  critMultiplier: 1.5,
  strengthToDamage: 0.5,
  attackPowerToDamage: 0.25,
  armorConstant: 100,
  armorPerAttackerLevel: 20,
  maxMitigation: 0.75,
  healthPerStamina: 2,
  regenDelayMs: 5000,
  regenFractionPerSecond: 0.03,
  combatTimeoutMs: 5000,
  playerRespawnDelayMs: 3000,
  playerRespawnHealthFraction: 1,
  greyLevelDifference: 5,
  xpPerLevelDifference: 0.1,
  xpMultiplierMin: 0.5,
  xpMultiplierMax: 1.5,
};
