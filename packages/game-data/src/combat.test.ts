import { describe, expect, it } from 'vitest';
import {
  applyDamage,
  armorMitigation,
  canPlayerRespawn,
  getGameData,
  isAttackReady,
  maxHealthFromStats,
  nextSwingAt,
  resolveAttack,
  rollLootTable,
  seededRng,
  xpForKill,
} from './index';
import type { Rng } from './index';

const gd = getGameData();
const rules = gd.raw.combatRules;
/** RNG that returns a fixed script of values, for exact outcome tests. */
const scripted = (...values: number[]): Rng => {
  let i = 0;
  return { next: () => values[i++ % values.length]! };
};

describe('damage', () => {
  const attacker = {
    level: 1,
    stats: { strength: 12, attack_power: 8 },
    weapon: { min: 7, max: 13, attackSpeedMs: 2400 },
  };
  it('computes weapon roll + stat bonus, reduced by armour', () => {
    // hit (0.0 < 0.95), weapon roll min (0.0 -> 7), no crit (0.99)
    const r = resolveAttack(rules, attacker, { level: 1, armor: 0 }, scripted(0, 0, 0.99));
    expect(r).toEqual({ outcome: 'hit', damage: 7 + 12 * 0.5 + 8 * 0.25 });
    const armored = resolveAttack(rules, attacker, { level: 1, armor: 120 }, scripted(0, 0, 0.99));
    expect(armored.damage).toBe(Math.round(15 * (1 - 120 / (120 + 100 + 20))));
  });
  it('misses and crits from the roll', () => {
    expect(resolveAttack(rules, attacker, { level: 1, armor: 0 }, scripted(0.999))).toEqual({
      outcome: 'miss',
      damage: 0,
    });
    const crit = resolveAttack(rules, attacker, { level: 1, armor: 0 }, scripted(0, 0, 0));
    expect(crit).toEqual({ outcome: 'crit', damage: Math.round(15 * 1.5) });
  });
  it('always deals at least 1 on a hit and caps mitigation', () => {
    const weak = { level: 1, stats: {}, weapon: { min: 1, max: 1, attackSpeedMs: 2000 } };
    expect(
      resolveAttack(rules, weak, { level: 1, armor: 100_000 }, scripted(0, 0, 0.99)).damage,
    ).toBe(1);
    expect(armorMitigation(rules, 100_000, 1)).toBe(rules.maxMitigation);
    expect(armorMitigation(rules, 0, 1)).toBe(0);
  });
  it('equipment changes output: a sword beats bare hands on average', () => {
    const avg = (weapon: { min: number; max: number }) => {
      const rng = seededRng(7);
      let total = 0;
      for (let i = 0; i < 2000; i++)
        total += resolveAttack(
          rules,
          { level: 1, stats: { strength: 12 }, weapon: { ...weapon, attackSpeedMs: 2000 } },
          { level: 2, armor: 10 },
          rng,
        ).damage;
      return total / 2000;
    };
    expect(avg({ min: 7, max: 13 })).toBeGreaterThan(avg(rules.unarmed.damage) + 5);
  });
});

describe('cooldowns, health and death', () => {
  it('uses server time only and never schedules earlier than before', () => {
    expect(isAttackReady(1000, 999)).toBe(false);
    expect(isAttackReady(1000, 1000)).toBe(true);
    expect(nextSwingAt(1000, 1000, 2000)).toBe(3000);
    // a late tick does not "bank" time; an early request cannot pull the schedule forward
    expect(nextSwingAt(3000, 1500, 2000)).toBe(5000);
  });
  it('transitions alive -> dead exactly once', () => {
    expect(applyDamage(10, 4)).toEqual({ health: 6, killed: false });
    expect(applyDamage(6, 50)).toEqual({ health: 0, killed: true });
    expect(applyDamage(0, 50)).toEqual({ health: 0, killed: false });
  });
  it('derives max health from stats and gates respawn by delay', () => {
    expect(maxHealthFromStats(rules, { max_health: 120, stamina: 12 })).toBe(144);
    expect(canPlayerRespawn(rules, 1000, 1000 + rules.playerRespawnDelayMs - 1)).toBe(false);
    expect(canPlayerRespawn(rules, 1000, 1000 + rules.playerRespawnDelayMs)).toBe(true);
  });
});

describe('rewards', () => {
  const curve = gd.raw.experienceCurve;
  it('scales XP by level difference and greys out low enemies', () => {
    expect(xpForKill(rules, 45, 2, 2, curve)).toBe(45);
    expect(xpForKill(rules, 45, 2, 1, curve)).toBe(Math.round(45 * 1.1));
    expect(xpForKill(rules, 45, 2, 7, curve)).toBe(0);
    expect(xpForKill(rules, 45, 2, curve.maxLevel, curve)).toBe(0);
  });
  it('rolls the wolf loot table deterministically for a seed, within table bounds', () => {
    const table = gd.lootTables.get('loot.greenvale.wolf')!;
    const a = rollLootTable(table, seededRng(99));
    expect(rollLootTable(table, seededRng(99))).toEqual(a);
    expect(a.items).toHaveLength(table.rolls); // emptyChance 0
    for (const i of a.items)
      expect(table.entries.map((e) => e.itemTemplateId)).toContain(i.itemTemplateId);
    expect(a.currency!.amount).toBeGreaterThanOrEqual(5);
    expect(a.currency!.amount).toBeLessThanOrEqual(25);
  });
});
