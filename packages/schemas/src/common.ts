import { z } from 'zod';

/** Any persistent entity ID (UUID, v7 for newly created rows). */
export const UuidSchema = z.uuid();

/**
 * Content IDs identify authored game data (templates, classes, zones...). They are stable,
 * human-readable, dot/underscore separated slugs, e.g. `weapon.sword.iron_longsword`.
 * Content IDs are never reused for a different meaning once shipped.
 */
export const ContentIdSchema = z
  .string()
  .min(2)
  .max(96)
  .regex(/^[a-z0-9]+(?:[._][a-z0-9]+)*$/, 'content id must be lowercase dot/underscore slug');
export type ContentIdString = z.infer<typeof ContentIdSchema>;

/** ISO-8601 timestamp string as transmitted over the wire. */
export const TimestampSchema = z.iso.datetime({ offset: true });

/**
 * Currency and other quantities are integers in the smallest unit. Values stay inside
 * Number.MAX_SAFE_INTEGER on the wire; the database stores them as BIGINT.
 */
export const AmountSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

export const Vec3Schema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  z: z.number().finite(),
});
export type Vec3 = z.infer<typeof Vec3Schema>;

export const LocalizedNameSchema = z.string().min(1).max(120);
