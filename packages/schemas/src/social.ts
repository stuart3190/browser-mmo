import { z } from 'zod';
import { TimestampSchema, UuidSchema } from './common';

/**
 * Account-wide friends and direct messages share contracts with future companion clients.
 * Guilds remain placeholders; the party core is implemented by the authoritative zone.
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
  friendName: z.string().min(1).max(64),
  unread: z.number().int().nonnegative(),
  status: z.enum(['pending_outgoing', 'pending_incoming', 'accepted', 'blocked']),
  createdAt: TimestampSchema,
});
export type Friendship = z.infer<typeof FriendshipSchema>;

export const PartySchema = z.object({
  id: UuidSchema,
  leaderCharacterId: UuidSchema,
  memberCharacterIds: z.array(UuidSchema).max(5),
  lootRule: z.literal('round_robin'),
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

export const ChatMessageTextSchema = z.string().trim().min(1).max(500);

export const DirectMessageSchema = z.object({
  id: UuidSchema,
  fromAccountId: UuidSchema,
  fromCharacterId: UuidSchema,
  fromName: z.string().min(1).max(64),
  toAccountId: UuidSchema,
  body: ChatMessageTextSchema,
  sentAt: TimestampSchema,
  readAt: TimestampSchema.nullable(),
});
export type DirectMessage = z.infer<typeof DirectMessageSchema>;

export const FriendActionSchema = z.enum(['accept', 'remove', 'block', 'unblock']);
export type FriendAction = z.infer<typeof FriendActionSchema>;
export const SendDirectMessageSchema = z
  .object({ id: UuidSchema, body: ChatMessageTextSchema })
  .strict();
