import { expect, it } from 'vitest';
import { GameData, getGameData, DEMO_ZONE_ID, seededRng } from '@mmo/game-data';
import { uuidv7 } from '@mmo/shared';
import { ZoneSimulation } from './zone-simulation';
import { arenaGameData, ARENA, WOLF_HOME } from './test-arena';
const B = 'enemy.greenvale.siltbound_warden';
function setup() {
  const gd = arenaGameData({
    spawns: [
      {
        id: 'spawn.test.warden',
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
  const ids = [uuidv7(), uuidv7()];
  for (const [i, id] of ids.entries())
    sim.addPlayer(
      {
        characterId: id,
        name: `Hunter${i}`,
        maxSpeed: 6,
        combat: {
          level: 3,
          health: 200,
          maxHealth: 200,
          stats: {},
          weapon: { min: 1, max: 1, attackSpeedMs: 2000 },
        },
      },
      { x: 2 + i * 0.5, y: 0, z: 8 },
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
    ids,
    boss,
    step,
    get now() {
      return now;
    },
  };
}
it('locks the ground warning to a position, lets movement dodge, and hits nearby players only once', () => {
  const t = setup();
  t.step(100);
  expect(t.boss.attackCue).toMatchObject({ groundPosition: { x: 2, y: 0, z: 8 }, range: 2.5 });
  const origin = { ...t.boss.attackCue!.groundPosition! };
  for (let i = 0; i < 14; i++) {
    t.step(50);
    t.sim.handleMove(t.ids[0]!, { x: 2 - (i + 1) * 0.25, y: 0, z: 8 }, 0, t.now);
  }
  expect(t.boss.attackCue!.groundPosition).toEqual(origin);
  t.step(1000);
  expect(t.sim.persistentState(t.ids[0]!)!.health).toBe(200);
  expect(t.sim.persistentState(t.ids[1]!)!.health).toBeLessThan(200);
  const hp = t.sim.persistentState(t.ids[1]!)!.health;
  t.step(1000);
  expect(t.sim.persistentState(t.ids[1]!)!.health).toBe(hp);
});
it('recovers a committed ground strike without retargeting or duplicate damage', () => {
  const t = setup();
  t.step(100);
  const cue = structuredClone(t.boss.attackCue);
  const recovered = new ZoneSimulation(t.gd, ARENA, { rng: seededRng(1) });
  recovered.restoreCheckpoint(t.sim.checkpoint());
  expect(recovered.listEntities().find((e) => e.id === t.boss.id)?.attackCue).toEqual(cue);
  recovered.step(cue!.endsAtMs - 50);
  expect(recovered.persistentState(t.ids[0]!)!.health).toBe(200);
  recovered.step(cue!.endsAtMs);
  for (const id of t.ids) expect(recovered.persistentState(id)!.health).toBeLessThan(200);
  const hp = recovered.persistentState(t.ids[0]!)!.health;
  recovered.step(cue!.endsAtMs + 50);
  expect(recovered.persistentState(t.ids[0]!)!.health).toBe(hp);
});
it('cancels a committed warning when its target is removed', () => {
  const t = setup();
  t.step(100);
  const oldEnd = t.boss.attackCue!.endsAtMs;
  t.sim.removePlayer(t.ids[0]!);
  expect(t.boss.attackCue).toBeNull();
  t.step(oldEnd - t.now);
  // Re-aggro may begin a new warning; the cancelled old strike cannot hit.
  expect(t.boss.attackCue?.endsAtMs).toBeGreaterThan(oldEnd);
  expect(t.sim.persistentState(t.ids[1]!)!.health).toBe(200);
});
it('adds expedition spawns to old checkpoints exactly once without replacing old entities', () => {
  const current = getGameData(),
    raw = structuredClone(current.raw);
  for (const c of raw.chunks)
    c.spawnPoints = c.spawnPoints.filter(
      (s) => !['enemy.greenvale.siltbound_warden', 'npc.greenvale.surveyor_tess'].includes(s.refId),
    );
  const old = new ZoneSimulation(GameData.load(raw), DEMO_ZONE_ID);
  const sim = new ZoneSimulation(current, DEMO_ZONE_ID);
  sim.restoreCheckpoint(old.checkpoint());
  for (const e of old.listEntities())
    expect(sim.listEntities().find((x) => x.id === e.id)).toEqual(e);
  sim.restoreCheckpoint(sim.checkpoint());
  for (const ref of [B, 'npc.greenvale.surveyor_tess'])
    expect(sim.listEntities().filter((e) => e.refId === ref)).toHaveLength(1);
});

it('solo kill clears the ground warning and restores exactly one pending respawn', () => {
  const t = setup();
  t.step(100);
  t.sim.updateCombatProfile(
    t.ids[0]!,
    { level: 3, maxHealth: 200, stats: {}, weapon: { min: 999, max: 999, attackSpeedMs: 1000 } },
    t.now,
  );
  for (let i = 0; i < 16; i++) {
    t.step(50);
    t.sim.handleMove(t.ids[0]!, { x: 2, y: 0, z: 8 + (i + 1) * 0.25 }, 0, t.now);
  }
  t.sim.setTarget(t.ids[0]!, t.boss.id);
  t.sim.startAttack(t.ids[0]!);
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
