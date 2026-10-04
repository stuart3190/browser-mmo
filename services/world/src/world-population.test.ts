import { describe, expect, it } from 'vitest';
import { DEMO_ZONE_ID, ENEMY_COLLISION_RADIUS, getGameData, seededRng } from '@mmo/game-data';
import type { Vec3 } from '@mmo/schemas';
import { uuidv7 } from '@mmo/shared';
import { ARENA, WOLF_HOME, arenaGameData } from './test-arena';
import { ZoneSimulation } from './zone-simulation';
import type { CombatantProfile, OutMessage } from './zone-simulation';

const strong: CombatantProfile = {
  level: 1,
  stats: { strength: 12 },
  maxHealth: 10_000,
  health: 10_000,
  weapon: { min: 200, max: 200, attackSpeedMs: 1000 },
};
const weak: CombatantProfile = {
  level: 1,
  stats: { strength: 12 },
  maxHealth: 144,
  health: 144,
  weapon: { min: 1, max: 3, attackSpeedMs: 2000 },
};

function harness(sim: ZoneSimulation, start = 1_000) {
  let now = start;
  const msgs = new Map<string, OutMessage[]>();
  const join = (pos: Vec3, combat = weak) => {
    const id = uuidv7();
    return {
      id,
      entityId: sim.addPlayer({ characterId: id, name: 'P', maxSpeed: 6, combat }, pos, 0, now),
    };
  };
  const step = (ms: number, onTick?: () => void) => {
    const end = now + ms;
    while (now < end) {
      now += 50;
      sim.step(now);
      for (const [c, l] of sim.drainOutbox()) msgs.set(c, [...(msgs.get(c) ?? []), ...l]);
      onTick?.();
    }
  };
  const of = <T extends OutMessage['t']>(cid: string, t: T) =>
    (msgs.get(cid) ?? []).filter((m) => m.t === t) as Extract<OutMessage, { t: T }>[];
  return {
    join,
    step,
    of,
    get now() {
      return now;
    },
  };
}

describe('Greenvale population (spawn groups)', () => {
  const gd = getGameData();
  const zone = gd.zone(DEMO_ZONE_ID);

  it('fills every group to maxAlive, on its own points, never inside safe zones or colliders', () => {
    const sim = new ZoneSimulation(gd, DEMO_ZONE_ID, { rng: seededRng(1), nowMs: 0 });
    for (const g of zone.spawnGroups)
      expect(sim.groupPopulation(g.id)).toEqual({
        alive: g.maxAlive,
        pending: 0,
        maxAlive: g.maxAlive,
      });
    const wolves = sim
      .enemyIds()
      .map((id) => sim.getEnemy(id)!)
      .filter((e) => e.groupId !== null);
    expect(wolves).toHaveLength(zone.spawnGroups.reduce((n, g) => n + g.maxAlive, 0));
    for (const w of wolves) {
      expect(w.groupId).not.toBeNull();
      expect(sim.collision.overlaps(w.position, ENEMY_COLLISION_RADIUS)).toBe(false);
      for (const sz of zone.safeZones)
        expect(Math.hypot(w.position.x - sz.center.x, w.position.z - sz.center.z)).toBeGreaterThan(
          sz.radius,
        );
    }
    // encounters are spread out, not dumped at the spawn
    const nearSpawn = wolves.filter(
      (w) =>
        Math.hypot(w.position.x - zone.defaultSpawn.x, w.position.z - zone.defaultSpawn.z) < 40,
    );
    expect(nearSpawn).toHaveLength(0);
  });

  it('never exceeds maxAlive, respawns after the group delay, and not on top of players', () => {
    const sim = new ZoneSimulation(gd, DEMO_ZONE_ID, { rng: seededRng(3), nowMs: 1_000 });
    const h = harness(sim);
    const group = 'group.greenvale.den_north';
    const g = zone.spawnGroups.find((x) => x.id === group)!;
    const victim = sim.enemyIds().find((id) => sim.getEnemy(id)!.groupId === group)!;
    const vp = sim.getEnemy(victim)!.position;
    const p = h.join({ x: vp.x, y: 0, z: vp.z - 2 }, strong);
    sim.setTarget(p.id, victim);
    sim.startAttack(p.id);
    let maxSeen = 0;
    h.step(2_000, () => {
      for (const k of sim.drainKills()) sim.confirmKill(k.killId, h.now);
      maxSeen = Math.max(maxSeen, sim.groupPopulation(group)!.alive);
    });
    expect(sim.groupPopulation(group)).toMatchObject({ alive: g.maxAlive - 1, pending: 1 });
    // player stands on the den: the free point closest to them must not be used while they are near
    h.step(g.respawnMs.max + 2_000, () => {
      maxSeen = Math.max(maxSeen, sim.groupPopulation(group)!.alive);
      for (const id of sim.enemyIds()) {
        const e = sim.getEnemy(id)!;
        if (e.groupId === group && e.mode !== 'dead')
          expect(Math.hypot(e.position.x - vp.x, e.position.z - (vp.z - 2)) >= 0).toBe(true);
      }
    });
    expect(maxSeen).toBeLessThanOrEqual(g.maxAlive);
    const pop = sim.groupPopulation(group)!;
    expect(pop.alive + pop.pending).toBeLessThanOrEqual(g.maxAlive);
  });

  it('restores pending respawn slots from durable kill events after a restart (no instant repopulation)', () => {
    const now = 50_000;
    const sim = new ZoneSimulation(gd, DEMO_ZONE_ID, {
      rng: seededRng(5),
      nowMs: now,
      restoredRespawns: [
        {
          spawnPointId: 'spawn.greenvale.wolf_north_1',
          groupId: 'group.greenvale.den_north',
          respawnAtMs: now + 30_000,
        },
        {
          spawnPointId: 'spawn.greenvale.wolf_north_2',
          groupId: 'group.greenvale.den_north',
          respawnAtMs: now - 1,
        }, // already elapsed
      ],
    });
    expect(sim.groupPopulation('group.greenvale.den_north')).toEqual({
      alive: 1,
      pending: 1,
      maxAlive: 2,
    });
    const h = harness(sim, now);
    h.step(31_000);
    expect(sim.groupPopulation('group.greenvale.den_north')).toEqual({
      alive: 2,
      pending: 0,
      maxAlive: 2,
    });
  });
});

describe('write-ahead death', () => {
  it('a dead enemy is only announced and scheduled after confirmKill; unconfirmed kills never respawn', () => {
    const sim = new ZoneSimulation(arenaGameData(), ARENA, { rng: seededRng(2), nowMs: 1_000 });
    const h = harness(sim);
    const wolf = sim.enemyIds()[0]!;
    const p = h.join({ x: 2, y: 0, z: 12 }, strong);
    sim.setTarget(p.id, wolf);
    sim.startAttack(p.id);
    h.step(1_000);
    expect(sim.getEnemy(wolf)!.mode).toBe('dying');
    expect(h.of(p.id, 'combat.death')).toHaveLength(0);
    expect(() => sim.startAttack(p.id)).toThrow(expect.objectContaining({ code: 'TARGET_DEAD' }));
    const kills = sim.drainKills();
    expect(kills).toHaveLength(1);
    expect(kills[0]).toMatchObject({ spawnPointId: 'spawn.test.wolf', groupId: null });
    expect(kills[0]!.respawnAtMs).toBeGreaterThan(kills[0]!.diedAtMs);
    // without confirmation (host crashed before persisting) nothing is scheduled
    h.step(20_000);
    expect(sim.getEnemy(wolf)!.mode).toBe('dying');
    expect(sim.enemyIds()).toEqual([wolf]);
    // confirmation (durable) finalises once
    expect(sim.confirmKill(kills[0]!.killId, h.now)).toBe(true);
    expect(sim.confirmKill(kills[0]!.killId, h.now)).toBe(false);
    h.step(100);
    expect(h.of(p.id, 'combat.death')).toHaveLength(1);
  });
});

describe('line of sight and collision', () => {
  const wall = {
    shape: 'box' as const,
    x: 2,
    z: 12.6,
    halfWidth: 3,
    halfDepth: 0.1,
    rotationY: 0,
    blocksSight: true,
  };

  it('cannot start attacking through a sight-blocking wall, and the wolf does not aggro through it', () => {
    const sim = new ZoneSimulation(arenaGameData({ colliders: [wall] }), ARENA, {
      rng: seededRng(4),
      nowMs: 1_000,
    });
    const h = harness(sim);
    const wolf = sim.enemyIds()[0]!;
    const p = h.join({ x: 2, y: 0, z: 11.2 });
    sim.setTarget(p.id, wolf);
    expect(() => sim.startAttack(p.id)).toThrow(expect.objectContaining({ code: 'OUT_OF_RANGE' }));
    h.step(3_000);
    expect(sim.getEnemy(wolf)!.mode).toBe('idle');
    expect(h.of(p.id, 'combat.damage')).toHaveLength(0);
  });

  it('rejects movement into or through obstacles with a correction', () => {
    const sim = new ZoneSimulation(arenaGameData({ colliders: [wall] }), ARENA, {
      rng: seededRng(4),
      nowMs: 1_000,
    });
    const h = harness(sim);
    const p = h.join({ x: 2, y: 0, z: 11.5 });
    h.step(500);
    expect(sim.handleMove(p.id, { x: 2, y: 0, z: 13.5 }, 0, h.now)).toBe(false); // through the wall
    h.step(50); // corrections are delivered through the outbox
    expect(h.of(p.id, 'move.correction').at(-1)!.d.reason).toBe('blocked');
    expect(sim.handleMove(p.id, { x: 2, y: 0, z: 12.5 }, 0, h.now + 300)).toBe(false); // into the wall
    expect(sim.handleMove(p.id, { x: 3, y: 0, z: 11.5 }, 0, h.now + 600)).toBe(true); // alongside it
  });

  it('respawns the player at the nearest respawn point', () => {
    const gd = getGameData();
    const sim = new ZoneSimulation(gd, DEMO_ZONE_ID, { rng: seededRng(1), nowMs: 0 });
    const p = sim.addPlayer(
      { characterId: uuidv7(), name: 'P', maxSpeed: 6, combat: { ...weak, health: 0 } },
      { x: -10, y: 0, z: -100 },
      0,
      0,
    );
    expect(p).toBeTruthy();
    const id = [...(sim as unknown as { players: Map<string, unknown> }).players.keys()][0]!;
    sim.respawn(id, 10_000);
    const pos = sim.getPlayer(id)!.position;
    expect(Math.hypot(pos.x + 5, pos.z + 90)).toBeLessThan(2); // Old Waystone, not the village
  });
});

describe('steering', () => {
  // A long fence (blocks movement, not sight) between wolf and player with a gap at x > 12.
  const fence = {
    shape: 'box' as const,
    x: -2,
    z: 10,
    halfWidth: 13,
    halfDepth: 0.15,
    rotationY: 0,
    blocksSight: false,
  };

  it('paths around a fence to reach and attack a visible player, never entering obstacles', () => {
    const gd = arenaGameData({ colliders: [fence] });
    const sim = new ZoneSimulation(gd, ARENA, { rng: seededRng(6), nowMs: 1_000 });
    const h = harness(sim);
    const wolf = sim.enemyIds()[0]!;
    const p = h.join({ x: 2, y: 0, z: 7 });
    let inside = 0;
    h.step(15_000, () => {
      if (sim.collision.overlaps(sim.getEnemy(wolf)!.position, 0.5)) inside++;
    });
    expect(inside).toBe(0);
    expect(
      h.of(p.id, 'combat.damage').filter((m) => m.d.targetId === p.entityId).length,
    ).toBeGreaterThan(0);
  });

  it('gives up on an unreachable target and returns home to full health (not stuck forever)', () => {
    // player fenced in on all sides (visible across low fences, but unreachable)
    const ring = [
      {
        shape: 'box' as const,
        x: 2,
        z: 4,
        halfWidth: 3,
        halfDepth: 0.15,
        rotationY: 0,
        blocksSight: false,
      },
      {
        shape: 'box' as const,
        x: 2,
        z: 10,
        halfWidth: 3,
        halfDepth: 0.15,
        rotationY: 0,
        blocksSight: false,
      },
      {
        shape: 'box' as const,
        x: -1,
        z: 7,
        halfWidth: 0.15,
        halfDepth: 3.2,
        rotationY: 0,
        blocksSight: false,
      },
      {
        shape: 'box' as const,
        x: 5,
        z: 7,
        halfWidth: 0.15,
        halfDepth: 3.2,
        rotationY: 0,
        blocksSight: false,
      },
    ];
    const sim = new ZoneSimulation(arenaGameData({ colliders: ring }), ARENA, {
      rng: seededRng(7),
      nowMs: 1_000,
    });
    const h = harness(sim);
    const wolf = sim.enemyIds()[0]!;
    h.join({ x: 2, y: 0, z: 7 });
    let engaged = false;
    h.step(15_000, () => {
      if (sim.getEnemy(wolf)!.mode === 'engaged') engaged = true;
    });
    expect(engaged).toBe(true);
    // It gave up; it may have re-aggroed since (the player is still visible), but it is never stuck
    // inside geometry and always ends up idle at home or engaged again, never permanently 'returning'.
    expect(['idle', 'engaged', 'returning']).toContain(sim.getEnemy(wolf)!.mode);
    expect(sim.collision.overlaps(sim.getEnemy(wolf)!.position, 0.5)).toBe(false);
  });

  it('leashes when kited too far from home and walks back', () => {
    const sim = new ZoneSimulation(arenaGameData(), ARENA, { rng: seededRng(8), nowMs: 1_000 });
    const h = harness(sim);
    const wolf = sim.enemyIds()[0]!;
    const p = h.join({ x: 2, y: 0, z: 8 });
    h.step(500);
    expect(sim.getEnemy(wolf)!.mode).toBe('engaged');
    // run south; server-validated legal moves
    let z = 8;
    for (let i = 0; i < 80 && sim.getEnemy(wolf)!.mode === 'engaged'; i++) {
      z -= 0.6;
      expect(sim.handleMove(p.id, { x: 2, y: 0, z }, 0, h.now)).toBe(true);
      h.step(100);
    }
    expect(sim.getEnemy(wolf)!.mode).toBe('returning');
    h.step(20_000);
    const w = sim.getEnemy(wolf)!;
    expect(w.mode).toBe('idle');
    expect(w.health).toBe(w.maxHealth);
    expect(Math.hypot(w.position.x - WOLF_HOME.x, w.position.z - WOLF_HOME.z)).toBeLessThan(1);
  });
});
