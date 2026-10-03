import { z } from 'zod';
import {
  CharacterItemsSchema,
  ChatChannelKindSchema,
  ChatMessageTextSchema,
  ClientKindSchema,
  EntityIdSchema,
  ItemSchema,
  PlayerCharacterSchema,
  UuidSchema,
  Vec3Schema,
  WorldEntitySchema,
} from '@mmo/schemas';

/**
 * REALTIME PROTOCOL — version 1
 * =============================
 * Transport: WebSocket, one JSON text frame per message (binary codec may come in a later version).
 * Every frame is an envelope:
 *
 *   { "v": 1, "t": "<type>", "seq"?: number, "ack"?: number, "d": { ...payload } }
 *
 * - `v`   protocol version. The server rejects versions it does not support.
 * - `t`   message type (see the unions below). Unknown types are rejected.
 * - `seq` client→server only: strictly increasing per connection. The server drops any frame
 *         whose seq is not greater than the last one (replay/duplicate protection).
 * - `ack` server→client only: the `seq` of the client request this message answers.
 *
 * Rules:
 * - Clients send INTENT, never outcomes. The server decides positions, pickups, loot, inventory.
 * - The first client frame must be `auth.hello`; anything else closes the socket.
 * - See docs/architecture/realtime.md for the full lifecycle and versioning policy.
 */

export const PROTOCOL_VERSION = 1;
export const SUPPORTED_PROTOCOL_VERSIONS: readonly number[] = [1];
/** Hard cap on inbound frame size (bytes). Larger frames close the connection. */
export const MAX_CLIENT_FRAME_BYTES = 8 * 1024;

const Seq = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

// ---------------------------------------------------------------------------
// Client -> Server
// ---------------------------------------------------------------------------

const clientMsg = <T extends string, D extends z.ZodType>(t: T, d: D) =>
  z.object({ v: z.number().int(), t: z.literal(t), seq: Seq, d });

export const AuthHelloMsg = clientMsg(
  'auth.hello',
  z.object({
    /** Session token from the HTTP API. Sent in the first frame, never in the URL (URLs get logged). */
    token: z.string().min(16).max(128),
    characterId: UuidSchema,
    client: ClientKindSchema,
  }),
);

export const MoveInputMsg = clientMsg(
  'move.input',
  z.object({
    /** Where the client predicts it is. Server validates speed/bounds and may correct. */
    position: Vec3Schema,
    rotationY: z.number().finite(),
  }),
);

export const PickupRequestMsg = clientMsg(
  'interact.pickup',
  z.object({ entityId: EntityIdSchema }),
);

export const ChatSendMsg = clientMsg(
  'chat.send',
  z.object({ channel: z.enum(['say', 'zone']), text: ChatMessageTextSchema }),
);

export const PingMsg = clientMsg('ping', z.object({ clientTime: z.number() }));

export const ClientMessageSchema = z.discriminatedUnion('t', [
  AuthHelloMsg,
  MoveInputMsg,
  PickupRequestMsg,
  ChatSendMsg,
  PingMsg,
]);
export type ClientMessage = z.infer<typeof ClientMessageSchema>;
export type ClientMessageType = ClientMessage['t'];
export type ClientPayload<T extends ClientMessageType> = Extract<ClientMessage, { t: T }>['d'];

// ---------------------------------------------------------------------------
// Server -> Client
// ---------------------------------------------------------------------------

const serverMsg = <T extends string, D extends z.ZodType>(t: T, d: D) =>
  z.object({ v: z.number().int(), t: z.literal(t), ack: Seq.optional(), d });

export const AuthOkMsg = serverMsg(
  'auth.ok',
  z.object({
    connectionId: z.string(),
    entityId: EntityIdSchema,
    character: PlayerCharacterSchema,
    zoneId: z.string(),
    tickHz: z.number().int().positive(),
    serverTime: z.number(),
  }),
);

export const ErrorMsg = serverMsg(
  'error',
  z.object({ code: z.string(), message: z.string(), fatal: z.boolean().default(false) }),
);

/** Full state of everything inside the client's area of interest. Sent on join and zone change. */
export const ZoneSnapshotMsg = serverMsg(
  'zone.snapshot',
  z.object({ zoneId: z.string(), tick: z.number().int(), entities: z.array(WorldEntitySchema) }),
);

export const EntitySpawnMsg = serverMsg('entity.spawn', z.object({ entity: WorldEntitySchema }));

export const EntityDespawnMsg = serverMsg(
  'entity.despawn',
  z.object({
    entityId: EntityIdSchema,
    reason: z.enum(['left', 'out_of_range', 'picked_up', 'died', 'expired']),
  }),
);

/** Batched per-tick world state: positions of entities that changed. Compact tuple form. */
export const EntityMovesMsg = serverMsg(
  'world.moves',
  z.object({
    tick: z.number().int(),
    /** [entityId, x, y, z, rotationY] */
    moves: z.array(z.tuple([EntityIdSchema, z.number(), z.number(), z.number(), z.number()])),
  }),
);

/** Server rejected a movement; the client must snap/reconcile to this authoritative state. */
export const MoveCorrectionMsg = serverMsg(
  'move.correction',
  z.object({ position: Vec3Schema, rotationY: z.number(), reason: z.string() }),
);

export const PresenceMsg = serverMsg(
  'presence.update',
  z.object({
    event: z.enum(['joined', 'left']),
    characterId: UuidSchema,
    name: z.string(),
    zoneId: z.string(),
  }),
);

export const InventorySnapshotMsg = serverMsg(
  'inventory.snapshot',
  z.object({ items: CharacterItemsSchema }),
);

/** Items whose state changed (created, moved, stacked). Clients upsert by instance id. */
export const InventoryUpdatedMsg = serverMsg(
  'inventory.updated',
  z.object({
    reason: z.enum(['pickup', 'move', 'loot', 'trade', 'marketplace', 'admin']),
    items: z.array(ItemSchema),
  }),
);

export const ChatMessageMsg = serverMsg(
  'chat.message',
  z.object({
    channel: ChatChannelKindSchema,
    from: z.object({ characterId: UuidSchema.nullable(), name: z.string() }),
    text: z.string(),
    sentAt: z.number(),
  }),
);

/** Placeholder: party state push. Shape reserved; not emitted until parties exist. */
export const PartyUpdateMsg = serverMsg(
  'party.update',
  z.object({
    partyId: UuidSchema.nullable(),
    members: z.array(z.object({ characterId: UuidSchema, name: z.string(), online: z.boolean() })),
  }),
);

/** Placeholder: trade window state push. Shape reserved; not emitted until trading exists. */
export const TradeUpdateMsg = serverMsg(
  'trade.update',
  z.object({ tradeId: UuidSchema, status: z.string(), revision: z.number().int() }),
);

export const PongMsg = serverMsg(
  'pong',
  z.object({ clientTime: z.number(), serverTime: z.number() }),
);

export const ServerMessageSchema = z.discriminatedUnion('t', [
  AuthOkMsg,
  ErrorMsg,
  ZoneSnapshotMsg,
  EntitySpawnMsg,
  EntityDespawnMsg,
  EntityMovesMsg,
  MoveCorrectionMsg,
  PresenceMsg,
  InventorySnapshotMsg,
  InventoryUpdatedMsg,
  ChatMessageMsg,
  PartyUpdateMsg,
  TradeUpdateMsg,
  PongMsg,
]);
export type ServerMessage = z.infer<typeof ServerMessageSchema>;
export type ServerMessageType = ServerMessage['t'];
export type ServerPayload<T extends ServerMessageType> = z.input<
  Extract<(typeof ServerMessageSchema.options)[number], { shape: { t: z.ZodLiteral<T> } }>
>['d'];
