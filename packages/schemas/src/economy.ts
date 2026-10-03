import { z } from 'zod';
import {
  AmountSchema,
  ContentIdSchema,
  LocalizedNameSchema,
  TimestampSchema,
  UuidSchema,
} from './common';

// ---------------------------------------------------------------------------
// Currencies
// ---------------------------------------------------------------------------

export const CurrencyDefinitionSchema = z.object({
  id: ContentIdSchema, // e.g. 'gold'
  name: LocalizedNameSchema,
  /** Account-wide currencies are shared by all characters; others are per character. */
  scope: z.enum(['account', 'character']),
  /** Hard cap per wallet. Prevents overflow and limits blast radius of exploits. */
  maxBalance: AmountSchema,
  tradeable: z.boolean(),
  /** Display: number of minor units per major unit, e.g. 100 copper = 1 silver. */
  displayDivisor: z.number().int().positive(),
});
export type CurrencyDefinition = z.infer<typeof CurrencyDefinitionSchema>;

export const CurrencyBalanceSchema = z.object({
  currencyId: ContentIdSchema,
  ownerAccountId: UuidSchema,
  ownerCharacterId: UuidSchema.nullable(),
  amount: AmountSchema,
});
export type CurrencyBalance = z.infer<typeof CurrencyBalanceSchema>;

export const CurrencyLedgerReasonSchema = z.enum([
  'seed',
  'starter_grant',
  'admin_adjustment',
  'marketplace_listing_fee',
  'marketplace_sale_proceeds',
  'marketplace_purchase',
  'trade',
  'vendor',
  'loot',
  'quest_reward',
]);

export type CurrencyLedgerReason = z.infer<typeof CurrencyLedgerReasonSchema>;

/** Append-only record of every balance change. Sum of deltas must equal the balance. */
export const CurrencyLedgerEntrySchema = z.object({
  id: UuidSchema,
  currencyId: ContentIdSchema,
  ownerAccountId: UuidSchema,
  ownerCharacterId: UuidSchema.nullable(),
  delta: z.number().int(),
  balanceAfter: AmountSchema,
  reason: CurrencyLedgerReasonSchema,
  correlationId: UuidSchema.nullable(),
  occurredAt: TimestampSchema,
});
export type CurrencyLedgerEntry = z.infer<typeof CurrencyLedgerEntrySchema>;

// ---------------------------------------------------------------------------
// Player-to-player trade (model only; trade flow not implemented yet)
// ---------------------------------------------------------------------------

export const TradeStatusSchema = z.enum([
  'open', // both sides editing offers
  'locked', // both clicked "lock"; offers frozen
  'completed',
  'cancelled',
  'expired',
]);

export const TradeOfferSchema = z.object({
  characterId: UuidSchema,
  itemInstanceIds: z.array(UuidSchema).max(12),
  currency: z.array(z.object({ currencyId: ContentIdSchema, amount: AmountSchema })),
  locked: z.boolean(),
  accepted: z.boolean(),
});

export const TradeSchema = z.object({
  id: UuidSchema,
  status: TradeStatusSchema,
  initiator: TradeOfferSchema,
  counterparty: TradeOfferSchema,
  /** Incremented whenever either offer changes; acceptance is tied to a revision to stop bait-and-switch. */
  revision: z.number().int().nonnegative(),
  createdAt: TimestampSchema,
  completedAt: TimestampSchema.nullable(),
});
export type Trade = z.infer<typeof TradeSchema>;

// ---------------------------------------------------------------------------
// Marketplace
// ---------------------------------------------------------------------------

export const ListingStatusSchema = z.enum(['active', 'sold', 'cancelled', 'expired']);
export type ListingStatus = z.infer<typeof ListingStatusSchema>;

export const MarketplaceListingSchema = z.object({
  id: UuidSchema,
  sellerAccountId: UuidSchema,
  sellerCharacterId: UuidSchema,
  itemInstanceId: UuidSchema,
  templateId: ContentIdSchema,
  rarityId: ContentIdSchema,
  quantity: z.number().int().min(1),
  currencyId: ContentIdSchema,
  /** Total buyout price for the whole quantity. */
  price: AmountSchema,
  /** Non-refundable deposit charged at listing time. */
  listingFee: AmountSchema,
  status: ListingStatusSchema,
  createdAt: TimestampSchema,
  expiresAt: TimestampSchema,
  closedAt: TimestampSchema.nullable(),
});
export type MarketplaceListing = z.infer<typeof MarketplaceListingSchema>;

export const MarketplaceTransactionSchema = z.object({
  id: UuidSchema,
  listingId: UuidSchema,
  itemInstanceId: UuidSchema,
  sellerAccountId: UuidSchema,
  buyerAccountId: UuidSchema,
  buyerCharacterId: UuidSchema,
  currencyId: ContentIdSchema,
  price: AmountSchema,
  /** Sale fee (cut) removed from the seller's proceeds. Currency sink. */
  saleFee: AmountSchema,
  sellerProceeds: AmountSchema,
  occurredAt: TimestampSchema,
});
export type MarketplaceTransaction = z.infer<typeof MarketplaceTransactionSchema>;

/** Tunable marketplace rules (game data). */
export const MarketplaceRulesSchema = z.object({
  currencyId: ContentIdSchema,
  listingDurationsHours: z.array(z.number().int().positive()).min(1),
  /** Listing fee = max(minListingFee, price * listingFeeBps / 10000). */
  listingFeeBps: z.number().int().min(0).max(10_000),
  minListingFee: AmountSchema,
  /** Sale cut = floor(price * saleFeeBps / 10000). */
  saleFeeBps: z.number().int().min(0).max(10_000),
  maxActiveListingsPerAccount: z.number().int().positive(),
  minPrice: AmountSchema,
});
export type MarketplaceRules = z.infer<typeof MarketplaceRulesSchema>;

/** Generic audit/fraud log record for economy-sensitive actions. */
export const AuditLogEntrySchema = z.object({
  id: UuidSchema,
  actorAccountId: UuidSchema.nullable(),
  action: z.string().max(64),
  targetType: z.string().max(32),
  targetId: z.string().max(64),
  requestId: z.string().max(64).nullable(),
  details: z.record(z.string(), z.unknown()),
  occurredAt: TimestampSchema,
});
export type AuditLogEntry = z.infer<typeof AuditLogEntrySchema>;
