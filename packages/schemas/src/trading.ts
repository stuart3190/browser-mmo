import { z } from 'zod';
import { AmountSchema, TimestampSchema, UuidSchema } from './common';
import { ItemSchema } from './items';

export const TradeOfferInputSchema = z
  .object({
    items: z.array(z.object({ id: UuidSchema, version: z.number().int().nonnegative() })).max(12),
    copper: AmountSchema,
  })
  .strict();
export type TradeOfferInput = z.infer<typeof TradeOfferInputSchema>;

export const TradeSideSchema = z.object({
  characterId: UuidSchema,
  name: z.string(),
  items: z.array(ItemSchema).max(12),
  copper: AmountSchema,
  locked: z.boolean(),
  accepted: z.boolean(),
});
export type TradeSide = z.infer<typeof TradeSideSchema>;

export const DirectTradeSchema = z.object({
  id: UuidSchema,
  revision: z.number().int().nonnegative(),
  status: z.enum(['open', 'locked', 'completed', 'cancelled', 'expired']),
  sides: z.tuple([TradeSideSchema, TradeSideSchema]),
  createdAt: TimestampSchema,
  expiresAt: TimestampSchema,
  completedAt: TimestampSchema.nullable(),
});
export type DirectTrade = z.infer<typeof DirectTradeSchema>;

export const TradeActionSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('offer'),
      revision: z.number().int().nonnegative(),
      offer: TradeOfferInputSchema,
    })
    .strict(),
  z
    .object({
      action: z.enum(['lock', 'confirm', 'cancel']),
      revision: z.number().int().nonnegative(),
    })
    .strict(),
]);
export type TradeAction = z.infer<typeof TradeActionSchema>;
