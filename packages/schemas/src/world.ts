import { z } from 'zod';
import { ContentIdSchema, LocalizedNameSchema, UuidSchema, Vec3Schema } from './common';
import { EnemyCombatSchema } from './combat';

/**
 * World structure (see docs/world/world-architecture.md)
 *
 *   World ─┬─ Region (a kingdom, a frozen north...)    — content grouping, theming, map
 *          └─ Zone   (one continuous coordinate space) — UNIT OF SIMULATION (one zone sim)
 *               └─ Chunk (square tile of the zone)     — UNIT OF STREAMING + INTEREST
 *
 * Coordinates: metres, Y up. Chunk (cx, cz) covers x ∈ [cx*size, (cx+1)*size), z likewise.
 */

export const ZoneKindSchema = z.enum([
  'town',
  'wilderness',
  'cave',
  'dungeon',
  'raid',
  'arena', // PvP later
  'housing', // later
]);
export type ZoneKind = z.infer<typeof ZoneKindSchema>;

export const WorldRegionSchema = z.object({
  id: ContentIdSchema,
  name: LocalizedNameSchema,
  description: z.string().max(500),
  levelRange: z.object({ min: z.number().int().min(1), max: z.number().int().min(1) }),
  zoneIds: z.array(ContentIdSchema).min(1),
  /** Theme tags for art/audio direction, e.g. 'medieval', 'corrupted', 'frozen'. */
  themes: z.array(z.string().max(32)),
});
export type WorldRegion = z.infer<typeof WorldRegionSchema>;

/** A link that moves a player from one zone to another (door, portal, road edge). */
export const ZoneTransitionSchema = z.object({
  id: ContentIdSchema,
  /** Trigger volume centre and radius in this zone. */
  position: Vec3Schema,
  radius: z.number().positive(),
  targetZoneId: ContentIdSchema,
  targetPosition: Vec3Schema,
});

export const WorldZoneSchema = z.object({
  id: ContentIdSchema,
  regionId: ContentIdSchema,
  name: LocalizedNameSchema,
  kind: ZoneKindSchema,
  /** Instanced zones spawn a separate simulation per party/group. */
  instanced: z.boolean(),
  /** Chunk edge length in metres. Fixed per zone. */
  chunkSize: z.number().int().positive(),
  /** Inclusive chunk-coordinate bounds. */
  bounds: z.object({
    minCx: z.number().int(),
    maxCx: z.number().int(),
    minCz: z.number().int(),
    maxCz: z.number().int(),
  }),
  defaultSpawn: Vec3Schema,
  transitions: z.array(ZoneTransitionSchema),
  /** Hooks for later systems. */
  environment: z.object({
    dayNightCycle: z.boolean(),
    weatherProfileId: ContentIdSchema.nullable(),
    ambientColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  }),
});
export type WorldZone = z.infer<typeof WorldZoneSchema>;

export const ChunkCoordSchema = z.object({ cx: z.number().int(), cz: z.number().int() });
export type ChunkCoord = z.infer<typeof ChunkCoordSchema>;

/** Static decoration/collision placed in a chunk. Placeholder geometry allowed. */
export const ChunkPropSchema = z.object({
  id: z.string().max(64),
  kind: z.enum(['tree', 'rock', 'building', 'fence', 'marker']),
  position: Vec3Schema,
  rotationY: z.number(),
  scale: z.number().positive(),
  modelId: z.string().max(200).nullable(),
});

export const SpawnKindSchema = z.enum(['npc', 'enemy', 'pickup', 'resource_node']);

/** Server-only: where/what spawns. Clients only ever see the resulting entities. */
export const SpawnPointSchema = z.object({
  id: ContentIdSchema,
  kind: SpawnKindSchema,
  position: Vec3Schema,
  rotationY: z.number().default(0),
  /** Content ID of the NPC / enemy definition, or the item template for a pickup. */
  refId: ContentIdSchema,
  /** Quantity for pickups. */
  quantity: z.number().int().positive().default(1),
  /** null = never respawns. */
  respawnMs: z.number().int().positive().nullable(),
  /** Interaction radius for pickups/NPCs (server validated). */
  interactRadius: z.number().positive().default(3),
});
export type SpawnPoint = z.infer<typeof SpawnPointSchema>;

export const WorldChunkSchema = z.object({
  zoneId: ContentIdSchema,
  coord: ChunkCoordSchema,
  /** Asset reference for terrain mesh/heightmap; null = flat placeholder ground. */
  terrainAssetId: z.string().max(200).nullable(),
  groundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  props: z.array(ChunkPropSchema),
  spawnPoints: z.array(SpawnPointSchema),
});
export type WorldChunk = z.infer<typeof WorldChunkSchema>;

// ---------------------------------------------------------------------------
// Entity definitions (authored)
// ---------------------------------------------------------------------------

export const NpcDefinitionSchema = z.object({
  id: ContentIdSchema,
  name: LocalizedNameSchema,
  title: z.string().max(64).nullable(),
  role: z.enum(['quest_giver', 'vendor', 'banker', 'trainer', 'auctioneer', 'ambient']),
  modelId: z.string().max(200).nullable(),
  dialogue: z.array(z.string().max(300)),
});
export type NpcDefinition = z.infer<typeof NpcDefinitionSchema>;

export const EnemyDefinitionSchema = z.object({
  id: ContentIdSchema,
  name: LocalizedNameSchema,
  level: z.number().int().min(1),
  maxHealth: z.number().int().positive(),
  family: z.string().max(32),
  lootTableId: ContentIdSchema.nullable(),
  xpReward: z.number().int().nonnegative(),
  modelId: z.string().max(200).nullable(),
  isBoss: z.boolean().default(false),
  isWorldBoss: z.boolean().default(false),
  /** Combat behaviour; null = not a combatant (decorative/unsimulated). */
  combat: EnemyCombatSchema.nullable().default(null),
});
export type EnemyDefinition = z.infer<typeof EnemyDefinitionSchema>;

// ---------------------------------------------------------------------------
// Runtime entities (what the realtime protocol replicates)
// ---------------------------------------------------------------------------

export const EntityKindSchema = z.enum(['player', 'npc', 'enemy', 'pickup', 'loot_drop', 'object']);
export type EntityKind = z.infer<typeof EntityKindSchema>;

/**
 * Runtime entity IDs are short-lived per-zone strings ("e:123"), NOT database IDs. A player's
 * entity has `characterId` so clients can link presence to social data.
 */
export const EntityIdSchema = z.string().min(1).max(64);

export const WorldEntitySchema = z.object({
  id: EntityIdSchema,
  kind: EntityKindSchema,
  name: z.string().max(64),
  position: Vec3Schema,
  rotationY: z.number(),
  /** Definition reference: NPC/enemy id, or item template id for pickups/loot. */
  refId: z.string().max(96).nullable(),
  characterId: UuidSchema.nullable(),
  /** Combatants only (players, enemies). Optional so non-combat entities stay compact. */
  level: z.number().int().min(1).optional(),
  health: z.number().int().nonnegative().optional(),
  maxHealth: z.number().int().positive().optional(),
  dead: z.boolean().optional(),
  hostile: z.boolean().optional(),
});
export type WorldEntity = z.infer<typeof WorldEntitySchema>;

/** Runtime: an NPC entity. */
export const NpcSchema = WorldEntitySchema.extend({ kind: z.literal('npc') });
export type Npc = z.infer<typeof NpcSchema>;

/** Runtime: an enemy entity. Health replication is a placeholder until combat exists. */
export const EnemySchema = WorldEntitySchema.extend({
  kind: z.literal('enemy'),
  health: z.number().int().nonnegative(),
  maxHealth: z.number().int().positive(),
});
export type Enemy = z.infer<typeof EnemySchema>;

/**
 * Runtime: a loot drop on the ground. Item instances are NOT created when a drop appears; they
 * are created atomically when a permitted player claims it (server-side).
 */
export const LootDropSchema = WorldEntitySchema.extend({
  kind: z.literal('loot_drop'),
  /** Characters allowed to loot (personal loot). Empty = anyone. */
  eligibleCharacterIds: z.array(UuidSchema),
  expiresAtMs: z.number().int(),
});
export type LootDrop = z.infer<typeof LootDropSchema>;
