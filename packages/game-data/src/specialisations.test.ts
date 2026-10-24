import { expect, it } from 'vitest';
import { GameData, getGameData } from './index';
import { effectiveAbility, specialisationPaths, withSpecialisationPaths } from './specialisations';
const gd = getGameData();
it('exposes four class paths with live abilities while preserving future definitions', () => {
  const current = GameData.load(withSpecialisationPaths(gd.raw));
  const live = current.raw.specialisations.filter((s) => !s.placeholder);
  expect(live.map((s) => s.id).sort()).toEqual(specialisationPaths.map((p) => p.id).sort());
  for (const path of live) {
    expect(path.unlockLevel).toBe(5);
    for (const id of path.abilityIds) expect(current.abilities.get(id)?.placeholder).toBe(false);
  }
  expect(current.specialisations.get('spec.warrior.warlord')?.placeholder).toBe(true);
});
it('requires the correct class and level, leaves unrelated attacks unchanged and preserves base definitions', () => {
  const a = gd.abilities.get('ability.mage.frost_nova')!;
  expect(effectiveAbility(a, 'class.mage', 5, 'spec.mage.frost').cooldownMs).toBe(12000);
  expect(effectiveAbility(a, 'class.mage', 4, 'spec.mage.frost')).toBe(a);
  expect(effectiveAbility(a, 'class.warrior', 5, 'spec.mage.frost')).toBe(a);
  expect(effectiveAbility(a, 'class.mage', 5, 'spec.mage.fire')).toBe(a);
  expect(effectiveAbility(a, 'class.mage', 5, 'spec.mage.arcane')).toBe(a);
  expect(a.cooldownMs).toBe(20000);
  const guard = gd.abilities.get('ability.warrior.guard')!;
  expect(effectiveAbility(guard, 'class.warrior', 5, 'spec.warrior.guardian').utility).toEqual({
    kind: 'guard',
    durationMs: 4000,
    reduction: 0.7,
  });
  expect(guard.utility).toEqual({ kind: 'guard', durationMs: 4000, reduction: 0.5 });
});
