import { describe, expect, it } from 'vitest';
import { seededRng } from '@mmo/game-data';
import type { Collider, Vec3 } from '@mmo/schemas';
import { uuidv7 } from '@mmo/shared';
import { ARENA, WOLF_HOME, arenaGameData } from './test-arena';
import { ZoneSimulation } from './zone-simulation';
import type { CombatantProfile, OutMessage } from './zone-simulation';

const HS = 'ability.warrior.heavy_strike';
const BS = 'ability.warrior.battle_strike';
const FB = 'ability.mage.firebolt';
const FL = 'ability.mage.flame_burst';
const ATTACK = 'ability.common.attack';
const warrior: CombatantProfile = {
  classId: 'class.warrior',
  level: 1,
  stats: { strength: 12 },
  maxHealth: 5000,
  health: 5000,
  weapon: { min: 7, max: 13, attackSpeedMs: 2400 },
};
const mage: CombatantProfile = {
  classId: 'class.mage',
  level: 1,
  stats: { intellect: 14 },
  maxHealth: 5000,
  health: 5000,
  weapon: { min: 1, max: 3, attackSpeedMs: 2000 },
};

function setup(colliders: Collider[] = [], seed = 1) {
  const sim = new ZoneSimulation(arenaGameData({ colliders }), ARENA, {
    rng: seededRng(seed),
    nowMs: 1_000,
  });
  const wolf = sim.listEntities().find((e) => e.kind === 'enemy')!;
  let now = 1_000;
  const msgs = new Map<string, OutMessage[]>();
  const drain = () => {
    for (const [c, l] of sim.drainOutbox()) msgs.set(c, [...(msgs.get(c) ?? []), ...l]);
  };
  const join = (pos: Vec3, combat: CombatantProfile) => {
    const id = uuidv7();
    sim.addPlayer({ characterId: id, name: 'P', maxSpeed: 6, combat }, pos, 0, now);
    sim.setTarget(id, wolf.id);
    drain();
    return id;
  };
  const advance = (ms: number) => {
    const end = now + ms;
    while (now < end) {
      now += 50;
      sim.step(now);
      for (const k of sim.drainKills()) sim.confirmKill(k.killId, now);
      drain();
    }
  };
  const of = <T extends OutMessage['t']>(cid: string, t: T) =>
    (msgs.get(cid) ?? []).filter((m) => m.t === t) as Extract<OutMessage, { t: T }>[];
  return {
    sim,
    wolf,
    join,
    advance,
    of,
    drain,
    get now() {
      return now;
    },
  };
}
const near = { x: WOLF_HOME.x, y: 0, z: WOLF_HOME.z - 2.5 };
const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return (e as { code: string }).code;
  }
  return 'OK';
};

describe('server-authoritative abilities', () => {
  it('Heavy Strike damages the target, starts its cooldown and the global cooldown, rejects spam', () => {
    const t = setup();
    const w = t.join(near, warrior);
    const state0 = t.of(w, 'ability.state').at(-1)!.d;
    expect(state0.abilities.map((a) => [a.abilityId, a.unlocked])).toEqual([
      [ATTACK, true],
      [HS, true],
      [BS, false],
    ]);
    const r = t.sim.useAbility(w, HS, t.now);
    t.drain();
    const dmg = t.of(w, 'combat.damage').find((m) => m.d.abilityId === HS)!;
    expect(dmg.d.amount).toBe(r.damage);
    expect(t.sim.getEnemy(t.wolf.id)!.health).toBe(80 - r.damage);
    const st = t.of(w, 'ability.state').at(-1)!.d;
    expect(st.abilities.find((a) => a.abilityId === HS)!.readyAt).toBe(t.now + 6000);
    expect(st.globalReadyAt).toBe(t.now + 1000);
    // spam: same tick, later in the cooldown, a forged "client ready" claim is impossible (no input)
    for (let i = 0; i < 10; i++)
      expect(code(() => t.sim.useAbility(w, HS, t.now + i * 100))).toBe('ON_COOLDOWN');
    expect(t.of(w, 'combat.damage').filter((m) => m.d.abilityId === HS)).toHaveLength(1);
    t.advance(6000);
    if (t.sim.getEnemy(t.wolf.id)?.mode === 'engaged' || t.sim.getEnemy(t.wolf.id)?.mode === 'idle')
      expect(code(() => t.sim.useAbility(w, HS, t.now))).toBe('OK');
  });

  it('class ownership and level unlocks are enforced; a level-up unlocks and announces', () => {
    const t = setup();
    const w = t.join(near, warrior);
    const m = t.join({ x: WOLF_HOME.x + 1, y: 0, z: WOLF_HOME.z - 15 }, mage);
    expect(code(() => t.sim.useAbility(w, FB, t.now))).toBe('ABILITY_NOT_AVAILABLE');
    expect(code(() => t.sim.useAbility(m, HS, t.now))).toBe('ABILITY_NOT_AVAILABLE');
    expect(code(() => t.sim.useAbility(m, 'ability.warrior.whirlwind', t.now))).toBe(
      'ABILITY_NOT_AVAILABLE',
    );
    expect(code(() => t.sim.useAbility(m, 'ability.nope', t.now))).toBe('ABILITY_UNKNOWN');
    expect(code(() => t.sim.useAbility(w, BS, t.now))).toBe('ABILITY_LOCKED');
    expect(code(() => t.sim.useAbility(m, FL, t.now))).toBe('ABILITY_LOCKED');
    t.sim.updateCombatProfile(w, { ...warrior, level: 2 }, t.now);
    t.drain();
    const st = t.of(w, 'ability.state').at(-1)!.d;
    expect(st.newlyUnlocked).toEqual([BS]);
    expect(st.abilities.find((a) => a.abilityId === BS)!.unlocked).toBe(true);
    expect(code(() => t.sim.useAbility(w, BS, t.now))).toBe('OK');
  });

  it('Firebolt hits at range; melee abilities and out-of-range spells are rejected', () => {
    const t = setup();
    const far = { x: WOLF_HOME.x, y: 0, z: WOLF_HOME.z - 20 };
    const m = t.join(far, mage);
    const w = t.join({ x: WOLF_HOME.x + 1, y: 0, z: WOLF_HOME.z - 20 }, warrior);
    expect(code(() => t.sim.useAbility(w, HS, t.now))).toBe('OUT_OF_RANGE');
    const r = t.sim.useAbility(m, FB, t.now);
    t.drain();
    expect(
      t.of(m, 'combat.damage').some((d) => d.d.abilityId === FB && d.d.amount === r.damage),
    ).toBe(true);
    const tooFar = t.join({ x: WOLF_HOME.x - 1, y: 0, z: WOLF_HOME.z - 40 }, mage);
    expect(code(() => t.sim.useAbility(tooFar, FB, t.now))).toBe('OUT_OF_RANGE');
  });

  it('line of sight is required', () => {
    const wall: Collider = {
      shape: 'box',
      x: WOLF_HOME.x,
      z: WOLF_HOME.z - 6,
      halfWidth: 4,
      halfDepth: 0.2,
      rotationY: 0,
      blocksSight: true,
    };
    const t = setup([wall]);
    const m = t.join({ x: WOLF_HOME.x, y: 0, z: WOLF_HOME.z - 12 }, mage);
    expect(code(() => t.sim.useAbility(m, FB, t.now))).toBe('NO_LINE_OF_SIGHT');
    expect(t.sim.getEnemy(t.wolf.id)!.health).toBe(80);
  });

  it('rejects no target, dead target and a dead caster', () => {
    const t = setup();
    const dead = t.join(near, { ...warrior, health: 0 });
    expect(code(() => t.sim.useAbility(dead, HS, t.now))).toBe('YOU_ARE_DEAD');
    const w = t.join(near, { ...warrior, weapon: { min: 400, max: 400, attackSpeedMs: 2400 } });
    t.sim.setTarget(w, null);
    expect(code(() => t.sim.useAbility(w, HS, t.now))).toBe('NO_TARGET');
    t.sim.setTarget(w, t.wolf.id);
    t.sim.useAbility(w, HS, t.now); // kills (400 weapon)
    expect(['dying', 'dead']).toContain(t.sim.getEnemy(t.wolf.id)!.mode);
    t.advance(6100);
    expect(code(() => t.sim.useAbility(w, HS, t.now))).toMatch(/TARGET_DEAD|INVALID_TARGET/);
  });

  it('effective stats and gear change ability output (same rolls)', () => {
    const fire = (profile: CombatantProfile) => {
      const t = setup([], 42);
      const m = t.join({ x: WOLF_HOME.x, y: 0, z: WOLF_HOME.z - 15 }, profile);
      return t.sim.useAbility(m, FB, t.now);
    };
    const base = fire(mage);
    const geared = fire({ ...mage, stats: { intellect: 14, spell_power: 12 } });
    if (base.outcome !== 'miss') expect(geared.damage).toBeGreaterThan(base.damage);
    const strike = (weapon: CombatantProfile['weapon']) => {
      const t = setup([], 42);
      const w = t.join(near, { ...warrior, weapon });
      return t.sim.useAbility(w, HS, t.now);
    };
    const fists = strike({ min: 1, max: 3, attackSpeedMs: 2000 });
    const sword = strike({ min: 7, max: 13, attackSpeedMs: 2400 });
    if (fists.outcome !== 'miss') expect(sword.damage).toBeGreaterThan(fists.damage);
  });

  it('cooldowns survive leaving and re-entering the world', () => {
    const t = setup();
    const w = t.join(near, warrior);
    t.sim.useAbility(w, HS, t.now);
    const left = t.sim.removePlayer(w)!;
    expect(left.abilityCooldowns[HS]).toBe(t.now + 6000);
    t.advance(2000);
    const id = uuidv7();
    t.sim.addPlayer(
      {
        characterId: id,
        name: 'P',
        maxSpeed: 6,
        combat: { ...warrior, abilityCooldowns: left.abilityCooldowns },
      },
      near,
      0,
      t.now,
    );
    t.sim.setTarget(id, t.wolf.id);
    t.drain();
    expect(
      t
        .of(id, 'ability.state')
        .at(-1)!
        .d.abilities.find((a) => a.abilityId === HS)!.readyAt,
    ).toBe(left.abilityCooldowns[HS]);
    expect(code(() => t.sim.useAbility(id, HS, t.now))).toBe('ON_COOLDOWN');
  });

  it('the shared Attack ability toggles auto-attack for both classes', () => {
    const t = setup();
    const m = t.join(near, mage);
    t.sim.useAbility(m, ATTACK, t.now);
    t.drain();
    expect(t.of(m, 'combat.state').at(-1)!.d.attacking).toBe(true);
    t.sim.useAbility(m, ATTACK, t.now);
    t.drain();
    expect(t.of(m, 'combat.state').at(-1)!.d.attacking).toBe(false);
  });
});
