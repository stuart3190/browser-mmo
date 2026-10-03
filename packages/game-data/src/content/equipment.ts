import type { EquipmentSlotDefinition, EquipmentTypeDefinition } from '@mmo/schemas';

/**
 * Equipment slots. The slot `id` is persisted on equipped item instances, so never rename one.
 * To add a slot: append a definition here. No schema or database change is required.
 */
export const equipmentSlots: EquipmentSlotDefinition[] = [
  { id: 'head', name: 'Head', accepts: ['head'], order: 0 },
  { id: 'shoulders', name: 'Shoulders', accepts: ['shoulders'], order: 1 },
  { id: 'chest', name: 'Chest', accepts: ['chest'], order: 2 },
  { id: 'hands', name: 'Hands', accepts: ['hands'], order: 3 },
  { id: 'waist', name: 'Waist', accepts: ['waist'], order: 4 },
  { id: 'legs', name: 'Legs', accepts: ['legs'], order: 5 },
  { id: 'feet', name: 'Feet', accepts: ['feet'], order: 6 },
  { id: 'cloak', name: 'Cloak', accepts: ['cloak'], order: 7 },
  { id: 'necklace', name: 'Necklace', accepts: ['necklace'], order: 8 },
  { id: 'ring_1', name: 'Ring 1', accepts: ['ring'], order: 9 },
  { id: 'ring_2', name: 'Ring 2', accepts: ['ring'], order: 10 },
  { id: 'trinket_1', name: 'Trinket 1', accepts: ['trinket'], order: 11 },
  { id: 'trinket_2', name: 'Trinket 2', accepts: ['trinket'], order: 12 },
  { id: 'main_hand', name: 'Main Hand', accepts: ['one_hand', 'main_hand', 'two_hand'], order: 13 },
  { id: 'off_hand', name: 'Off Hand', accepts: ['one_hand', 'off_hand'], order: 14 },
  { id: 'ranged', name: 'Ranged', accepts: ['ranged'], order: 15 },
];

/** Slot types that occupy BOTH hands. Equipping one requires the off hand to be empty. */
export const TWO_HANDED_SLOT_TYPES = ['two_hand'] as const;

export const equipmentTypes: EquipmentTypeDefinition[] = [
  // Weapons
  { id: 'sword', name: 'Sword', family: 'weapon', requiresProficiency: true },
  { id: 'axe', name: 'Axe', family: 'weapon', requiresProficiency: true },
  { id: 'mace', name: 'Mace', family: 'weapon', requiresProficiency: true },
  { id: 'dagger', name: 'Dagger', family: 'weapon', requiresProficiency: true },
  { id: 'staff', name: 'Staff', family: 'weapon', requiresProficiency: true },
  { id: 'wand', name: 'Wand', family: 'weapon', requiresProficiency: true },
  { id: 'bow', name: 'Bow', family: 'weapon', requiresProficiency: true },
  { id: 'crossbow', name: 'Crossbow', family: 'weapon', requiresProficiency: true },
  { id: 'shield', name: 'Shield', family: 'shield', requiresProficiency: true },
  // Armour
  { id: 'plate', name: 'Plate', family: 'armor', requiresProficiency: true },
  { id: 'mail', name: 'Mail', family: 'armor', requiresProficiency: true },
  { id: 'leather', name: 'Leather', family: 'armor', requiresProficiency: true },
  { id: 'cloth', name: 'Cloth', family: 'armor', requiresProficiency: true },
  // Accessories (anyone)
  { id: 'ring', name: 'Ring', family: 'accessory', requiresProficiency: false },
  { id: 'necklace', name: 'Necklace', family: 'accessory', requiresProficiency: false },
  { id: 'trinket', name: 'Trinket', family: 'accessory', requiresProficiency: false },
  { id: 'cloak', name: 'Cloak', family: 'accessory', requiresProficiency: false },
];
