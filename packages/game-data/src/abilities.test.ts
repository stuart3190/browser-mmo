import { describe, expect, it } from 'vitest';
import { GameData, getGameData, rawGameData, seededRng } from './index';
import {
  abilityAvailability,
  classAbilities,
  cooldownRemainingMs,
  newlyUnlockedAbilities,
  resolveAbility,
  startCooldown,
} from './rules/abilities';
import type { Rng } from './rules/random';

const gd = getGameData();
const rules = gd.raw.combatRules;
const W = 'class.warrior';
const M = 'class.mage';
/** Always hits, never crits, rolls the minimum. */
const minRolls: Rng = { next: () => 0.999999 };
const fixed = (values: number[]): Rng => {
  let i = 0;
  return { next: () => values[i++ % values.length]! };
};
const wolf = { level: 2, armor: 10 };

describe('class abilities', () => {
  it('Warrior and Mage are playable with distinct bars; other classes are not playable', () => {
    expect(classAbilities(gd, W).map((a) => a.id)).toEqual([
      'ability.common.attack',
      'ability.warrior.heavy_strike',
      'ability.warrior.battle_strike',
    ]);
    expect(classAbilities(gd, M).map((a) => a.id)).toEqual([
      'ability.common.attack',
      'ability.mage.firebolt',
      'ability.mage.flame_burst',
    ]);
    expect([...gd.classes.values()].filter((c) => c.playable).map((c) => c.id)).toEqual([W, M]);
  });

  it('enforces class ownership, level unlocks and placeholders', () => {
    expect(abilityAvailability(gd, 'ability.warrior.heavy_strike', W, 1)).toEqual({ ok: true });
    expect(abilityAvailability(gd, 'ability.warrior.heavy_strike', M, 10)).toEqual({
      ok: false,
      reason: 'WRONG_CLASS',
    });
    expect(abilityAvailability(gd, 'ability.mage.firebolt', W, 10)).toEqual({
      ok: false,
      reason: 'WRONG_CLASS',
    });
    expect(abilityAvailability(gd, 'ability.warrior.battle_strike', W, 1)).toEqual({
      ok: false,
      reason: 'LOCKED',
    });
    expect(abilityAvailability(gd, 'ability.warrior.battle_strike', W, 2)).toEqual({ ok: true });
    expect(abilityAvailability(gd, 'ability.mage.flame_burst', M, 1)).toEqual({
      ok: false,
      reason: 'LOCKED',
    });
    expect(abilityAvailability(gd, 'ability.common.attack', M, 1)).toEqual({ ok: true });
    expect(abilityAvailability(gd, 'ability.nope', W, 1)).toEqual({ ok: false, reason: 'UNKNOWN' });
    // a spec placeholder is not on any bar
    expect(abilityAvailability(gd, 'ability.warrior.whirlwind', W, 60).ok).toBe(false);
  });

  it('reports abilities unlocked by a level-up', () => {
    expect(newlyUnlockedAbilities(gd, W, 1, 2).map((a) => a.id)).toEqual([
      'ability.warrior.battle_strike',
    ]);
    expect(newlyUnlockedAbilities(gd, M, 1, 3).map((a) => a.id)).toEqual([
      'ability.mage.flame_burst',
    ]);
    expect(newlyUnlockedAbilities(gd, M, 2, 3)).toEqual([]);
  });
});

describe('cooldowns (server clock)', () => {
  it('ability cooldown and the global cooldown both gate use', () => {
    const hs = gd.abilities.get('ability.warrior.heavy_strike')!;
    const cd = startCooldown(rules, hs, 10_000);
    expect(cd).toEqual({
      readyAtMs: 16_000,
      globalReadyAtMs: 10_000 + rules.abilityGlobalCooldownMs,
    });
    expect(cooldownRemainingMs(cd.readyAtMs, cd.globalReadyAtMs, 10_500)).toBe(5_500);
    expect(cooldownRemainingMs(0, cd.globalReadyAtMs, 10_500)).toBe(500); // another ability: GCD only
    expect(cooldownRemainingMs(cd.readyAtMs, cd.globalReadyAtMs, 16_000)).toBe(0);
  });
});

describe('damage scaling', () => {
  const hs = gd.abilities.get('ability.warrior.heavy_strike')!;
  const fb = gd.abilities.get('ability.mage.firebolt')!;
  const warrior = (strength: number, weapon = { min: 10, max: 10, attackSpeedMs: 2000 }) => ({
    level: 1,
    stats: { strength },
    weapon,
  });

  it('Heavy Strike = base + weapon + Strength, reduced by armour', () => {
    // hit (0.5 < 95%), base roll min (0 -> 8), weapon roll (0 -> 10), no crit (0.99)
    const r = resolveAbility(
      rules,
      hs,
      warrior(10),
      { level: 1, armor: 0 },
      fixed([0.5, 0, 0, 0.99]),
    );
    expect(r).toEqual({ outcome: 'hit', damage: 8 + 10 + 10 * 0.8 });
    const armoured = resolveAbility(rules, hs, warrior(10), wolf, fixed([0.5, 0, 0, 0.99]));
    expect(armoured.damage).toBeLessThan(26);
  });

  it('stronger warriors and better weapons hit harder', () => {
    const at = (s: number, w: number) =>
      resolveAbility(
        rules,
        hs,
        warrior(s, { min: w, max: w, attackSpeedMs: 2000 }),
        wolf,
        fixed([0.5, 0, 0, 0.99]),
      ).damage;
    expect(at(20, 10)).toBeGreaterThan(at(10, 10));
    expect(at(10, 20)).toBeGreaterThan(at(10, 10));
  });

  it('Firebolt = base + Intellect/Spell Power, ignores weapon and armour', () => {
    const mage = (intellect: number, spell_power = 0) => ({
      level: 1,
      stats: { intellect, spell_power },
      weapon: { min: 50, max: 50, attackSpeedMs: 2000 },
    });
    const r = resolveAbility(rules, fb, mage(10), { level: 1, armor: 500 }, fixed([0.5, 0, 0.99]));
    expect(r).toEqual({ outcome: 'hit', damage: 12 + 10 * 0.8 });
    const geared = resolveAbility(
      rules,
      fb,
      mage(10, 10),
      { level: 1, armor: 0 },
      fixed([0.5, 0, 0.99]),
    );
    expect(geared.damage).toBe(12 + 8 + 10);
  });

  it('can miss and crit like melee', () => {
    expect(
      resolveAbility(
        rules,
        fb,
        { level: 1, stats: {}, weapon: { min: 1, max: 1, attackSpeedMs: 1 } },
        wolf,
        minRolls,
      ),
    ).toEqual({
      outcome: 'miss',
      damage: 0,
    });
    const crit = resolveAbility(
      rules,
      fb,
      { level: 1, stats: {}, weapon: { min: 1, max: 1, attackSpeedMs: 1 } },
      { level: 1, armor: 0 },
      fixed([0.5, 0, 0]),
    );
    expect(crit).toEqual({ outcome: 'crit', damage: Math.round(12 * rules.critMultiplier) });
    expect(
      resolveAbility(
        rules,
        fb,
        { level: 1, stats: {}, weapon: { min: 1, max: 1, attackSpeedMs: 1 } },
        wolf,
        seededRng(3),
      ).damage,
    ).toBeGreaterThanOrEqual(0);
  });
});

describe('content validation', () => {
  it('rejects a class listing another class ability and malformed live abilities', () => {
    const bad = structuredClone(rawGameData);
    bad.classes.find((c) => c.id === W)!.baseAbilityIds.push('ability.mage.firebolt');
    expect(() => GameData.load(bad)).toThrow(/belongs to class.mage/);
    const bad2 = structuredClone(rawGameData);
    const fb = bad2.abilities.find((a) => a.id === 'ability.mage.firebolt')!;
    fb.castTimeMs = 1500;
    expect(() => GameData.load(bad2)).toThrow(/cast times/);
  });
});
