import { z } from 'zod';
import { TimestampSchema, UuidSchema } from './common';

/**
 * Social placeholders. Shapes exist so API contracts for the game client and the future mobile
 * companion app can be designed together. None of these systems is implemented yet.
 */

export const GuildRankSchema = z.object({
  id: z.string().max(32),
  name: z.string().max(32),
  order: z.number().int(),
  permissions: z.array(
    z.enum(['invite', 'kick', 'promote', 'vault_deposit', 'vault_withdraw', 'edit_motd']),
  ),
});

export const GuildSchema = z.object({
  id: UuidSchema,
  name: z.string().min(3).max(32),
  tag: z.string().min(2).max(5),
  leaderCharacterId: UuidSchema,
  ranks: z.array(GuildRankSchema),
  motd: z.string().max(500),
  createdAt: TimestampSchema,
  placeholder: z.literal(true),
});
export type Guild = z.infer<typeof GuildSchema>;

export const FriendshipSchema = z.object({
  /** Friendships are account-level so they survive alt characters. */
  accountId: UuidSchema,
  friendAccountId: UuidSchema,
  status: z.enum(['pending_outgoing', 'pending_incoming', 'accepted', 'blocked']),
  createdAt: TimestampSchema,
  placeholder: z.literal(true),
});
export type Friendship = z.infer<typeof FriendshipSchema>;

export const PartySchema = z.object({
  id: UuidSchema,
  leaderCharacterId: UuidSchema,
  memberCharacterIds: z.array(UuidSchema).max(5),
  lootRule: z.enum(['free_for_all', 'round_robin', 'need_before_greed', 'master_loot']),
  placeholder: z.literal(true),
});
export type Party = z.infer<typeof PartySchema>;

export const ChatChannelKindSchema = z.enum([
  'say',
  'zone',
  'party',
  'guild',
  'trade',
  'whisper',
  'system',
]);
export type ChatChannelKind = z.infer<typeof ChatChannelKindSchema>;

export const ChatChannelSchema = z.object({
  id: z.string().max(64),
  kind: ChatChannelKindSchema,
  name: z.string().max(64),
  placeholder: z.literal(true),
});
export type ChatChannel = z.infer<typeof ChatChannelSchema>;

export const ChatMessageTextSchema = z.string().min(1).max(500);

export const DirectMessageSchema = z.object({
  id: UuidSchema,
  fromAccountId: UuidSchema,
  toAccountId: UuidSchema,
  body: ChatMessageTextSchema,
  sentAt: TimestampSchema,
  readAt: TimestampSchema.nullable(),
  placeholder: z.literal(true),
});
export type DirectMessage = z.infer<typeof DirectMessageSchema>;
