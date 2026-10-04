import { z } from 'zod';
import {
  AmountSchema,
  ContentIdSchema,
  LocalizedNameSchema,
  TimestampSchema,
  UuidSchema,
} from './common';
import { StatBlockSchema, StatKeySchema, StatRangeSchema } from './stats';

// ===========================================================================
// RARITY — definitions are authored in @mmo/game-data, never hard-coded.
// ===========================================================================

export const ItemRarityDefinitionSchema = z.object({
  id: ContentIdSchema,
  name: LocalizedNameSchema,
  /** Ordering only. Higher tier = rarer. Gameplay must read other fields, not compare tiers. */
  tier: z.number().int().nonnegative(),
  /** UI colour token (hex). Clients render from this, never from a hard-coded table. */
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  /** Number of random modifiers rolled on creation (min/max). */
  modifierCount: z.object({
    min: z.number().int().nonnegative(),
    max: z.number().int().nonnegative(),
  }),
  /** Multiplier applied to template stat ranges when rolling. */
  statMultiplier: z.number().positive(),
  /** Number of sockets that may be generated (min/max). */
  socketCount: z.object({
    min: z.number().int().nonnegative(),
    max: z.number().int().nonnegative(),
  }),
  /** Relative weight when a loot table rolls rarity. 0 = never rolled randomly. */
  dropWeight: z.number().nonnegative(),
  /** If true, the server records a world-announcement-worthy event on drop (later). */
  announceOnDrop: z.boolean().default(false),
});
export type ItemRarityDefinition = z.infer<typeof ItemRarityDefinitionSchema>;

// ===========================================================================
// CATEGORIES & EQUIPMENT
// ===========================================================================

/** Top-level item category. Drives which template block is required. */
export const ItemCategorySchema = z.enum([
  'weapon',
  'armor',
  'accessory',
  'consumable',
  'material',
  'quest',
  'mount',
  'pet',
  'cosmetic',
  'container', // bags (later)
  'misc',
]);
export type ItemCategory = z.infer<typeof ItemCategorySchema>;

/**
 * What kind of slot an item fits. Equipment slot definitions (game data) declare which
 * slot types they accept, so new slots can be added without touching item templates.
 */
export const EquipSlotTypeSchema = z.enum([
  'head',
  'shoulders',
  'chest',
  'hands',
  'waist',
  'legs',
  'feet',
  'cloak',
  'necklace',
  'ring',
  'trinket',
  'one_hand',
  'main_hand',
  'two_hand',
  'off_hand',
  'ranged',
]);
export type EquipSlotType = z.infer<typeof EquipSlotTypeSchema>;

/** Equipment slot definition (game data). `id` is what is persisted for equipped items. */
export const EquipmentSlotDefinitionSchema = z.object({
  id: ContentIdSchema, // e.g. 'main_hand', 'ring_1'
  name: LocalizedNameSchema,
  accepts: z.array(EquipSlotTypeSchema).min(1),
  /** Display order in UI. */
  order: z.number().int(),
});
export type EquipmentSlotDefinition = z.infer<typeof EquipmentSlotDefinitionSchema>;

/** Equipment type (game data): swords, plate, rings... Classes declare proficiencies by these IDs. */
export const EquipmentTypeDefinitionSchema = z.object({
  id: ContentIdSchema, // e.g. 'sword', 'plate'
  name: LocalizedNameSchema,
  family: z.enum(['weapon', 'armor', 'shield', 'accessory']),
  /** If false, any class may equip it (e.g. rings, cloaks). */
  requiresProficiency: z.boolean(),
});
export type EquipmentTypeDefinition = z.infer<typeof EquipmentTypeDefinitionSchema>;

// ===========================================================================
// BINDING, DURABILITY, MODIFIERS, SOCKETS, ENCHANTMENTS
// ===========================================================================

/**
 * Binding rules on the TEMPLATE:
 * - none:           freely tradeable forever
 * - on_pickup:      binds to the character when acquired
 * - on_equip:       binds to the character when first equipped
 * - account:        bound to the account (may move between that account's characters/vault)
 * Binding STATE on the INSTANCE records whether/when/to whom it actually bound.
 */
export const ItemBindingRuleSchema = z.enum(['none', 'on_pickup', 'on_equip', 'account']);
export type ItemBindingRule = z.infer<typeof ItemBindingRuleSchema>;

export const ItemBindingStateSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('unbound') }),
  z.object({ kind: z.literal('character'), characterId: UuidSchema, boundAt: TimestampSchema }),
  z.object({ kind: z.literal('account'), accountId: UuidSchema, boundAt: TimestampSchema }),
]);
export type ItemBindingState = z.infer<typeof ItemBindingStateSchema>;

export const ItemDurabilitySchema = z.object({
  current: z.number().int().nonnegative(),
  max: z.number().int().positive(),
});
export type ItemDurability = z.infer<typeof ItemDurabilitySchema>;

/** A rolled modifier ("of the Bear": +stamina). `modifierId` references game data. */
export const ItemModifierSchema = z.object({
  modifierId: ContentIdSchema,
  stat: StatKeySchema,
  value: z.number().finite(),
});
export type ItemModifier = z.infer<typeof ItemModifierSchema>;

export const ItemModifierDefinitionSchema = z.object({
  id: ContentIdSchema,
  name: LocalizedNameSchema,
  stat: StatKeySchema,
  range: StatRangeSchema,
  /** Category filter: which item categories may roll this. */
  allowedCategories: z.array(z.enum(['weapon', 'armor', 'accessory'])).min(1),
});
export type ItemModifierDefinition = z.infer<typeof ItemModifierDefinitionSchema>;

export const SocketColorSchema = z.enum(['red', 'blue', 'yellow', 'prismatic']);
export const ItemSocketSchema = z.object({
  color: SocketColorSchema,
  /** Gem item instance ID once socketed (the gem instance moves to location 'socketed'). */
  gemItemInstanceId: UuidSchema.nullable(),
});
export type ItemSocket = z.infer<typeof ItemSocketSchema>;

export const ItemEnchantmentSchema = z.object({
  enchantmentId: ContentIdSchema,
  appliedAt: TimestampSchema,
  appliedByCharacterId: UuidSchema.nullable(),
  stats: StatBlockSchema,
});
export type ItemEnchantment = z.infer<typeof ItemEnchantmentSchema>;

/** Cosmetic override (transmog/dye/skin). Pure visual; never affects stats. */
export const ItemAppearanceSchema = z.object({
  modelOverrideId: ContentIdSchema.nullable(),
  dyeIds: z.array(ContentIdSchema).max(4),
});
export type ItemAppearance = z.infer<typeof ItemAppearanceSchema>;

/**
 * Dormant external-ownership metadata.
 * These fields have NO gameplay effect and are never shown in UI. The game database is the
 * source of truth for ownership. See docs/DECISIONS.md "No blockchain implementation now".
 */
export const ExternalOwnershipSchema = z.object({
  externalOwnershipEnabled: z.literal(false),
  externalAssetId: z.null(),
  externalNetwork: z.null(),
});
export type ExternalOwnership = z.infer<typeof ExternalOwnershipSchema>;
export const DORMANT_EXTERNAL_OWNERSHIP: ExternalOwnership = {
  externalOwnershipEnabled: false,
  externalAssetId: null,
  externalNetwork: null,
};

// ===========================================================================
// ITEM TEMPLATE (authored game data, e.g. "Iron Longsword")
// ===========================================================================

const EquipmentBlockSchema = z.object({
  slotType: EquipSlotTypeSchema,
  equipmentTypeId: ContentIdSchema,
  /** Guaranteed stats (scaled by rarity statMultiplier on creation). */
  baseStats: z.partialRecord(StatKeySchema, StatRangeSchema),
  maxDurability: z.number().int().positive().nullable(),
  weapon: z
    .object({
      minDamage: z.number().nonnegative(),
      maxDamage: z.number().nonnegative(),
      attackSpeedMs: z.number().int().positive(),
    })
    .nullable()
    .default(null),
});

const ConsumableBlockSchema = z.object({
  cooldownGroup: ContentIdSchema,
  cooldownMs: z.number().int().nonnegative(),
  /** Opaque effect description; executed by future server systems only. */
  effects: z.array(z.record(z.string(), z.unknown())),
});

export const ItemTemplateSchema = z
  .object({
    id: ContentIdSchema,
    name: LocalizedNameSchema,
    description: z.string().max(500).default(''),
    category: ItemCategorySchema,
    /** Default rarity. Loot tables may override per drop. */
    rarityId: ContentIdSchema,
    itemLevel: z.number().int().min(1),
    requiredLevel: z.number().int().min(1),
    /** Empty = all classes. */
    allowedClassIds: z.array(ContentIdSchema).default([]),
    binding: ItemBindingRuleSchema,
    /** 1 = not stackable. */
    maxStack: z.number().int().min(1).max(9999),
    tradeable: z.boolean(),
    marketplaceAllowed: z.boolean(),
    vaultAllowed: z.boolean(),
    /** Can it go into the account-wide shared vault? (Implies vaultAllowed.) */
    accountVaultAllowed: z.boolean(),
    /** Base vendor value in the primary currency's smallest unit. */
    vendorValue: AmountSchema,
    /** Asset references (see docs/art-pipeline). */
    iconId: z.string().max(200).nullable(),
    modelId: z.string().max(200).nullable(),
    equipment: EquipmentBlockSchema.nullable().default(null),
    consumable: ConsumableBlockSchema.nullable().default(null),
    /** Quest items reference their quest; they are always bound and never tradeable. */
    questId: ContentIdSchema.nullable().default(null),
    /** Material items live in the material pouch rather than the backpack. */
    goesToMaterialPouch: z.boolean().default(false),
    tags: z.array(z.string().max(40)).default([]),
  })
  .superRefine((t, ctx) => {
    const isGear = t.category === 'weapon' || t.category === 'armor' || t.category === 'accessory';
    if (isGear && !t.equipment) {
      ctx.addIssue({ code: 'custom', message: `${t.category} templates need an equipment block` });
    }
    if (!isGear && t.equipment) {
      ctx.addIssue({ code: 'custom', message: 'only gear may have an equipment block' });
    }
    if (isGear && t.maxStack !== 1) {
      ctx.addIssue({ code: 'custom', message: 'gear must not stack' });
    }
    if (t.category === 'consumable' && !t.consumable) {
      ctx.addIssue({ code: 'custom', message: 'consumables need a consumable block' });
    }
    if (t.category === 'quest' && (t.tradeable || t.marketplaceAllowed || !t.questId)) {
      ctx.addIssue({
        code: 'custom',
        message: 'quest items must reference a quest and be untradeable',
      });
    }
    if (t.marketplaceAllowed && !t.tradeable) {
      ctx.addIssue({ code: 'custom', message: 'marketplaceAllowed requires tradeable' });
    }
    if (t.accountVaultAllowed && !t.vaultAllowed) {
      ctx.addIssue({ code: 'custom', message: 'accountVaultAllowed requires vaultAllowed' });
    }
    if (t.binding === 'on_pickup' && t.tradeable) {
      ctx.addIssue({ code: 'custom', message: 'bind-on-pickup items cannot be tradeable' });
    }
  });
export type ItemTemplate = z.infer<typeof ItemTemplateSchema>;

// ===========================================================================
// ITEM INSTANCE (one concrete item with its own immutable ID)
// ===========================================================================

/** How an instance came into existence. Immutable after creation. */
export const AcquisitionMethodSchema = z.enum([
  'world_pickup',
  'loot_drop',
  'quest_reward',
  'crafted',
  'vendor_purchase',
  'admin_grant',
  'seed',
  'stack_split',
  'system',
]);
export type AcquisitionMethod = z.infer<typeof AcquisitionMethodSchema>;

/**
 * The single authoritative location of an item instance. An instance has exactly one location,
 * which is what makes "an item can never be in two places at once" structurally true.
 */
export const ContainerKindSchema = z.enum([
  'backpack',
  'material_pouch',
  'character_vault',
  'account_vault',
  'guild_vault',
  /** System-only overflow storage ("Recovered loot"); players can only take items out. */
  'mailbox',
]);
export type ContainerKind = z.infer<typeof ContainerKindSchema>;

export const ItemLocationSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('container'),
    containerId: UuidSchema,
    containerKind: ContainerKindSchema,
    slot: z.number().int().nonnegative(),
  }),
  z.object({ kind: z.literal('equipped'), characterId: UuidSchema, slotId: ContentIdSchema }),
  z.object({ kind: z.literal('marketplace_escrow'), listingId: UuidSchema }),
  z.object({ kind: z.literal('trade_escrow'), tradeId: UuidSchema }),
  /** Terminal: consumed, destroyed, merged into another stack, revoked. Rows are never deleted. */
  z.object({ kind: z.literal('destroyed'), reason: z.string().max(64) }),
]);
export type ItemLocation = z.infer<typeof ItemLocationSchema>;
export type ItemLocationKind = ItemLocation['kind'];

/** Player-facing per-instance flags (inventory UX). Never affect authority checks except `locked`. */
export const ItemFlagsSchema = z.object({
  /** Player lock: the server refuses to sell/vendor/destroy/list a locked item. */
  locked: z.boolean(),
  favourite: z.boolean(),
  junk: z.boolean(),
});
export type ItemFlags = z.infer<typeof ItemFlagsSchema>;

export const ItemOwnershipSchema = z.object({
  ownerAccountId: UuidSchema,
  /** Null when the item is account-scoped (e.g. in the shared account vault). */
  ownerCharacterId: UuidSchema.nullable(),
  /** Character or account that originally created/acquired it (crafter, looter). Immutable. */
  originalOwnerAccountId: UuidSchema.nullable(),
  originalOwnerCharacterId: UuidSchema.nullable(),
  crafterCharacterId: UuidSchema.nullable(),
});
export type ItemOwnership = z.infer<typeof ItemOwnershipSchema>;

export const ItemInstanceSchema = z.object({
  /** Globally unique, immutable. */
  id: UuidSchema,
  templateId: ContentIdSchema,
  /** Rolled rarity (may differ from the template default). */
  rarityId: ContentIdSchema,
  quantity: z.number().int().min(1),
  ownership: ItemOwnershipSchema,
  location: ItemLocationSchema,
  acquisition: z.object({
    method: AcquisitionMethodSchema,
    /** Free-form source reference, e.g. `world_pickup:spawn.greenvale.pickup_1:42`. */
    sourceRef: z.string().max(200).nullable(),
  }),
  binding: ItemBindingStateSchema,
  stats: StatBlockSchema,
  modifiers: z.array(ItemModifierSchema),
  sockets: z.array(ItemSocketSchema),
  enchantments: z.array(ItemEnchantmentSchema),
  durability: ItemDurabilitySchema.nullable(),
  appearance: ItemAppearanceSchema.nullable(),
  flags: ItemFlagsSchema,
  external: ExternalOwnershipSchema,
  /** Optimistic concurrency counter, incremented on every mutation. */
  version: z.number().int().nonnegative(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});
export type ItemInstance = z.infer<typeof ItemInstanceSchema>;

/**
 * A "view" convenience type: instance joined with its template, as returned by inventory APIs.
 * "Item" in docs refers to this pairing.
 */
export const ItemSchema = z.object({ instance: ItemInstanceSchema, template: ItemTemplateSchema });
export type Item = z.infer<typeof ItemSchema>;

// ===========================================================================
// PROVENANCE / HISTORY (append-only)
// ===========================================================================

export const ItemHistoryEventTypeSchema = z.enum([
  'created',
  'moved',
  'equipped',
  'unequipped',
  'bound',
  'stack_merged',
  'stack_split',
  'listed',
  'listing_cancelled',
  'listing_expired',
  'sold',
  'traded',
  'modified',
  'destroyed',
  'admin_granted',
  'admin_revoked',
]);
export type ItemHistoryEventType = z.infer<typeof ItemHistoryEventTypeSchema>;

export const ItemHistoryEntrySchema = z.object({
  id: UuidSchema,
  itemInstanceId: UuidSchema,
  eventType: ItemHistoryEventTypeSchema,
  /** Who caused it. Null actor = system. */
  actorAccountId: UuidSchema.nullable(),
  actorCharacterId: UuidSchema.nullable(),
  fromOwnerAccountId: UuidSchema.nullable(),
  toOwnerAccountId: UuidSchema.nullable(),
  fromLocation: z.record(z.string(), z.unknown()).nullable(),
  toLocation: z.record(z.string(), z.unknown()).nullable(),
  quantity: z.number().int().nullable(),
  /** Correlates related events (e.g. both sides of a marketplace sale). */
  correlationId: UuidSchema.nullable(),
  details: z.record(z.string(), z.unknown()),
  occurredAt: TimestampSchema,
});
export type ItemHistoryEntry = z.infer<typeof ItemHistoryEntrySchema>;
