import { z } from 'zod';
import { ContentIdSchema, LocalizedNameSchema } from './common';

/**
 * Authored content definitions that are not items themselves: crafting, loot, collections,
 * quests and dungeons. Several are placeholders: the shape exists so references can be validated
 * and persisted, but there is no gameplay implementation yet.
 */

// ---------------------------------------------------------------------------
// Crafting (placeholder: data only, no crafting flow yet)
// ---------------------------------------------------------------------------

/** Crafting materials are item templates with category `material`. This adds crafting metadata. */
export const CraftingMaterialSchema = z.object({
  itemTemplateId: ContentIdSchema,
  materialTier: z.number().int().min(1),
  gatheredBySkillId: ContentIdSchema.nullable(),
});
export type CraftingMaterial = z.infer<typeof CraftingMaterialSchema>;

export const RecipeSchema = z.object({
  id: ContentIdSchema,
  name: LocalizedNameSchema,
  skillId: ContentIdSchema,
  requiredSkillRank: z.number().int().nonnegative(),
  inputs: z
    .array(z.object({ itemTemplateId: ContentIdSchema, quantity: z.number().int().positive() }))
    .min(1),
  output: z.object({ itemTemplateId: ContentIdSchema, quantity: z.number().int().positive() }),
  craftTimeMs: z.number().int().nonnegative(),
});
export type Recipe = z.infer<typeof RecipeSchema>;

// ---------------------------------------------------------------------------
// Loot
// ---------------------------------------------------------------------------

export const LootTableEntrySchema = z.object({
  itemTemplateId: ContentIdSchema,
  weight: z.number().positive(),
  minQuantity: z.number().int().positive(),
  maxQuantity: z.number().int().positive(),
  /** Override rarity; null = roll using rarity dropWeights capped by the template default. */
  rarityId: ContentIdSchema.nullable(),
});

export const LootTableSchema = z.object({
  id: ContentIdSchema,
  /** Number of independent rolls. */
  rolls: z.number().int().min(0),
  /** Chance (0..1) that a roll yields nothing. */
  emptyChance: z.number().min(0).max(1),
  entries: z.array(LootTableEntrySchema).min(1),
  currency: z
    .object({
      currencyId: ContentIdSchema,
      min: z.number().int().nonnegative(),
      max: z.number().int(),
    })
    .nullable(),
});
export type LootTable = z.infer<typeof LootTableSchema>;

// ---------------------------------------------------------------------------
// Collections unlocked by items (mounts, pets, cosmetics). Placeholders.
// ---------------------------------------------------------------------------

export const MountDefinitionSchema = z.object({
  id: ContentIdSchema,
  name: LocalizedNameSchema,
  speedMultiplier: z.number().min(1),
  modelId: z.string().nullable(),
  /** Item template that teaches/unlocks it. */
  unlockedByItemTemplateId: ContentIdSchema.nullable(),
});
export type MountDefinition = z.infer<typeof MountDefinitionSchema>;

export const PetDefinitionSchema = z.object({
  id: ContentIdSchema,
  name: LocalizedNameSchema,
  /** Pets are cosmetic companions; combat pets belong to class abilities. */
  modelId: z.string().nullable(),
  unlockedByItemTemplateId: ContentIdSchema.nullable(),
});
export type PetDefinition = z.infer<typeof PetDefinitionSchema>;

export const CosmeticDefinitionSchema = z.object({
  id: ContentIdSchema,
  name: LocalizedNameSchema,
  kind: z.enum(['appearance', 'dye', 'emote', 'title', 'skin']),
  unlockedByItemTemplateId: ContentIdSchema.nullable(),
});
export type CosmeticDefinition = z.infer<typeof CosmeticDefinitionSchema>;

// ---------------------------------------------------------------------------
// Quests & dungeons (placeholders)
// ---------------------------------------------------------------------------

export const QuestObjectiveSchema = z.discriminatedUnion('kind', [
  z.object({
    /** Stable within the quest; keys persisted progress. */
    id: ContentIdSchema,
    kind: z.literal('kill'),
    enemyId: ContentIdSchema,
    count: z.number().int().positive(),
    label: z.string().min(1).max(80),
  }),
  z.object({
    id: ContentIdSchema,
    kind: z.literal('collect'),
    itemTemplateId: ContentIdSchema,
    count: z.number().int().positive(),
    /** Remove the items from the character when the quest is turned in. */
    consumeOnTurnIn: z.boolean(),
    label: z.string().min(1).max(80),
  }),
  // Talk credit is written only after authoritative NPC interaction.
  z.object({
    id: ContentIdSchema,
    kind: z.literal('talk'),
    npcId: ContentIdSchema,
    label: z.string().min(1).max(80),
  }),
  z.object({
    id: ContentIdSchema,
    // Exploration remains a placeholder.
    kind: z.literal('explore'),
    zoneId: ContentIdSchema,
    areaId: ContentIdSchema,
    label: z.string().min(1).max(80),
  }),
]);
export type QuestObjective = z.infer<typeof QuestObjectiveSchema>;

const DialogueLineSchema = z.string().min(1).max(600);

export const QuestDefinitionSchema = z.object({
  id: ContentIdSchema,
  name: LocalizedNameSchema,
  description: z.string().max(1000).default(''),
  giverNpcId: ContentIdSchema.nullable(),
  /** NPC that accepts the turn-in; null = the giver. */
  turnInNpcId: ContentIdSchema.nullable().default(null),
  minLevel: z.number().int().min(1),
  /** Quests that must be completed first. */
  prerequisites: z.array(ContentIdSchema).default([]),
  /** Repeatable contracts require an explicit cooldown and fresh acceptance. */
  repeatable: z.boolean().default(false),
  repeatCooldownMs: z.number().int().min(60000).max(604800000).optional(),
  objectives: z.array(QuestObjectiveSchema),
  rewards: z.object({
    xp: z.number().int().nonnegative(),
    currency: z.array(
      z.object({ currencyId: ContentIdSchema, amount: z.number().int().nonnegative() }),
    ),
    items: z
      .array(z.object({ itemTemplateId: ContentIdSchema, quantity: z.number().int().positive() }))
      .default([]),
  }),
  /** What the quest NPC says in each state (no branching trees yet). */
  dialogue: z
    .object({
      offer: DialogueLineSchema,
      inProgress: DialogueLineSchema,
      readyToTurnIn: DialogueLineSchema,
      completed: DialogueLineSchema,
    })
    .nullable()
    .default(null),
  /** Placeholder quests exist only so references validate; they are never offered. */
  placeholder: z.boolean().default(false),
});
export type QuestDefinition = z.infer<typeof QuestDefinitionSchema>;
export type QuestDefinitionInput = z.input<typeof QuestDefinitionSchema>;

/**
 * Player-facing quest state. Persisted rows only store `active` / `completed`; the others are
 * derived (availability rules, objective progress). "Objectives complete" and "ready to turn in"
 * are the same server condition: every objective is satisfied, the player must return to the NPC.
 */
export const QuestStateSchema = z.enum([
  'unavailable',
  'available',
  'active',
  'ready_to_turn_in',
  'completed',
]);
export type QuestState = z.infer<typeof QuestStateSchema>;

/** One quest as the server presents it to a character (quest log, tracker, dialogue). */
export const QuestViewSchema = z.object({
  questId: ContentIdSchema,
  name: z.string(),
  description: z.string(),
  state: QuestStateSchema,
  giverNpcId: ContentIdSchema.nullable(),
  turnInNpcId: ContentIdSchema.nullable(),
  objectives: z.array(
    z.object({
      id: z.string(),
      kind: z.enum(['kill', 'collect', 'talk', 'explore']),
      label: z.string(),
      current: z.number().int().nonnegative(),
      required: z.number().int().positive(),
      done: z.boolean(),
    }),
  ),
  rewards: z.object({
    xp: z.number().int().nonnegative(),
    currency: z.array(z.object({ currencyId: z.string(), amount: z.number().int() })),
    items: z.array(z.object({ itemTemplateId: z.string(), quantity: z.number().int() })),
  }),
  acceptedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
});
export type QuestView = z.infer<typeof QuestViewSchema>;

/** Quest items are item templates with category `quest`; this is their quest link. */
export const QuestItemSchema = z.object({
  itemTemplateId: ContentIdSchema,
  questId: ContentIdSchema,
});
export type QuestItem = z.infer<typeof QuestItemSchema>;

export const DungeonDefinitionSchema = z.object({
  id: ContentIdSchema,
  name: LocalizedNameSchema,
  /** Instanced dungeons get their own zone simulation per group. */
  instanced: z.boolean(),
  minLevel: z.number().int().min(1),
  maxPlayers: z.number().int().positive(),
  entranceZoneId: ContentIdSchema,
  zoneId: ContentIdSchema,
  bossEnemyIds: z.array(ContentIdSchema),
  placeholder: z.literal(true),
});
export type DungeonDefinition = z.infer<typeof DungeonDefinitionSchema>;
