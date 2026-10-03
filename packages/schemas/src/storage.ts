import { z } from 'zod';
import { ContentIdSchema, TimestampSchema, UuidSchema } from './common';
import { ContainerKindSchema, ItemSchema } from './items';

/**
 * Storage model
 * -------------
 * Every slot-based store (backpack, material pouch, character vault, account vault, guild vault)
 * is a CONTAINER row. Equipment is not a container: equipped items carry
 * location `{ kind: 'equipped', characterId, slotId }`.
 *
 * Slots are not rows. An item's location stores (containerId, slot) and a unique index forbids
 * two items in the same slot. "InventorySlot" below is therefore a read model.
 */

export const ContainerSchema = z.object({
  id: UuidSchema,
  kind: ContainerKindSchema,
  ownerAccountId: UuidSchema.nullable(),
  ownerCharacterId: UuidSchema.nullable(),
  ownerGuildId: UuidSchema.nullable(),
  /** Number of slots. Expansion/bag upgrades raise this server-side. */
  capacity: z.number().int().positive(),
  createdAt: TimestampSchema,
});
export type Container = z.infer<typeof ContainerSchema>;

/** Read model: one slot of a container, possibly empty. */
export const InventorySlotSchema = z.object({
  containerId: UuidSchema,
  slot: z.number().int().nonnegative(),
  item: ItemSchema.nullable(),
});
export type InventorySlot = z.infer<typeof InventorySlotSchema>;

/** A container plus its occupied slots (sparse), as returned by inventory APIs. */
export const InventorySchema = z.object({
  container: ContainerSchema,
  items: z.array(ItemSchema),
});
export type Inventory = z.infer<typeof InventorySchema>;

/** Personal character vault (bank). Container kind `character_vault`. */
export const VaultSchema = InventorySchema;
export type Vault = Inventory;

/** Shared account vault: same shape, kind `account_vault`, owned by the account (no character). */
export const AccountSharedVaultSchema = InventorySchema;
export type AccountSharedVault = Inventory;

/** Guild vault placeholder: kind `guild_vault`. Permissions/tabs/logs come later. */
export const GuildVaultSchema = InventorySchema.extend({
  placeholder: z.literal(true),
});

/** Equipped gear for a character: slotId -> item. */
export const EquipmentSchema = z.object({
  characterId: UuidSchema,
  slots: z.record(ContentIdSchema, ItemSchema),
});
export type Equipment = z.infer<typeof EquipmentSchema>;

/** Everything a character can see of their items in one payload. */
export const CharacterItemsSchema = z.object({
  characterId: UuidSchema,
  equipment: EquipmentSchema,
  containers: z.array(InventorySchema),
});
export type CharacterItems = z.infer<typeof CharacterItemsSchema>;

/** Client-side inventory UX queries (search/filter/sort). Server supports the same shape later. */
export const InventoryQuerySchema = z.object({
  search: z.string().max(64).optional(),
  categories: z.array(z.string()).optional(),
  rarityIds: z.array(ContentIdSchema).optional(),
  onlyFavourites: z.boolean().optional(),
  onlyJunk: z.boolean().optional(),
  sort: z.enum(['slot', 'name', 'rarity', 'item_level', 'newest']).optional(),
});
export type InventoryQuery = z.infer<typeof InventoryQuerySchema>;
