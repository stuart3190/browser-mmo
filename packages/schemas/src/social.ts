import { z } from 'zod';
import { TimestampSchema, UuidSchema } from './common';

/** Persistent character guilds; parties continue to belong to the authoritative zone. */
export const GuildNameSchema = z
  .string()
  .trim()
  .min(3)
  .max(32)
  .regex(/^[A-Za-z][A-Za-z0-9 '’-]*[A-Za-z0-9]$/);
export const GuildTagSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{2,5}$/);
export const GuildRoleSchema = z.enum(['leader', 'officer', 'member']);
export const GuildSchema = z.object({
  id: UuidSchema,
  name: GuildNameSchema,
  tag: GuildTagSchema,
  leaderCharacterId: UuidSchema,
  motd: z.string().max(500),
  createdAt: TimestampSchema,
});
export type Guild = z.infer<typeof GuildSchema>;
export const GuildMemberSchema = z.object({
  characterId: UuidSchema,
  name: z.string(),
  level: z.number().int(),
  classId: z.string(),
  role: GuildRoleSchema,
  joinedAt: TimestampSchema,
});
export const GuildInvitationSchema = z.object({
  guildId: UuidSchema,
  name: z.string(),
  tag: z.string(),
  expiresAt: TimestampSchema,
});
export const GuildStateSchema = z.object({
  guild: GuildSchema.nullable(),
  members: z.array(GuildMemberSchema),
  invitations: z.array(GuildInvitationSchema),
});
export type GuildState = z.infer<typeof GuildStateSchema>;
export const GuildMemberActionSchema = z.enum(['remove', 'promote', 'demote', 'transfer']);
export type GuildMemberAction = z.infer<typeof GuildMemberActionSchema>;

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

export const GuildMessageSchema = z.object({
  id: UuidSchema,
  guildId: UuidSchema,
  fromCharacterId: UuidSchema,
  fromName: z.string(),
  body: ChatMessageTextSchema,
  sentAt: TimestampSchema,
});
export type GuildMessage = z.infer<typeof GuildMessageSchema>;
