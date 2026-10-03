import type { GameData } from '@mmo/game-data';
import { TWO_HANDED_SLOT_TYPES, itemTotalStats } from '@mmo/game-data';
import type { CharacterClass, Item, StatBlock, StatKey } from '@mmo/schemas';

/**
 * Pure presentation logic for item UIs (tooltips, comparisons, equip targeting). Everything is
 * derived from game data and server-provided instances; nothing here is authoritative.
 */

export const STAT_LABELS: Record<StatKey, string> = {
  strength: 'Strength',
  agility: 'Agility',
  intellect: 'Intellect',
  stamina: 'Stamina',
  spirit: 'Spirit',
  armor: 'Armour',
  block: 'Block',
  dodge: 'Dodge',
  attack_power: 'Attack Power',
  spell_power: 'Spell Power',
  crit_rating: 'Critical Strike',
  haste_rating: 'Haste',
  max_health: 'Health',
  max_mana: 'Mana',
  movement_speed: 'Movement Speed',
};

/** Display order for character sheets. */
export const STAT_ORDER: StatKey[] = [
  'max_health',
  'max_mana',
  'strength',
  'agility',
  'intellect',
  'stamina',
  'spirit',
  'armor',
  'block',
  'dodge',
  'attack_power',
  'spell_power',
  'crit_rating',
  'haste_rating',
  'movement_speed',
];

export function bindingLabel(item: Item): string | null {
  const b = item.instance.binding;
  if (b.kind === 'character') return 'Soulbound';
  if (b.kind === 'account') return 'Account bound';
  switch (item.template.binding) {
    case 'on_pickup':
      return 'Binds when picked up';
    case 'on_equip':
      return 'Binds when equipped';
    case 'account':
      return 'Binds to account';
    default:
      return null;
  }
}

/**
 * Which equipment slot an "Equip" action should target: the first accepting slot that is empty,
 * else the first accepting slot (swap). One-handed weapons always target the main hand (swap):
 * dual-wield rules are not designed yet, so the off hand is only used when explicitly chosen.
 */
export function chooseEquipSlot(
  gameData: GameData,
  item: Item,
  equipped: ReadonlyMap<string, Item>,
): string | null {
  const slotType = item.template.equipment?.slotType;
  if (!slotType) return null;
  if (slotType === 'one_hand' && gameData.equipmentSlots.has('main_hand')) return 'main_hand';
  const candidates = gameData.raw.equipmentSlots
    .filter((s) => s.accepts.includes(slotType))
    .sort((a, b) => a.order - b.order);
  if (candidates.length === 0) return null;
  return (candidates.find((s) => !equipped.has(s.id)) ?? candidates[0]!).id;
}

/** The equipped item(s) an item would be compared with (the slot `chooseEquipSlot` would replace). */
export function comparisonTarget(
  gameData: GameData,
  item: Item,
  equipped: ReadonlyMap<string, Item>,
): { slotId: string; item: Item | null } | null {
  if (item.instance.location.kind === 'equipped') return null;
  const slotId = chooseEquipSlot(gameData, item, equipped);
  if (!slotId) return null;
  return { slotId, item: equipped.get(slotId) ?? null };
}

export interface StatDelta {
  stat: StatKey;
  label: string;
  from: number;
  to: number;
  delta: number;
}

/** Per-stat difference of equipping `candidate` instead of `current` (null = empty slot). */
export function compareItemStats(candidate: Item, current: Item | null): StatDelta[] {
  const a = itemTotalStats(candidate.instance);
  const b: StatBlock = current ? itemTotalStats(current.instance) : {};
  const keys = new Set([...Object.keys(a), ...Object.keys(b)] as StatKey[]);
  return STAT_ORDER.filter((k) => keys.has(k))
    .map((stat) => {
      const to = a[stat] ?? 0;
      const from = b[stat] ?? 0;
      return { stat, label: STAT_LABELS[stat], from, to, delta: to - from };
    })
    .filter((d) => d.delta !== 0);
}

export interface Requirement {
  text: string;
  met: boolean;
}

/** Requirement lines for a tooltip, evaluated against the viewing character (display only). */
export function itemRequirements(
  gameData: GameData,
  item: Item,
  viewer: { level: number; cls: CharacterClass },
): Requirement[] {
  const t = item.template;
  const out: Requirement[] = [];
  if (t.requiredLevel > 1)
    out.push({ text: `Requires level ${t.requiredLevel}`, met: viewer.level >= t.requiredLevel });
  if (t.allowedClassIds.length > 0) {
    const names = t.allowedClassIds.map((id) => gameData.classes.get(id)?.name ?? id).join(', ');
    out.push({ text: `Classes: ${names}`, met: t.allowedClassIds.includes(viewer.cls.id) });
  }
  const eqType = t.equipment ? gameData.equipmentTypes.get(t.equipment.equipmentTypeId) : undefined;
  if (eqType?.requiresProficiency) {
    const prof = [...viewer.cls.armorProficiencies, ...viewer.cls.weaponProficiencies].includes(
      eqType.id,
    );
    out.push({ text: `${eqType.name} proficiency`, met: prof });
  }
  return out;
}

const SLOT_TYPE_LABELS: Record<string, string> = {
  one_hand: 'One-Hand',
  main_hand: 'Main Hand',
  two_hand: 'Two-Hand',
  off_hand: 'Off Hand',
};

/** "Two-Hand Staff", "Chest Plate", "Ring"... */
export function itemTypeLine(gameData: GameData, item: Item): string {
  const eq = item.template.equipment;
  if (!eq) return capitalise(item.template.category);
  const type = gameData.equipmentTypes.get(eq.equipmentTypeId)?.name ?? eq.equipmentTypeId;
  const slot = SLOT_TYPE_LABELS[eq.slotType] ?? capitalise(eq.slotType);
  return slot.toLowerCase() === type.toLowerCase() ? type : `${slot} ${type}`;
}

export function isTwoHanded(item: Item): boolean {
  return (TWO_HANDED_SLOT_TYPES as readonly string[]).includes(
    item.template.equipment?.slotType ?? '',
  );
}

/** Two-letter icon placeholder until real icons exist (art pipeline: icons/items/<templateId>.png). */
export function iconInitials(item: Item): string {
  const words = item.template.name
    .replace(/[^A-Za-z ]/g, '')
    .split(/\s+/)
    .filter(Boolean);
  return ((words[0]?.[0] ?? '?') + (words[1]?.[0] ?? words[0]?.[1] ?? '')).toUpperCase();
}

function capitalise(s: string): string {
  return s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}
