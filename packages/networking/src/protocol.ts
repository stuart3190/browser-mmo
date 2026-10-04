import { z } from 'zod';
import {
  CharacterItemsSchema,
  CharacterStatsSchema,
  CurrencyBalanceSchema,
  ChatChannelKindSchema,
  ContentIdSchema,
  ChatMessageTextSchema,
  ClientKindSchema,
  EntityIdSchema,
  ItemSchema,
  PlayerCharacterSchema,
  QuestViewSchema,
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

/** Select (or clear, with null) the current target. The server validates it exists and is visible. */
export const TargetSetMsg = clientMsg(
  'target.set',
  z.object({ entityId: EntityIdSchema.nullable() }),
);

/**
 * Start/stop auto-attacking the current target. Starting is validated (hostile, alive, in range,
 * attacker alive). Swing timing and every outcome are decided by the server tick; repeated starts
 * never reset or shorten the swing timer.
 */
export const CombatAttackMsg = clientMsg('combat.attack', z.object({ start: z.boolean() }));

/** Ask to respawn after death. Granted only once the server-side respawn delay has passed. */
export const CombatRespawnMsg = clientMsg('combat.respawn', z.object({}));

/**
 * Talk to an NPC entity. The server checks the entity is an NPC in the player's zone, the player
 * is alive and in range, and answers with `npc.dialogue` (or an error).
 */
export const NpcInteractMsg = clientMsg('npc.interact', z.object({ entityId: EntityIdSchema }));

/** Accept a quest offered by the NPC entity the player is standing next to. */
export const QuestAcceptMsg = clientMsg(
  'quest.accept',
  z.object({ entityId: EntityIdSchema, questId: ContentIdSchema }),
);

/** Turn a quest in at the NPC entity the player is standing next to. */
export const QuestTurnInMsg = clientMsg(
  'quest.turn_in',
  z.object({ entityId: EntityIdSchema, questId: ContentIdSchema }),
);

/**
 * Use an ability on the current server-side target. The server checks class, level, cooldown
 * (server clock), target, range and line of sight, and computes the outcome itself.
 */
export const AbilityUseMsg = clientMsg('ability.use', z.object({ abilityId: ContentIdSchema }));

export const ClientMessageSchema = z.discriminatedUnion('t', [
  AbilityUseMsg,
  NpcInteractMsg,
  QuestAcceptMsg,
  QuestTurnInMsg,
  AuthHelloMsg,
  MoveInputMsg,
  PickupRequestMsg,
  ChatSendMsg,
  PingMsg,
  TargetSetMsg,
  CombatAttackMsg,
  CombatRespawnMsg,
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

/**
 * Items whose state changed. Clients upsert `items` by instance id and drop `removed` ids
 * (items that left this character's view: sold, listed, moved to another character, destroyed).
 * Both carry the item `version`; clients must ignore anything older than what they hold, because
 * HTTP responses and pushes can arrive in either order.
 * `reason: 'sync'` = pushed from the database change feed (any server write path).
 */
export const InventoryUpdatedMsg = serverMsg(
  'inventory.updated',
  z.object({
    reason: z.enum(['pickup', 'move', 'loot', 'trade', 'marketplace', 'admin', 'sync']),
    items: z.array(ItemSchema),
    removed: z
      .array(z.object({ id: UuidSchema, version: z.number().int().nonnegative() }))
      .default([]),
  }),
);

/** Authoritative effective stats (class base + equipment). Sent on join and after equipment changes. */
export const CharacterStatsMsg = serverMsg(
  'character.stats',
  z.object({ characterId: UuidSchema, stats: CharacterStatsSchema }),
);

/** Wallet balances visible to the character. Sent on join and whenever a balance changes. */
export const WalletUpdatedMsg = serverMsg(
  'wallet.updated',
  z.object({ balances: z.array(CurrencyBalanceSchema) }),
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

// ---- Combat (protocol v1 additions, 2026-10-03) -------------------------------------------

/** The player's own targeting/auto-attack state (sent on every change). */
export const CombatStateMsg = serverMsg(
  'combat.state',
  z.object({
    targetId: EntityIdSchema.nullable(),
    attacking: z.boolean(),
    reason: z.enum([
      'target_set',
      'target_cleared',
      'started',
      'stopped',
      'target_dead',
      'target_lost',
      'out_of_range',
      'you_died',
      'respawned',
    ]),
  }),
);

/** One resolved swing, sent to everyone who can see the target. */
export const CombatDamageMsg = serverMsg(
  'combat.damage',
  z.object({
    sourceId: EntityIdSchema,
    targetId: EntityIdSchema,
    outcome: z.enum(['hit', 'crit', 'miss']),
    amount: z.number().int().nonnegative(),
    targetHealth: z.number().int().nonnegative(),
    targetMaxHealth: z.number().int().positive(),
    /** The ability that dealt it (null/absent for auto-attack swings and enemy attacks). */
    abilityId: ContentIdSchema.nullable().optional(),
  }),
);

/**
 * The player's abilities as the server sees them: which are unlocked for their class and level,
 * and when each is ready again (server clock — convert with the auth.ok serverTime offset).
 * Sent on join/resync, after every ability use and when a level-up unlocks something.
 */
export const AbilityStateMsg = serverMsg(
  'ability.state',
  z.object({
    abilities: z.array(
      z.object({
        abilityId: ContentIdSchema,
        unlocked: z.boolean(),
        readyAt: z.number(),
      }),
    ),
    globalReadyAt: z.number(),
    serverTime: z.number(),
    /** Abilities that just became available (level-up). */
    newlyUnlocked: z.array(ContentIdSchema),
  }),
);

/** Health change not caused by a swing (regen, respawn, evade reset, level-up, gear change). */
export const EntityHealthMsg = serverMsg(
  'entity.health',
  z.object({
    entityId: EntityIdSchema,
    health: z.number().int().nonnegative(),
    maxHealth: z.number().int().positive(),
    dead: z.boolean(),
  }),
);

export const CombatDeathMsg = serverMsg(
  'combat.death',
  z.object({
    entityId: EntityIdSchema,
    kind: z.enum(['player', 'enemy']),
    killerId: EntityIdSchema.nullable(),
  }),
);

/** The player's own vitals. `respawnAvailableAt` is server epoch ms (display only). */
export const PlayerVitalsMsg = serverMsg(
  'player.vitals',
  z.object({
    health: z.number().int().nonnegative(),
    maxHealth: z.number().int().positive(),
    dead: z.boolean(),
    inCombat: z.boolean(),
    respawnAvailableAt: z.number().nullable(),
  }),
);

/** XP/level after a server-side award (or on join, with xpGained 0). */
export const CharacterProgressMsg = serverMsg(
  'character.progress',
  z.object({
    level: z.number().int().min(1),
    xp: z.number().int().nonnegative(),
    xpToNext: z.number().int().nonnegative(),
    xpGained: z.number().int().nonnegative(),
    levelsGained: z.number().int().nonnegative(),
  }),
);

/** Loot notification for one kill. Items also arrive through inventory.updated. */
export const CombatLootMsg = serverMsg(
  'combat.loot',
  z.object({
    killId: UuidSchema,
    enemyName: z.string(),
    items: z.array(ItemSchema),
    gold: z.number().int().nonnegative(),
    /** Drops that did not fit the bags and were delivered to the mailbox ("Recovered loot"). */
    mailedItems: z.array(
      z.object({ itemTemplateId: z.string(), quantity: z.number().int().positive() }),
    ),
    /** True when the reward was completed by crash/failure recovery rather than immediately. */
    recovered: z.boolean(),
  }),
);

export const PongMsg = serverMsg(
  'pong',
  z.object({ clientTime: z.number(), serverTime: z.number() }),
);

/** What an NPC says now, with the quest actions the server would accept. */
export const NpcDialogueMsg = serverMsg(
  'npc.dialogue',
  z.object({
    entityId: EntityIdSchema,
    npcId: ContentIdSchema,
    name: z.string(),
    title: z.string().nullable(),
    greeting: z.string(),
    quests: z.array(
      z.object({
        quest: QuestViewSchema,
        line: z.string(),
        action: z.enum(['accept', 'turn_in']).nullable(),
      }),
    ),
  }),
);

/**
 * The character's full quest log (authoritative; replaces the client's copy). Sent on join,
 * after resyncs and whenever something changed; `events` says what changed since the last one.
 */
export const QuestLogMsg = serverMsg(
  'quest.log',
  z.object({
    quests: z.array(QuestViewSchema),
    events: z.array(
      z.object({
        kind: z.enum(['accepted', 'progress', 'objective_complete', 'ready', 'completed']),
        questId: ContentIdSchema,
        objectiveId: z.string().nullable(),
      }),
    ),
  }),
);

/** Reward notification for a turned-in quest (XP also arrives as `character.progress`). */
export const QuestCompletedMsg = serverMsg(
  'quest.completed',
  z.object({
    questId: ContentIdSchema,
    name: z.string(),
    xpGained: z.number().int().nonnegative(),
    gold: z.number().int().nonnegative(),
    items: z.array(ItemSchema),
    mailedItems: z.array(
      z.object({ itemTemplateId: z.string(), quantity: z.number().int().positive() }),
    ),
  }),
);

export const ServerMessageSchema = z.discriminatedUnion('t', [
  AbilityStateMsg,
  NpcDialogueMsg,
  QuestLogMsg,
  QuestCompletedMsg,
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
  CharacterStatsMsg,
  WalletUpdatedMsg,
  ChatMessageMsg,
  PartyUpdateMsg,
  TradeUpdateMsg,
  PongMsg,
  CombatStateMsg,
  CombatDamageMsg,
  EntityHealthMsg,
  CombatDeathMsg,
  PlayerVitalsMsg,
  CharacterProgressMsg,
  CombatLootMsg,
]);
export type ServerMessage = z.infer<typeof ServerMessageSchema>;
export type ServerMessageType = ServerMessage['t'];
export type ServerPayload<T extends ServerMessageType> = z.input<
  Extract<(typeof ServerMessageSchema.options)[number], { shape: { t: z.ZodLiteral<T> } }>
>['d'];
