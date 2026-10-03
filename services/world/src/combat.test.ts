import { describe, expect, it } from 'vitest';
import { DEMO_ZONE_ID, getGameData, seededRng } from '@mmo/game-data';
import type { Vec3 } from '@mmo/schemas';
import { uuidv7 } from '@mmo/shared';
import { ZoneSimulation } from './zone-simulation';
import type { CombatantProfile, OutMessage } from './zone-simulation';

const gd = getGameData();
const WOLF_HOME = { x: 2, y: 0, z: 14 };
const FAR: Vec3 = { x: -40, y: 0, z: 40 };
const fists: CombatantProfile = {
  level: 1,
  stats: { strength: 12, stamina: 12 },
  maxHealth: 144,
  health: 144,
  weapon: { min: 1, max: 3, attackSpeedMs: 2000 },
};

function setup(seed = 1) {
  const sim = new ZoneSimulation(gd, DEMO_ZONE_ID, { rng: seededRng(seed) });
  const wolf = sim.listEntities().find((e) => e.kind === 'enemy')!;
  let now = 1_000;
  const join = (pos: Vec3, combat: CombatantProfile = fists) => {
    const id = uuidv7();
    const entityId = sim.addPlayer(
      { characterId: id, name: 'P', maxSpeed: 6, combat },
      pos,
      0,
      now,
    );
    return { id, entityId };
  };
  const msgs = new Map<string, OutMessage[]>();
  const advance = (ms: number) => {
    const end = now + ms;
    while (now < end) {
      now += 50;
      sim.step(now);
      for (const [cid, list] of sim.drainOutbox())
        msgs.set(cid, [...(msgs.get(cid) ?? []), ...list]);
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
    msgs,
    get now() {
      return now;
    },
  };
}

describe('target + attack validation', () => {
  it('rejects attacking with no target, a non-hostile target, out of range, and while dead', () => {
    const t = setup();
    const p = t.join(FAR);
    expect(() => t.sim.startAttack(p.id)).toThrow(expect.objectContaining({ code: 'NO_TARGET' }));
    expect(() => t.sim.setTarget(p.id, 'e:999')).toThrow(
      expect.objectContaining({ code: 'INVALID_TARGET' }),
    );
    const npc = t.sim.listEntities().find((e) => e.kind === 'npc')!;
    t.sim.setTarget(p.id, npc.id);
    expect(() => t.sim.startAttack(p.id)).toThrow(
      expect.objectContaining({ code: 'INVALID_TARGET' }),
    );
    t.sim.setTarget(p.id, t.wolf.id);
    expect(() => t.sim.startAttack(p.id)).toThrow(
      expect.objectContaining({ code: 'OUT_OF_RANGE' }),
    );
    const dead = t.join({ x: -40, y: 0, z: 38 }, { ...fists, health: 0 });
    t.sim.setTarget(dead.id, t.wolf.id);
    expect(() => t.sim.startAttack(dead.id)).toThrow(
      expect.objectContaining({ code: 'YOU_ARE_DEAD' }),
    );
  });
});

describe('auto-attack', () => {
  it('damages the wolf on the server swing timer only; spamming start does not speed it up', () => {
    const t = setup();
    const p = t.join({ x: 2, y: 0, z: 12 });
    t.sim.setTarget(p.id, t.wolf.id);
    t.sim.startAttack(p.id);
    for (let i = 0; i < 40; i++) {
      t.sim.startAttack(p.id); // replayed/spammed start requests are no-ops
      t.advance(50);
    }
    const swings = t.of(p.id, 'combat.damage').filter((m) => m.d.sourceId === p.entityId);
    // 2000 ms window at 2000 ms attack speed: first swing immediately, second at +2000 at most
    expect(swings.length).toBeGreaterThanOrEqual(1);
    expect(swings.length).toBeLessThanOrEqual(2);
    expect(t.sim.getEnemy(t.wolf.id)!.health).toBeLessThan(80);
    expect(t.sim.getEnemy(t.wolf.id)!.taggedBy).toBe(p.id);
  });

  it('kills the wolf exactly once, stops attacking, emits one kill event, then respawns a new wolf', () => {
    const t = setup(3);
    const p = t.join(
      { x: 2, y: 0, z: 12 },
      { ...fists, weapon: { min: 40, max: 40, attackSpeedMs: 1000 } },
    );
    t.sim.setTarget(p.id, t.wolf.id);
    t.sim.startAttack(p.id);
    t.advance(6_000);
    expect(t.sim.getEnemy(t.wolf.id)!.mode).toBe('dead');
    const kills = t.sim.drainKills();
    expect(kills).toHaveLength(1);
    expect(kills[0]).toMatchObject({ enemyId: 'enemy.greenvale.grey_wolf', characterId: p.id });
    expect(t.of(p.id, 'combat.death').filter((m) => m.d.kind === 'enemy')).toHaveLength(1);
    expect(
      t.of(p.id, 'combat.state').some((m) => m.d.reason === 'target_dead' && !m.d.attacking),
    ).toBe(true);
    expect(() => t.sim.startAttack(p.id)).toThrow(expect.objectContaining({ code: 'TARGET_DEAD' }));
    t.advance(10_000);
    expect(t.sim.drainKills()).toHaveLength(0);
    const respawned = t.sim.listEntities().find((e) => e.kind === 'enemy')!;
    expect(respawned.id).not.toBe(t.wolf.id);
    expect(respawned).toMatchObject({ health: 80, dead: false, position: WOLF_HOME });
  });

  it('uses the current weapon: a better weapon profile kills faster', () => {
    const ttk = (weapon: CombatantProfile['weapon']) => {
      const t = setup(11);
      const p = t.join(
        { x: 2, y: 0, z: 12 },
        { ...fists, maxHealth: 10_000, health: 10_000, weapon },
      );
      t.sim.setTarget(p.id, t.wolf.id);
      t.sim.startAttack(p.id);
      let ms = 0;
      while (t.sim.getEnemy(t.wolf.id)!.mode !== 'dead' && ms < 120_000) {
        t.advance(100);
        ms += 100;
      }
      return ms;
    };
    expect(ttk({ min: 7, max: 13, attackSpeedMs: 2400 })).toBeLessThan(
      ttk({ min: 1, max: 3, attackSpeedMs: 2000 }),
    );
  });
});

describe('enemy AI, player death and respawn', () => {
  it('wolf aggroes, closes distance, hits the player, kills them; dead players cannot act; respawn after delay', () => {
    const t = setup(5);
    const p = t.join({ x: 2, y: 0, z: 8 }, { ...fists, health: 12 });
    t.advance(15_000);
    const hits = t.of(p.id, 'combat.damage').filter((m) => m.d.targetId === p.entityId);
    expect(hits.length).toBeGreaterThan(0);
    const me = t.sim.getPlayer(p.id)!;
    expect(me).toMatchObject({ dead: true, health: 0 });
    expect(t.of(p.id, 'combat.state').some((m) => m.d.reason === 'you_died')).toBe(true);
    expect(t.sim.getEnemy(t.wolf.id)!.mode).not.toBe('engaged'); // wolf disengaged
    expect(t.sim.handleMove(p.id, { x: 2.5, y: 0, z: 8 }, 0, t.now)).toBe(false);
    expect(() => t.sim.reservePickup(p.id, 'e:1')).toThrow(
      expect.objectContaining({ code: 'YOU_ARE_DEAD' }),
    );
    // respawn gating uses server time
    const died = t.of(p.id, 'player.vitals').find((m) => m.d.dead)!;
    expect(died.d.respawnAvailableAt).not.toBeNull();
    t.sim.respawn(p.id, t.now);
    const after = t.sim.getPlayer(p.id)!;
    expect(after).toMatchObject({
      dead: false,
      health: 144,
      position: gd.zone(DEMO_ZONE_ID).defaultSpawn,
    });
    expect(() => t.sim.respawn(p.id, t.now)).toThrow(expect.objectContaining({ code: 'NOT_DEAD' }));
  });

  it('rejects an early respawn', () => {
    const t = setup();
    const p = t.join(FAR, { ...fists, health: 0 });
    expect(() => t.sim.respawn(p.id, t.now)).toThrow(
      expect.objectContaining({ code: 'RESPAWN_NOT_READY' }),
    );
  });

  it('wolf evades and resets to full health when its target leaves', () => {
    const t = setup(9);
    const p = t.join({ x: 2, y: 0, z: 12 });
    t.sim.setTarget(p.id, t.wolf.id);
    t.sim.startAttack(p.id);
    t.advance(2_500);
    expect(t.sim.getEnemy(t.wolf.id)!.health).toBeLessThan(80);
    t.sim.removePlayer(p.id);
    t.advance(5_000);
    expect(t.sim.getEnemy(t.wolf.id)).toMatchObject({ mode: 'idle', health: 80, taggedBy: null });
  });

  it('credits the first character to damage the wolf (tagging), not a later killer', () => {
    const t = setup(2);
    const a = t.join({ x: 2, y: 0, z: 12 });
    const b = t.join(
      { x: 3, y: 0, z: 12 },
      { ...fists, weapon: { min: 200, max: 200, attackSpeedMs: 1000 } },
    );
    t.sim.setTarget(a.id, t.wolf.id);
    t.sim.startAttack(a.id);
    t.advance(100);
    t.sim.setTarget(b.id, t.wolf.id);
    t.sim.startAttack(b.id);
    t.advance(2_000);
    const kills = t.sim.drainKills();
    expect(kills).toHaveLength(1);
    expect(kills[0]!.characterId).toBe(a.id);
  });

  it('regenerates health out of combat', () => {
    const t = setup();
    const p = t.join(FAR, { ...fists, health: 50 });
    t.advance(gd.raw.combatRules.regenDelayMs + 2_000);
    expect(t.sim.getPlayer(p.id)!.health).toBeGreaterThan(50);
  });
});
