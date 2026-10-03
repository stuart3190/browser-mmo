import type {
  AbilityDefinition,
  CharacterClass,
  CharacterSpecialisation,
  SkillDefinition,
} from '@mmo/schemas';

/**
 * PLACEHOLDER classes and specialisations. Names and numbers are NOT final design
 * (see docs/gameplay/classes.md). The architecture — base class + specialisations, data-driven
 * proficiencies and stats — is what matters here.
 */

const ability = (
  id: string,
  name: string,
  targeting: AbilityDefinition['targeting'],
  rangeMeters: number,
  cooldownMs: number,
  unlockLevel = 1,
): AbilityDefinition => ({
  id,
  name,
  description: 'Placeholder ability. No combat implementation exists yet.',
  targeting,
  rangeMeters,
  cooldownMs,
  castTimeMs: 0,
  resourceCost: 0,
  unlockLevel,
  effects: [],
});

export const abilities: AbilityDefinition[] = [
  ability('ability.warrior.strike', 'Strike', 'enemy', 3, 0),
  ability('ability.warrior.shield_wall', 'Shield Wall', 'self', 0, 60_000, 10),
  ability('ability.warrior.whirlwind', 'Whirlwind', 'aoe_self', 5, 10_000, 10),
  ability('ability.mage.firebolt', 'Firebolt', 'enemy', 30, 0),
  ability('ability.mage.frost_nova', 'Frost Nova', 'aoe_self', 8, 20_000, 10),
  ability('ability.ranger.aimed_shot', 'Aimed Shot', 'enemy', 35, 6_000),
  ability('ability.ranger.call_companion', 'Call Companion', 'self', 0, 5_000, 10),
  ability('ability.cleric.mend', 'Mend', 'ally', 30, 0),
  ability('ability.cleric.smite', 'Smite', 'enemy', 25, 0),
];

const spec = (
  id: string,
  classId: string,
  name: string,
  roles: CharacterSpecialisation['roles'],
  abilityIds: string[] = [],
): CharacterSpecialisation => ({
  id,
  classId,
  name,
  roles,
  unlockLevel: 10,
  abilityIds,
  placeholder: true,
});

export const specialisations: CharacterSpecialisation[] = [
  spec(
    'spec.warrior.guardian',
    'class.warrior',
    'Guardian',
    ['tank', 'melee'],
    ['ability.warrior.shield_wall'],
  ),
  spec(
    'spec.warrior.berserker',
    'class.warrior',
    'Berserker',
    ['melee'],
    ['ability.warrior.whirlwind'],
  ),
  spec('spec.warrior.warlord', 'class.warrior', 'Warlord', ['melee', 'support']),
  spec('spec.mage.fire', 'class.mage', 'Fire', ['magic']),
  spec('spec.mage.frost', 'class.mage', 'Frost', ['magic'], ['ability.mage.frost_nova']),
  spec('spec.mage.arcane', 'class.mage', 'Arcane', ['magic']),
  spec('spec.mage.necromancy', 'class.mage', 'Necromancy', ['magic', 'support']),
  spec('spec.ranger.marksman', 'class.ranger', 'Marksman', ['ranged']),
  spec(
    'spec.ranger.beastmaster',
    'class.ranger',
    'Beastmaster',
    ['ranged', 'support'],
    ['ability.ranger.call_companion'],
  ),
  spec('spec.ranger.assassin', 'class.ranger', 'Assassin', ['melee']),
  spec('spec.cleric.healer', 'class.cleric', 'Healer', ['healer']),
  spec('spec.cleric.holy_warrior', 'class.cleric', 'Holy Warrior', ['melee', 'tank']),
  spec('spec.cleric.dark_priest', 'class.cleric', 'Dark Priest', ['magic', 'healer']),
];

const specIds = (classId: string) =>
  specialisations.filter((s) => s.classId === classId).map((s) => s.id);

export const classes: CharacterClass[] = [
  {
    id: 'class.warrior',
    name: 'Warrior',
    description: 'Placeholder melee class.',
    resource: 'rage',
    baseStats: {
      strength: 12,
      agility: 8,
      intellect: 4,
      stamina: 12,
      spirit: 5,
      max_health: 120,
      movement_speed: 6,
    },
    statsPerLevel: { strength: 2, agility: 1, stamina: 2, max_health: 14 },
    armorProficiencies: ['plate', 'mail', 'leather', 'cloth', 'shield'],
    weaponProficiencies: ['sword', 'axe', 'mace', 'dagger', 'crossbow'],
    baseAbilityIds: ['ability.warrior.strike'],
    specialisationIds: specIds('class.warrior'),
    placeholder: true,
  },
  {
    id: 'class.mage',
    name: 'Mage',
    description: 'Placeholder magic class.',
    resource: 'mana',
    baseStats: {
      strength: 4,
      agility: 6,
      intellect: 14,
      stamina: 8,
      spirit: 10,
      max_health: 90,
      max_mana: 150,
      movement_speed: 6,
    },
    statsPerLevel: { intellect: 2, spirit: 1, stamina: 1, max_health: 9, max_mana: 15 },
    armorProficiencies: ['cloth'],
    weaponProficiencies: ['staff', 'wand', 'dagger'],
    baseAbilityIds: ['ability.mage.firebolt'],
    specialisationIds: specIds('class.mage'),
    placeholder: true,
  },
  {
    id: 'class.ranger',
    name: 'Ranger',
    description: 'Placeholder ranged/hybrid class.',
    resource: 'focus',
    baseStats: {
      strength: 7,
      agility: 14,
      intellect: 6,
      stamina: 10,
      spirit: 6,
      max_health: 105,
      movement_speed: 6,
    },
    statsPerLevel: { agility: 2, stamina: 1, strength: 1, max_health: 11 },
    armorProficiencies: ['mail', 'leather', 'cloth'],
    weaponProficiencies: ['bow', 'crossbow', 'dagger', 'sword', 'axe'],
    baseAbilityIds: ['ability.ranger.aimed_shot'],
    specialisationIds: specIds('class.ranger'),
    placeholder: true,
  },
  {
    id: 'class.cleric',
    name: 'Cleric',
    description: 'Placeholder healer/support class.',
    resource: 'mana',
    baseStats: {
      strength: 8,
      agility: 5,
      intellect: 11,
      stamina: 10,
      spirit: 12,
      max_health: 105,
      max_mana: 130,
      movement_speed: 6,
    },
    statsPerLevel: { intellect: 1, spirit: 2, stamina: 1, max_health: 11, max_mana: 12 },
    armorProficiencies: ['mail', 'leather', 'cloth', 'shield'],
    weaponProficiencies: ['mace', 'staff', 'wand'],
    baseAbilityIds: ['ability.cleric.mend', 'ability.cleric.smite'],
    specialisationIds: specIds('class.cleric'),
    placeholder: true,
  },
];

export const skills: SkillDefinition[] = [
  { id: 'skill.mining', name: 'Mining', kind: 'gathering', maxRank: 300 },
  { id: 'skill.herbalism', name: 'Herbalism', kind: 'gathering', maxRank: 300 },
  { id: 'skill.blacksmithing', name: 'Blacksmithing', kind: 'crafting', maxRank: 300 },
];
