import { z } from 'zod';
import { ServiceOfferSchema, DungeonEntrySchema } from './services';
import { WorldCatalogSchema } from './world-catalog';
import { ContentIdSchema } from './common';
import { DamageRangeSchema, EnemyCombatSchema } from './combat';
import { LootTableSchema, QuestDefinitionSchema } from './content';
import { EnemyDefinitionSchema, NpcDefinitionSchema, SpawnPointSchema } from './world';

/** Version 1 supports only mechanics implemented by the authoritative runtime. */
export const ContentPlacementSchema = z.strictObject({
  zoneId: ContentIdSchema,
  spawn: SpawnPointSchema.extend({ position: SpawnPointSchema.shape.position.strict() }).strict(),
});
export const ContentRewardSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('quest'),
    id: ContentIdSchema,
    value: QuestDefinitionSchema.shape.rewards
      .extend({
        currency: z.array(QuestDefinitionSchema.shape.rewards.shape.currency.element.strict()),
        items: z
          .array(
            z.strictObject({
              itemTemplateId: ContentIdSchema,
              quantity: z.number().int().positive(),
            }),
          )
          .default([]),
      })
      .strict(),
  }),
  z.strictObject({
    kind: z.literal('loot'),
    id: ContentIdSchema,
    value: LootTableSchema.omit({ id: true })
      .extend({
        entries: z.array(LootTableSchema.shape.entries.element.strict()).min(1),
        currency: LootTableSchema.shape.currency.unwrap().strict().nullable(),
      })
      .strict(),
  }),
]);
export const ContentQuestSchema = QuestDefinitionSchema.omit({ rewards: true })
  .extend({
    rewardId: ContentIdSchema,
    objectives: z.array(
      z.discriminatedUnion('kind', [
        QuestDefinitionSchema.shape.objectives.element.options[0].strict(),
        QuestDefinitionSchema.shape.objectives.element.options[1].strict(),
        QuestDefinitionSchema.shape.objectives.element.options[2].strict(),
        QuestDefinitionSchema.shape.objectives.element.options[3].strict(),
      ]),
    ),
    dialogue: QuestDefinitionSchema.shape.dialogue
      .unwrap()
      .unwrap()
      .strict()
      .nullable()
      .default(null),
  })
  .strict();
export const ContentNpcSchema = z.strictObject({
  definition: NpcDefinitionSchema.strict(),
  placements: z.array(ContentPlacementSchema),
});
export const ContentEncounterSchema = z.strictObject({
  id: ContentIdSchema,
  enemy: EnemyDefinitionSchema.omit({ lootTableId: true })
    .extend({
      combat: EnemyCombatSchema.safeExtend({ damage: DamageRangeSchema.strict() })
        .strict()
        .nullable()
        .default(null),
    })
    .strict(),
  lootRewardId: ContentIdSchema.nullable(),
  placements: z.array(ContentPlacementSchema).min(1),
});
const ContentPackV1Schema = z.strictObject({
  schemaVersion: z.literal(1),
  id: ContentIdSchema,
  revision: z.number().int().positive(),
  quests: z.array(ContentQuestSchema),
  npcs: z.array(ContentNpcSchema),
  encounters: z.array(ContentEncounterSchema),
  rewards: z.array(ContentRewardSchema),
});
export const ContentPackV2Schema = ContentPackV1Schema.extend({
  schemaVersion: z.literal(2),
  world: WorldCatalogSchema,
});
export const ContentPackV3Schema = ContentPackV1Schema.extend({
  schemaVersion: z.literal(3),
  serviceOffers: z.array(ServiceOfferSchema),
  dungeonEntries: z.array(DungeonEntrySchema),
});
export const ContentPackSchema = z.discriminatedUnion('schemaVersion', [
  ContentPackV1Schema,
  ContentPackV2Schema,
  ContentPackV3Schema,
]);
export type ContentPackInput = z.input<typeof ContentPackSchema>;
export type ContentPack = z.output<typeof ContentPackSchema>;
