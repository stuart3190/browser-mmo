import { z } from 'zod';
import { ContentIdSchema, Vec3Schema } from './common';
import { EnemyCombatSchema } from './combat';
import { NpcDefinitionSchema } from './world';
import { ItemTemplateSchema } from './items';
import { LootTableSchema } from './content';
const named = { id: ContentIdSchema, name: z.string().min(1).max(80) };
export const WorldBoundsSchema = z
  .strictObject({
    minX: z.number().int(),
    minZ: z.number().int(),
    maxX: z.number().int(),
    maxZ: z.number().int(),
  })
  .refine((b) => b.minX < b.maxX && b.minZ < b.maxZ, 'Invalid bounds');
export const LevelBandSchema = z
  .strictObject({ min: z.number().int().positive(), max: z.number().int().positive() })
  .refine((b) => b.min <= b.max, 'Invalid level band');
export const LandmassSchema = z.strictObject({
  ...named,
  bounds: WorldBoundsSchema,
  regionIds: z.array(ContentIdSchema).min(2),
  coast: z.enum(['temperate', 'ice', 'volcanic']),
});
export const AtlasRegionSchema = z.strictObject({
  ...named,
  landmassId: ContentIdSchema,
  zoneId: ContentIdSchema,
  bounds: WorldBoundsSchema,
  biomeId: ContentIdSchema,
  levelBand: LevelBandSchema,
  danger: z.enum(['sheltered', 'frontier', 'hostile', 'severe']),
  neighborIds: z.array(ContentIdSchema),
  transitionIntent: z.string().min(1).max(500),
  monsterVariantIds: z.array(ContentIdSchema).min(1),
  resourceIds: z.array(ContentIdSchema).min(1),
  npcArchetypeIds: z.array(ContentIdSchema).min(1),
  dungeonArchetypeIds: z.array(ContentIdSchema).min(1),
});
export const WorldLocationSchema = z.strictObject({
  ...named,
  regionId: ContentIdSchema,
  zoneId: ContentIdSchema,
  position: Vec3Schema,
  kind: z.enum([
    'settlement',
    'port',
    'gate',
    'dungeon',
    'landmark',
    'resource_area',
    'habitat',
    'quest_hub',
  ]),
  variantIds: z.array(ContentIdSchema).default([]),
  resourceIds: z.array(ContentIdSchema).default([]),
  dungeonArchetypeId: ContentIdSchema.nullable().default(null),
});
export const WorldTravelSchema = z.strictObject({
  ...named,
  fromLocationId: ContentIdSchema,
  toLocationId: ContentIdSchema,
  mode: z.enum(['boat', 'road', 'portal', 'mount', 'flight']),
  enabled: z.boolean(),
  requiredQuestId: ContentIdSchema.nullable().default(null),
});
export const WorldCatalogSchema = z.strictObject({
  landmasses: z.array(LandmassSchema).min(1),
  biomes: z.array(
    z.strictObject({
      ...named,
      groundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
      terrainIntent: z.string().min(1).max(300),
    }),
  ),
  regions: z.array(AtlasRegionSchema).min(1),
  locations: z.array(WorldLocationSchema),
  travel: z.array(WorldTravelSchema),
  roads: z.array(
    z.strictObject({
      id: ContentIdSchema,
      zoneId: ContentIdSchema,
      points: z.array(Vec3Schema).min(2),
      width: z.number().positive().max(20),
    }),
  ),
  monsterFamilies: z.array(
    z.strictObject({
      ...named,
      biomeIds: z.array(ContentIdSchema).min(1),
      variants: z
        .array(
          z.strictObject({
            ...named,
            level: z.number().int().positive(),
            maxHealth: z.number().int().positive(),
            disposition: z.enum(['hostile', 'neutral', 'wildlife']),
            combat: EnemyCombatSchema,
            lootProfileId: ContentIdSchema,
            xpReward: z.number().int().nonnegative(),
          }),
        )
        .min(1),
    }),
  ),
  npcArchetypes: z.array(
    z.strictObject({
      ...named,
      role: z.enum([
        'guard',
        'merchant',
        'innkeeper',
        'profession',
        'faction',
        'ferryman',
        'healer',
        'banker',
        'scout',
        'wildlife_keeper',
      ]),
      runtimeRole: NpcDefinitionSchema.shape.role,
      services: z.array(
        z.enum(['dialogue', 'shop', 'lodging', 'training', 'faction', 'travel', 'healing', 'bank']),
      ),
      servicesStatus: z.enum(['dialogue_only', 'travel_available']),
      stockTemplateIds: z.array(ContentIdSchema),
    }),
  ),
  populations: z.array(
    z.strictObject({
      ...named,
      locationId: ContentIdSchema,
      archetypeId: ContentIdSchema,
      offset: z.strictObject({ x: z.number().finite(), z: z.number().finite() }),
      dialogue: z.array(z.string().min(1).max(300)).min(1),
    }),
  ),
  materials: z.array(ItemTemplateSchema),
  resources: z.array(
    z.strictObject({
      ...named,
      itemTemplateId: ContentIdSchema,
      biomeIds: z.array(ContentIdSchema).min(1),
      profession: z.enum(['mining', 'herbalism', 'logging', 'skinning', 'salvage']),
      gatheringImplemented: z.literal(false),
    }),
  ),
  lootProfiles: z.array(
    LootTableSchema.extend({
      category: z.enum(['hide', 'salvage', 'mineral', 'botanical', 'elemental']),
    }),
  ),
  dungeonArchetypes: z.array(
    z.strictObject({
      ...named,
      kind: z.enum(['cave', 'ruin', 'mine', 'crypt']),
      instancingImplemented: z.literal(false),
    }),
  ),
  enclave: z.strictObject({
    zoneId: ContentIdSchema,
    regionId: ContentIdSchema,
    atlasOrigin: z.strictObject({ x: z.number().finite(), z: z.number().finite() }),
  }),
});
export type WorldCatalog = z.infer<typeof WorldCatalogSchema>;
export type WorldCatalogInput = z.input<typeof WorldCatalogSchema>;
