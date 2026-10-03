import type { ItemRarityDefinition } from '@mmo/schemas';

/**
 * Rarity table. Balancing numbers live ONLY here. Code must read these definitions instead of
 * branching on rarity IDs. Numbers are first-pass placeholders, not tuned balance.
 */
export const rarities: ItemRarityDefinition[] = [
  {
    id: 'common',
    name: 'Common',
    tier: 0,
    color: '#c8c8c8',
    modifierCount: { min: 0, max: 0 },
    statMultiplier: 1.0,
    socketCount: { min: 0, max: 0 },
    dropWeight: 1000,
    announceOnDrop: false,
  },
  {
    id: 'uncommon',
    name: 'Uncommon',
    tier: 1,
    color: '#3ec43e',
    modifierCount: { min: 1, max: 1 },
    statMultiplier: 1.1,
    socketCount: { min: 0, max: 0 },
    dropWeight: 300,
    announceOnDrop: false,
  },
  {
    id: 'rare',
    name: 'Rare',
    tier: 2,
    color: '#3f7fe0',
    modifierCount: { min: 1, max: 2 },
    statMultiplier: 1.25,
    socketCount: { min: 0, max: 1 },
    dropWeight: 80,
    announceOnDrop: false,
  },
  {
    id: 'epic',
    name: 'Epic',
    tier: 3,
    color: '#a34ee0',
    modifierCount: { min: 2, max: 3 },
    statMultiplier: 1.45,
    socketCount: { min: 1, max: 1 },
    dropWeight: 15,
    announceOnDrop: false,
  },
  {
    id: 'legendary',
    name: 'Legendary',
    tier: 4,
    color: '#f08a24',
    modifierCount: { min: 3, max: 4 },
    statMultiplier: 1.7,
    socketCount: { min: 1, max: 2 },
    dropWeight: 2,
    announceOnDrop: true,
  },
  {
    id: 'mythic',
    name: 'Mythic',
    tier: 5,
    color: '#e0304e',
    modifierCount: { min: 4, max: 4 },
    statMultiplier: 2.0,
    socketCount: { min: 2, max: 3 },
    dropWeight: 0,
    announceOnDrop: true,
  },
];
