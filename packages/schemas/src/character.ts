import { z } from 'zod';
import { Roles } from '@mmo/shared';
import {
  ContentIdSchema,
  LocalizedNameSchema,
  TimestampSchema,
  UuidSchema,
  Vec3Schema,
} from './common';
import { StatBlockSchema } from './stats';

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

export const AccountRoleSchema = z.enum(Roles);
export type AccountRole = z.infer<typeof AccountRoleSchema>;

export const AccountStatusSchema = z.enum(['active', 'suspended', 'banned']);

/** A player account. One account owns many characters and one shared account vault. */
export const PlayerAccountSchema = z.object({
  id: UuidSchema,
  username: z
    .string()
    .min(3)
    .max(32)
    .regex(/^[a-zA-Z0-9_]+$/),
  displayName: z.string().min(1).max(64),
  role: AccountRoleSchema,
  status: AccountStatusSchema,
  createdAt: TimestampSchema,
});
export type PlayerAccount = z.infer<typeof PlayerAccountSchema>;

// ---------------------------------------------------------------------------
// Classes, specialisations, abilities, skills (authored game data)
// ---------------------------------------------------------------------------

export const CombatRoleSchema = z.enum(['melee', 'ranged', 'magic', 'healer', 'support', 'tank']);
export type CombatRole = z.infer<typeof CombatRoleSchema>;

export const ResourceTypeSchema = z.enum(['mana', 'rage', 'energy', 'focus']);

export const AbilityTargetingSchema = z.enum([
  'self',
  'enemy',
  'ally',
  'ground',
  'cone',
  'aoe_self',
]);

/**
 * Ability definition. Only the data shape exists; there is NO combat implementation yet.
 * `effects` is intentionally opaque so the combat system can define its own effect grammar later.
 */
export const AbilityDefinitionSchema = z.object({
  id: ContentIdSchema,
  name: LocalizedNameSchema,
  description: z.string().max(500),
  targeting: AbilityTargetingSchema,
  rangeMeters: z.number().nonnegative(),
  cooldownMs: z.number().int().nonnegative(),
  castTimeMs: z.number().int().nonnegative(),
  resourceCost: z.number().int().nonnegative(),
  unlockLevel: z.number().int().min(1),
  effects: z.array(z.record(z.string(), z.unknown())).default([]),
});
export type AbilityDefinition = z.infer<typeof AbilityDefinitionSchema>;

/** Non-combat skills (gathering, crafting professions...). Placeholder shape. */
export const SkillDefinitionSchema = z.object({
  id: ContentIdSchema,
  name: LocalizedNameSchema,
  kind: z.enum(['gathering', 'crafting', 'secondary']),
  maxRank: z.number().int().positive(),
});
export type SkillDefinition = z.infer<typeof SkillDefinitionSchema>;

export const CharacterSpecialisationSchema = z.object({
  id: ContentIdSchema,
  classId: ContentIdSchema,
  name: LocalizedNameSchema,
  roles: z.array(CombatRoleSchema).min(1),
  unlockLevel: z.number().int().min(1),
  abilityIds: z.array(ContentIdSchema),
  /** Placeholder classes/specs are not final design. */
  placeholder: z.boolean().default(true),
});
export type CharacterSpecialisation = z.infer<typeof CharacterSpecialisationSchema>;

export const CharacterClassSchema = z.object({
  id: ContentIdSchema,
  name: LocalizedNameSchema,
  description: z.string().max(500),
  resource: ResourceTypeSchema,
  baseStats: StatBlockSchema,
  statsPerLevel: StatBlockSchema,
  /** Equipment type IDs (see game-data equipment types) the class may wear/wield. */
  armorProficiencies: z.array(ContentIdSchema),
  weaponProficiencies: z.array(ContentIdSchema),
  baseAbilityIds: z.array(ContentIdSchema),
  specialisationIds: z.array(ContentIdSchema),
  placeholder: z.boolean().default(true),
});
export type CharacterClass = z.infer<typeof CharacterClassSchema>;

// ---------------------------------------------------------------------------
// Progression
// ---------------------------------------------------------------------------

/** Data-driven experience curve. */
export const ExperienceCurveSchema = z.object({
  maxLevel: z.number().int().min(1),
  /** xpToNext(level) = round(base * level^exponent) */
  base: z.number().positive(),
  exponent: z.number().positive(),
});
export type ExperienceCurve = z.infer<typeof ExperienceCurveSchema>;

export const ExperienceSchema = z.object({
  level: z.number().int().min(1),
  /** XP accumulated inside the current level. */
  xp: z.number().int().nonnegative(),
});
export type Experience = z.infer<typeof ExperienceSchema>;

/** Fully derived stats for a character (base + level + equipment). Computed, never stored as truth. */
export const CharacterStatsSchema = z.object({
  base: StatBlockSchema,
  fromEquipment: StatBlockSchema,
  total: StatBlockSchema,
});
export type CharacterStats = z.infer<typeof CharacterStatsSchema>;

export const SkillProgressSchema = z.object({
  skillId: ContentIdSchema,
  rank: z.number().int().nonnegative(),
});

// ---------------------------------------------------------------------------
// Characters
// ---------------------------------------------------------------------------

export const CharacterNameSchema = z
  .string()
  .min(3)
  .max(20)
  .regex(/^[A-Za-z][A-Za-z']*$/, 'letters and apostrophes only, starting with a letter');

export const PlayerCharacterSchema = z.object({
  id: UuidSchema,
  accountId: UuidSchema,
  name: CharacterNameSchema,
  classId: ContentIdSchema,
  specialisationId: ContentIdSchema.nullable(),
  level: z.number().int().min(1),
  xp: z.number().int().nonnegative(),
  zoneId: ContentIdSchema,
  position: Vec3Schema,
  createdAt: TimestampSchema,
});
export type PlayerCharacter = z.infer<typeof PlayerCharacterSchema>;
