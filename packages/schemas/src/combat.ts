import { z } from 'zod';

/**
 * Combat data shapes (data-driven; numbers live in @mmo/game-data, formulas in
 * @mmo/game-data/src/rules/combat.ts). Only what the combat foundation needs: melee auto-attack,
 * health, death, respawn, simple enemy AI. No abilities, resources, threat or effects yet.
 */

export const DamageRangeSchema = z
  .object({ min: z.number().int().nonnegative(), max: z.number().int().nonnegative() })
  .refine((r) => r.min <= r.max, 'min must be <= max');

/** Per-enemy combat block. Enemies without one are not simulated as combatants. */
export const EnemyCombatSchema = z.object({
  /** Optional stationary wind-up; range and line of sight are rechecked before the strike. */
  windupMs: z.number().int().min(500).max(5000).optional(),
  damage: DamageRangeSchema,
  attackSpeedMs: z.number().int().positive(),
  /** Metres between centres at which the enemy can hit. */
  attackRange: z.number().positive(),
  /** Metres at which an idle enemy notices a player. 0 = only fights back when attacked. */
  aggroRange: z.number().nonnegative(),
  /** Max distance from its spawn point before it gives up and resets. */
  leashRange: z.number().positive(),
  moveSpeed: z.number().positive(),
  armor: z.number().int().nonnegative(),
  /** How long the corpse stays visible before the spawn point's respawn timer takes over. */
  corpseMs: z.number().int().nonnegative(),
});
export type EnemyCombat = z.infer<typeof EnemyCombatSchema>;

/** Global combat tunables (one object in game data). */
export const CombatRulesSchema = z.object({
  /** Weapon used when nothing is equipped in the main hand. */
  unarmed: z.object({ damage: DamageRangeSchema, attackSpeedMs: z.number().int().positive() }),
  /** Shared lockout after using any (non-auto-attack) ability, so abilities cannot be chained in one tick. */
  abilityGlobalCooldownMs: z.number().int().nonnegative().default(1000),
  /** Melee reach of player auto-attacks (metres, centre to centre). */
  playerMeleeRange: z.number().positive(),
  /** Server-side slack added to range checks for latency/interpolation. */
  rangeTolerance: z.number().nonnegative(),
  /** Base chance to hit (0..1) between equal levels; ±levelHitModifier per level of difference. */
  baseHitChance: z.number().min(0).max(1),
  levelHitModifier: z.number().min(0).max(1),
  baseCritChance: z.number().min(0).max(1),
  /** Crit chance added per point of crit_rating. */
  critPerRating: z.number().min(0),
  critMultiplier: z.number().min(1),
  /** Damage bonus = strength * strengthToDamage + attack_power * attackPowerToDamage (flat per swing). */
  strengthToDamage: z.number().min(0),
  attackPowerToDamage: z.number().min(0),
  /** Mitigation = armor / (armor + armorConstant + armorPerAttackerLevel * attackerLevel), capped. */
  armorConstant: z.number().positive(),
  armorPerAttackerLevel: z.number().min(0),
  maxMitigation: z.number().min(0).max(0.95),
  /** Effective max health = max_health stat + stamina * healthPerStamina. */
  healthPerStamina: z.number().min(0),
  /** Out-of-combat regeneration: fraction of max health per second after this delay. */
  regenDelayMs: z.number().int().nonnegative(),
  regenFractionPerSecond: z.number().min(0).max(1),
  /** Seconds a player is "in combat" after dealing/taking damage. */
  combatTimeoutMs: z.number().int().positive(),
  /** Delay before a dead player may respawn, and health fraction on respawn. */
  playerRespawnDelayMs: z.number().int().nonnegative(),
  playerRespawnHealthFraction: z.number().min(0.01).max(1),
  /** XP: no XP when the player is this many levels above the enemy. */
  greyLevelDifference: z.number().int().positive(),
  /** XP multiplier per level the enemy is above (+) or below (−) the player, clamped. */
  xpPerLevelDifference: z.number().min(0),
  xpMultiplierMin: z.number().min(0),
  xpMultiplierMax: z.number().min(1),
});
export type CombatRules = z.infer<typeof CombatRulesSchema>;

/** Effective combat inputs for one player, computed server-side from DB state. */
export const CombatProfileSchema = z.object({
  level: z.number().int().min(1),
  weapon: z.object({
    min: z.number(),
    max: z.number(),
    attackSpeedMs: z.number().int().positive(),
    templateId: z.string().nullable(),
  }),
});
