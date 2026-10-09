import type { ItemTemplate, ServiceOffer } from '@mmo/schemas';

export const professions = [
  { id: 'herbalism', name: 'Herbalism', materialId: 'material.world.wild_herb' },
  { id: 'woodcutting', name: 'Woodcutting', materialId: 'material.world.hardwood' },
  { id: 'mining', name: 'Mining', materialId: 'material.world.iron_shard' },
  { id: 'crafting', name: 'Fieldcraft', materialId: null },
] as const;
export type ProfessionId = (typeof professions)[number]['id'];
export const professionRank = (xp: number) => Math.min(5, 1 + Math.floor(xp / 100));
export const professionRankNames = ['Novice', 'Apprentice', 'Journeyman', 'Expert', 'Master'];
export const toolFor = (id: string, tier: number) => `tool.${id}.tier${tier}`;
export function craftDuration(offer: ServiceOffer): number {
  return offer.kind === 'craft'
    ? offer.output?.itemTemplateId === 'consumable.greenvale.remedy'
      ? 5000
      : 15000
    : 0;
}
export const remedyEffect = {
  templateId: 'consumable.greenvale.remedy',
  heal: 60,
  cooldownMs: 30000,
};
const base: Omit<ItemTemplate, 'id' | 'name' | 'category' | 'consumable' | 'tags'> = {
  description: '',
  rarityId: 'common',
  itemLevel: 1,
  requiredLevel: 1,
  allowedClassIds: [],
  binding: 'none',
  maxStack: 1,
  tradeable: true,
  marketplaceAllowed: true,
  vaultAllowed: true,
  accountVaultAllowed: true,
  vendorValue: 10,
  iconId: 'icons/items/fieldwork',
  modelId: null,
  equipment: null,
  questId: null,
  goesToMaterialPouch: false,
};
export const professionItems: ItemTemplate[] = [
  ...professions
    .filter((p) => p.materialId)
    .flatMap((p) =>
      [1, 2].map((tier) => ({
        ...base,
        id: toolFor(p.id, tier),
        name: `${tier === 1 ? 'Field' : 'Fine'} ${p.name} Tool`,
        category: 'misc' as const,
        consumable: null,
        tags: ['tool', p.id, `tier${tier}`],
        description:
          tier === 1
            ? 'Carry in your backpack for +1 harvest and +5 profession XP.'
            : 'Requires Apprentice rank. Carry for +2 harvest and +10 profession XP.',
        vendorValue: tier * 20,
      })),
    ),
  {
    ...base,
    id: remedyEffect.templateId,
    name: 'Greenvale Remedy',
    category: 'consumable',
    maxStack: 20,
    description: 'Restores 60 health. Shared remedy cooldown: 30 seconds. Cannot revive.',
    consumable: {
      cooldownGroup: 'remedy',
      cooldownMs: 30000,
      effects: [{ kind: 'heal', amount: 60 }],
    },
    tags: [],
  },
];
export const professionOffers: ServiceOffer[] = [
  ...professions
    .filter((p) => p.materialId)
    .flatMap((p) =>
      [1, 2].map((tier) => ({
        id: `service.greenvale.tool.${p.id}.${tier}`,
        name: `${tier === 1 ? 'Field' : 'Fine'} ${p.name} Tool`,
        npcId: 'npc.world.greenvale_marches.merchant',
        kind: 'buy' as const,
        minLevel: 1,
        inputs: [],
        output: { itemTemplateId: toolFor(p.id, tier), quantity: 1 },
        copper: -tier * 40,
      })),
    ),
  {
    id: 'service.greenvale.craft_remedy',
    name: 'Brew Greenvale Remedy',
    npcId: 'npc.world.greenvale_marches.profession',
    kind: 'craft',
    minLevel: 1,
    inputs: [{ itemTemplateId: 'material.world.wild_herb', quantity: 2 }],
    output: { itemTemplateId: remedyEffect.templateId, quantity: 1 },
    copper: 0,
  },
];
