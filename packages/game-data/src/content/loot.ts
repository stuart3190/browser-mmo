import type { LootTable } from '@mmo/schemas';

export const lootTables: LootTable[] = [
  {
    id: 'loot.greenvale.wolf',
    rolls: 1,
    emptyChance: 0.4,
    entries: [
      {
        itemTemplateId: 'material.hide.wolf_pelt',
        weight: 80,
        minQuantity: 1,
        maxQuantity: 2,
        rarityId: null,
      },
      {
        itemTemplateId: 'armor.leather.trapper_cap',
        weight: 15,
        minQuantity: 1,
        maxQuantity: 1,
        rarityId: null,
      },
      {
        itemTemplateId: 'accessory.ring.copper_band',
        weight: 5,
        minQuantity: 1,
        maxQuantity: 1,
        rarityId: null,
      },
    ],
    currency: { currencyId: 'gold', min: 5, max: 25 },
  },
];
