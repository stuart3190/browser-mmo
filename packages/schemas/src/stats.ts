import { z } from 'zod';

/**
 * Stat keys used by characters, items and modifiers. Adding a key is safe. Removing or renaming
 * one requires a data migration because item instances persist rolled stats.
 */
export const StatKeySchema = z.enum([
  // Primary
  'strength',
  'agility',
  'intellect',
  'stamina',
  'spirit',
  // Defensive
  'armor',
  'block',
  'dodge',
  // Offensive
  'attack_power',
  'spell_power',
  'crit_rating',
  'haste_rating',
  // Resources
  'max_health',
  'max_mana',
  // Utility
  'movement_speed',
]);
export type StatKey = z.infer<typeof StatKeySchema>;

/** Sparse stat block. Missing keys mean zero. */
export const StatBlockSchema = z.partialRecord(StatKeySchema, z.number().finite());
export type StatBlock = z.infer<typeof StatBlockSchema>;

/** A min/max range used by templates for rolled stats. */
export const StatRangeSchema = z
  .object({ min: z.number().finite(), max: z.number().finite() })
  .refine((r) => r.min <= r.max, 'min must be <= max');
export type StatRange = z.infer<typeof StatRangeSchema>;
