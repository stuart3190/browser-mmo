import { expect, it } from 'vitest';
import { GameData, getGameData, DEMO_ZONE_ID, seededRng } from '@mmo/game-data';
import { uuidv7 } from '@mmo/shared';
import { ZoneSimulation } from './zone-simulation';
import { arenaGameData, ARENA, WOLF_HOME } from './test-arena';
const B = 'enemy.greenvale.brackenmaw';
function setup() {
  const gd = arenaGameData({
    spawns: [
      {
        id: 'spawn.test.boss',
        kind: 'enemy',
        refId: B,
        position: WOLF_HOME,
        rotationY: 0,
        quantity: 1,
        respawnMs: 60000,
        interactRadius: 3,
        groupId: null,
        wanderRadius: 0,
      },
    ],
  });
  const sim = new ZoneSimulation(gd, ARENA, { nowMs: 1000, rng: seededRng(1) });
  const id = uuidv7();
  sim.addPlayer(
    {
      characterId: id,
      name: 'Hunter',
      maxSpeed: 6,
      combat: {
        level: 2,
        health: 200,
        maxHealth: 200,
        stats: {},
        weapon: { min: 1, max: 1, attackSpeedMs: 2000 },
      },
    },
    { x: 2, y: 0, z: 12 },
    0,
    1000,
  );
  const boss = sim.listEntities().find((e) => e.refId === B)!;
  let now = 1000;
  function step(ms: number) {
    for (const end = now + ms; now < end;) {
      now += 50;
      sim.step(now);
    }
  }
  return {
    gd,
    sim,
    id,
    boss,
    step,
    get now() {
      return now;
    },
  };
}
it('holds a visible wind-up before damage, carries it through recovery, and hits only once', () => {
  const t = setup();
  t.step(100);
  expect(t.boss.attackCue).toMatchObject({ endsAtMs: 2500 });
  expect(t.sim.persistentState(t.id)!.health).toBe(200);
  const recovered = new ZoneSimulation(t.gd, ARENA);
  recovered.restoreCheckpoint(t.sim.checkpoint());
  expect(recovered.listEntities().find((e) => e.id === t.boss.id)?.attackCue).toEqual(
    t.boss.attackCue,
  );
  recovered.step(2450);
  expect(recovered.persistentState(t.id)!.health).toBe(200);
  recovered.step(2500);
  expect(recovered.persistentState(t.id)!.health).toBeLessThan(200);
  t.step(1350);
  expect(t.sim.persistentState(t.id)!.health).toBe(200);
  t.step(50);
  expect(t.sim.persistentState(t.id)!.health).toBeLessThan(200);
  const hp = t.sim.persistentState(t.id)!.health;
  expect(t.boss.attackCue).toBeNull();
  t.step(1000);
  expect(t.sim.persistentState(t.id)!.health).toBe(hp);
});
it('movement during the wind-up dodges; boss does not chase until the bite resolves', () => {
  const t = setup();
  t.step(100);
  const pos = { ...t.boss.position };
  for (let i = 0; i < 12; i++) {
    t.step(50);
    t.sim.handleMove(t.id, { x: 2, y: 0, z: 12 - (i + 1) * 0.25 }, 0, t.now);
  }
  expect(t.boss.position).toEqual(pos);
  t.step(800);
  expect(t.sim.persistentState(t.id)!.health).toBe(200);
  expect(t.boss.attackCue).toBeNull();
});
it('target disconnect/removal cancels the cue and returns home', () => {
  const t = setup();
  t.step(100);
  t.sim.removePlayer(t.id);
  t.step(50);
  expect(t.boss.attackCue).toBeNull();
});
it('additive Hollow recovery preserves old world and creates the leader exactly once including after death', () => {
  const current = getGameData();
  const raw = structuredClone(current.raw);
  for (const c of raw.chunks) c.spawnPoints = c.spawnPoints.filter((s) => s.refId !== B);
  const old = new ZoneSimulation(GameData.load(raw), DEMO_ZONE_ID);
  const sim = new ZoneSimulation(current, DEMO_ZONE_ID);
  sim.restoreCheckpoint(old.checkpoint());
  for (const e of old.listEntities())
    expect(sim.listEntities().find((x) => x.id === e.id)).toEqual(e);
  sim.restoreCheckpoint(sim.checkpoint());
  expect(sim.listEntities().filter((e) => e.refId === B)).toHaveLength(1);
  const t = setup();
  t.step(100);
  t.sim.updateCombatProfile(
    t.id,
    { level: 2, maxHealth: 200, stats: {}, weapon: { min: 999, max: 999, attackSpeedMs: 1000 } },
    t.now,
  );
  t.sim.setTarget(t.id, t.boss.id);
  t.sim.startAttack(t.id);
  t.step(1000);
  const [kill] = t.sim.drainKills();
  expect(kill).toBeDefined();
  expect(t.boss.attackCue).toBeNull();
  t.sim.confirmKill(kill!.killId, t.now);
  t.step(6000);
  t.sim.restoreCheckpoint(t.sim.checkpoint());
  expect(t.sim.listEntities().filter((e) => e.refId === B)).toHaveLength(0);
  t.step(60000);
  expect(t.sim.listEntities().filter((e) => e.refId === B)).toHaveLength(1);
});
