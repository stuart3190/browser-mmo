import { z } from 'zod';
import { ContentIdSchema, UuidSchema } from './common';
import {
  AccountRoleSchema,
  CharacterNameSchema,
  PlayerAccountSchema,
  PlayerCharacterSchema,
} from './character';
import { ItemSchema } from './items';
import { MarketplaceListingSchema } from './economy';

/**
 * HTTP API DTOs (`/v1/...`). Shared by the API service, browser game, admin app and the future
 * companion app. Breaking changes require a new version prefix.
 */

export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string().optional(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

// --- Auth ---------------------------------------------------------------------

export const ClientKindSchema = z.enum(['game_web', 'admin', 'companion_mobile', 'tool']);
export type ClientKind = z.infer<typeof ClientKindSchema>;

export const DevLoginRequestSchema = z.object({
  username: z
    .string()
    .min(3)
    .max(32)
    .regex(/^[a-zA-Z0-9_]+$/),
  client: ClientKindSchema.default('game_web'),
});
export type DevLoginRequest = z.infer<typeof DevLoginRequestSchema>;

export const SessionResponseSchema = z.object({
  token: z.string(),
  expiresAt: z.string(),
  account: PlayerAccountSchema,
});
export type SessionResponse = z.infer<typeof SessionResponseSchema>;

export const MeResponseSchema = z.object({
  account: PlayerAccountSchema,
  role: AccountRoleSchema,
  permissions: z.array(z.string()),
});
export type MeResponse = z.infer<typeof MeResponseSchema>;

// --- Characters ------------------------------------------------------------------

export const CreateCharacterRequestSchema = z.object({
  name: CharacterNameSchema,
  classId: ContentIdSchema,
});
export type CreateCharacterRequest = z.infer<typeof CreateCharacterRequestSchema>;

export const CharacterListResponseSchema = z.object({ characters: z.array(PlayerCharacterSchema) });

// --- Items -----------------------------------------------------------------------

export const MoveItemRequestSchema = z.object({
  itemInstanceId: UuidSchema,
  /** Optimistic concurrency: the version the client last saw. */
  expectedVersion: z.number().int().nonnegative(),
  to: z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal('container'),
      containerId: UuidSchema,
      slot: z.number().int().nonnegative().optional(),
    }),
    z.object({ kind: z.literal('equipped'), slotId: ContentIdSchema }),
  ]),
});
export type MoveItemRequest = z.infer<typeof MoveItemRequestSchema>;

export const SetItemFlagsRequestSchema = z.object({
  itemInstanceId: UuidSchema,
  locked: z.boolean().optional(),
  favourite: z.boolean().optional(),
  junk: z.boolean().optional(),
});

export const ItemResponseSchema = z.object({ item: ItemSchema });

// --- Marketplace -----------------------------------------------------------------

export const CreateListingRequestSchema = z.object({
  characterId: UuidSchema,
  itemInstanceId: UuidSchema,
  price: z.number().int().positive(),
  durationHours: z.number().int().positive(),
});
export type CreateListingRequest = z.infer<typeof CreateListingRequestSchema>;

export const BuyListingRequestSchema = z.object({
  characterId: UuidSchema,
  /** Price the buyer agreed to; rejects if the listing price differs (no bait-and-switch). */
  expectedPrice: z.number().int().positive(),
});

export const ListingsResponseSchema = z.object({ listings: z.array(MarketplaceListingSchema) });
