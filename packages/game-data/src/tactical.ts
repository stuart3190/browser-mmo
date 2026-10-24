import { AbilityDefinitionSchema } from '@mmo/schemas';
import type { ParsedGameData } from './registry';

/** Apply current class playstyles after compiling the preserved historical starter catalog. */
export function withTacticalAbilities(raw: ParsedGameData): ParsedGameData {
  const guard = AbilityDefinitionSchema.parse({
    id: 'ability.warrior.guard',
    name: 'Iron Guard',
    classId: 'class.warrior',
    description:
      'Brace for 4 seconds, reducing incoming damage by 50%. Time it before a heavy strike. No target required.',
    targeting: 'self',
    rangeMeters: 0,
    cooldownMs: 20000,
    castTimeMs: 0,
    resourceCost: 0,
    unlockLevel: 3,
    utility: { kind: 'guard', durationMs: 4000, reduction: 0.5 },
    icon: { glyph: 'IG', color: '#ebc46b' },
  });
  const nova = AbilityDefinitionSchema.parse({
    id: 'ability.mage.frost_nova',
    name: 'Frost Nova',
    classId: 'class.mage',
    description:
      'A burst of frost hits enemies within 6 m and roots them for 3 seconds. Move away to escape melee. Bosses cannot be rooted.',
    targeting: 'aoe_self',
    rangeMeters: 6,
    cooldownMs: 20000,
    castTimeMs: 0,
    resourceCost: 0,
    unlockLevel: 3,
    utility: { kind: 'root', durationMs: 3000 },
    damage: {
      school: 'magic',
      base: { min: 6, max: 8 },
      weaponMultiplier: 0,
      scaling: { intellect: 0.2, spell_power: 0.2 },
    },
    icon: { glyph: 'FN', color: '#83e6ff' },
  });
  return {
    ...raw,
    abilities: [...raw.abilities.map((a) => (a.id === nova.id ? nova : a)), guard],
    classes: raw.classes.map((c) =>
      c.id === 'class.warrior'
        ? {
            ...c,
            description:
              'An armoured front-line fighter. Chain weapon strikes and time Iron Guard against dangerous attacks.',
            baseAbilityIds: [...c.baseAbilityIds, guard.id],
          }
        : c.id === 'class.mage'
          ? {
              ...c,
              description:
                'A ranged spellcaster. Burn distant enemies and use Frost Nova to make space when they close in.',
              baseAbilityIds: [...c.baseAbilityIds, nova.id],
            }
          : c,
    ),
  };
}
