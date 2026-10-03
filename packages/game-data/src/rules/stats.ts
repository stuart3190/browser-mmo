import type { CharacterClass, CharacterStats, StatBlock, StatKey } from '@mmo/schemas';

export function addStats(...blocks: StatBlock[]): StatBlock {
  const out: StatBlock = {};
  for (const block of blocks) {
    for (const [key, value] of Object.entries(block) as [StatKey, number][]) {
      out[key] = (out[key] ?? 0) + value;
    }
  }
  return out;
}

export function scaleStats(block: StatBlock, factor: number): StatBlock {
  const out: StatBlock = {};
  for (const [key, value] of Object.entries(block) as [StatKey, number][]) {
    out[key] = value * factor;
  }
  return out;
}

/** Base stats of a class at a level (before gear). */
export function baseStatsForLevel(cls: CharacterClass, level: number): StatBlock {
  return addStats(cls.baseStats, scaleStats(cls.statsPerLevel, Math.max(0, level - 1)));
}

/** Total stats = class base at level + every equipped item's stats/modifiers/enchantments. */
export function computeCharacterStats(
  cls: CharacterClass,
  level: number,
  equippedItemStats: StatBlock[],
): CharacterStats {
  const base = baseStatsForLevel(cls, level);
  const fromEquipment = addStats(...equippedItemStats);
  return { base, fromEquipment, total: addStats(base, fromEquipment) };
}
