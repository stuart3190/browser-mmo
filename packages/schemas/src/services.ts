import { z } from 'zod';
import { ContentIdSchema } from './common';
const stack = z.strictObject({
  itemTemplateId: ContentIdSchema,
  quantity: z.number().int().min(1).max(100),
});
/** Immediate, atomic item exchanges only. No arbitrary scripts or live-state effects. */
export const ServiceOfferSchema = z.strictObject({
  id: ContentIdSchema,
  name: z.string().min(1).max(80),
  npcId: ContentIdSchema,
  kind: z.enum(['buy', 'sell', 'craft']),
  minLevel: z.number().int().min(1),
  inputs: z.array(stack).max(8),
  output: stack.nullable(),
  copper: z.number().int().min(-100000).max(100000),
});
export const DungeonEntrySchema = z.strictObject({
  id: ContentIdSchema,
  name: z.string().min(1).max(80),
  locationId: ContentIdSchema,
  enemyIds: z.array(ContentIdSchema).min(1),
  recommendedLevel: z.number().int().min(1),
  mode: z.enum(['shared_world', 'private_instance']),
  description: z.string().min(1).max(500),
});
export type ServiceOffer = z.infer<typeof ServiceOfferSchema>;
