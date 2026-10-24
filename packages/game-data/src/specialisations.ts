import type { AbilityDefinition } from '@mmo/schemas';
import type { ParsedGameData } from './registry';

/** First class paths: alter existing tactical choices without adding action-bar clutter. */
export const specialisationPaths = [
  {
    id: 'spec.warrior.guardian',
    classId: 'class.warrior',
    name: 'Guardian',
    description:
      'Iron Guard blocks 70% of incoming damage for four seconds. Brace for dangerous attacks.',
    abilityId: 'ability.warrior.guard',
    reduction: 0.7,
  },
  {
    id: 'spec.warrior.berserker',
    classId: 'class.warrior',
    name: 'Berserker',
    description:
      'Heavy Strike recovers in four seconds instead of six. Keep pressure on your target.',
    abilityId: 'ability.warrior.heavy_strike',
    cooldownMs: 4000,
  },
  {
    id: 'spec.mage.fire',
    classId: 'class.mage',
    name: 'Fire',
    description: 'Flame Burst recovers in seven seconds instead of ten. Chain your ranged spells.',
    abilityId: 'ability.mage.flame_burst',
    cooldownMs: 7000,
  },
  {
    id: 'spec.mage.frost',
    classId: 'class.mage',
    name: 'Frost',
    description:
      'Frost Nova recovers in twelve seconds instead of twenty. Make space more often; bosses still resist roots.',
    abilityId: 'ability.mage.frost_nova',
    cooldownMs: 12000,
  },
] as const;
export const specialisationLevel = 5;
export const specialisationMentors: readonly string[] = [
  'npc.greenvale.elder_maren',
  'npc.amber_coast.iona',
];
export function effectiveAbility(
  ability: AbilityDefinition,
  classId: string,
  level: number,
  specialisationId?: string | null,
): AbilityDefinition {
  const path = specialisationPaths.find((p) => p.id === specialisationId && p.classId === classId);
  if (!path || level < specialisationLevel || path.abilityId !== ability.id) return ability;
  return {
    ...ability,
    description: path.description,
    ...('cooldownMs' in path ? { cooldownMs: path.cooldownMs } : {}),
    ...('reduction' in path && ability.utility?.kind === 'guard'
      ? { utility: { ...ability.utility, reduction: path.reduction } }
      : {}),
  };
}
export function withSpecialisationPaths(raw: ParsedGameData): ParsedGameData {
  return {
    ...raw,
    specialisations: raw.specialisations.map((s) => {
      const path = specialisationPaths.find((p) => p.id === s.id);
      return path
        ? {
            ...s,
            unlockLevel: specialisationLevel,
            placeholder: false,
            abilityIds: [path.abilityId],
          }
        : s;
    }),
  };
}
