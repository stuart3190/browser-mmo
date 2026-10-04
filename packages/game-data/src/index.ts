import { abilities, classes, skills, specialisations } from './content/classes';
import { combatRules } from './content/combat';
import { currencies, experienceCurve, marketplaceRules } from './content/economy';
import { equipmentSlots, equipmentTypes } from './content/equipment';
import { itemModifiers, itemTemplates } from './content/items';
import { lootTables } from './content/loot';
import { rarities } from './content/rarities';
import { chunks, dungeons, enemies, npcs, quests, regions, zones } from './content/world';
import { GameData } from './registry';
import type { RawGameData } from './registry';

export { GameData, RawGameDataSchema } from './registry';
export type { RawGameData, ParsedGameData } from './registry';
export { PRIMARY_CURRENCY_ID } from './content/economy';
export { TWO_HANDED_SLOT_TYPES } from './content/equipment';
export * from './rules/items';
export * from './rules/equipment';
export * from './rules/stats';
export * from './rules/xp';
export * from './rules/random';
export * from './rules/marketplace';
export * from './rules/world';
export * from './rules/combat';
export * from './rules/collision';
export * from './rules/quests';
export * from './rules/abilities';
export { propShapes, PLAYER_COLLISION_RADIUS, ENEMY_COLLISION_RADIUS } from './content/props';
export type { PropKind, PropShape } from './content/props';

/** The raw authored content bundle. */
export const rawGameData: RawGameData = {
  rarities,
  equipmentSlots,
  equipmentTypes,
  currencies,
  marketplaceRules,
  experienceCurve,
  combatRules,
  abilities,
  specialisations,
  classes,
  skills,
  itemTemplates,
  itemModifiers,
  lootTables,
  regions,
  zones,
  chunks,
  npcs,
  enemies,
  quests,
  dungeons,
};

let cached: GameData | undefined;

/** Validated singleton. Throws at startup if content is inconsistent (fail fast, never at runtime). */
export function getGameData(): GameData {
  cached ??= GameData.load(rawGameData);
  return cached;
}

export const DEMO_ZONE_ID = 'zone.greenvale.meadows';
