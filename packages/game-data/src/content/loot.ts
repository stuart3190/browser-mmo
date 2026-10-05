import type { LootTable } from '@mmo/schemas';

export const lootTables: LootTable[] = [
  {
    id: 'loot.greenvale.last_door_sentinel',
    rolls: 1,
    emptyChance: 0,
    entries: [
      {
        itemTemplateId: 'material.ore.copper_ore',
        weight: 1,
        minQuantity: 4,
        maxQuantity: 4,
        rarityId: null,
      },
    ],
    currency: { currencyId: 'gold', min: 85, max: 110 },
  },
  {
    id: 'loot.greenvale.siltbound_warden',
    rolls: 1,
    emptyChance: 0,
    entries: [
      {
        itemTemplateId: 'material.ore.copper_ore',
        weight: 1,
        minQuantity: 4,
        maxQuantity: 4,
        rarityId: null,
      },
    ],
    currency: { currencyId: 'gold', min: 80, max: 100 },
  },
  {
    id: 'loot.greenvale.hollow_lantern',
    rolls: 1,
    emptyChance: 0,
    entries: [
      {
        itemTemplateId: 'material.ore.copper_ore',
        weight: 1,
        minQuantity: 3,
        maxQuantity: 3,
        rarityId: null,
      },
    ],
    currency: { currencyId: 'gold', min: 65, max: 85 },
  },
  {
    id: 'loot.greenvale.brackenmaw',
    rolls: 1,
    emptyChance: 0,
    entries: [
      {
        itemTemplateId: 'armor.leather.trapper_cap',
        weight: 1,
        minQuantity: 1,
        maxQuantity: 1,
        rarityId: null,
      },
    ],
    currency: { currencyId: 'gold', min: 60, max: 90 },
  },
  {
    id: 'loot.greenvale.wolf',
    rolls: 2,
    emptyChance: 0,
    entries: [
      {
        itemTemplateId: 'material.hide.wolf_pelt',
        weight: 45,
        minQuantity: 1,
        maxQuantity: 2,
        rarityId: null,
      },
      {
        itemTemplateId: 'armor.leather.trapper_cap',
        weight: 40,
        minQuantity: 1,
        maxQuantity: 1,
        rarityId: null,
      },
      {
        itemTemplateId: 'accessory.ring.copper_band',
        weight: 15,
        minQuantity: 1,
        maxQuantity: 1,
        rarityId: null,
      },
    ],
    currency: { currencyId: 'gold', min: 5, max: 25 },
  },
];
