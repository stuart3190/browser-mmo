import { expect, it } from 'vitest';
import { GameData, getGameData, DEMO_ZONE_ID, seededRng } from '@mmo/game-data';
import { uuidv7 } from '@mmo/shared';
import { ZoneSimulation } from './zone-simulation';
import { arenaGameData, ARENA, WOLF_HOME } from './test-arena';
const B = 'enemy.greenvale.last_door_sentinel';
function setup() {
  const gd = arenaGameData({
    spawns: [
      {
        id: 'spawn.test.sentinel',
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

it('freezes its heading and origin; a flank dodges while the companion is hit once', () => {
  const t = setup();
  t.step(100);
  const cue = structuredClone(t.boss.attackCue)!;
  expect(cue.cleave).toBeTruthy();
  expect(cue.groundPosition).toEqual(WOLF_HOME);
  for (let i = 0; i < 20; i++) {
    t.step(50);
    t.sim.handleMove(t.ids[0]!, { x: 2 - (i + 1) * 0.25, y: 0, z: 8 }, 0, t.now);
  }
  expect(t.boss.attackCue).toEqual(cue);
  t.step(1250);
  expect(t.sim.persistentState(t.ids[0]!)!.health).toBe(200);
  expect(t.sim.persistentState(t.ids[1]!)!.health).toBeLessThan(200);
  const hp = t.sim.persistentState(t.ids[1]!)!.health;
  t.step(1000);
  expect(t.sim.persistentState(t.ids[1]!)!.health).toBe(hp);
});
it('checkpoint restores the exact sector and resolves once; removal cancels it', () => {
  const t = setup();
  t.step(100);
  const cue = structuredClone(t.boss.attackCue)!;
  const restored = new ZoneSimulation(t.gd, ARENA, { rng: seededRng(1) });
  restored.restoreCheckpoint(t.sim.checkpoint());
  expect(restored.listEntities().find((e) => e.id === t.boss.id)!.attackCue).toEqual(cue);
  restored.step(cue.endsAtMs);
  const hp = restored.persistentState(t.ids[0]!)!.health;
  expect(hp).toBeLessThan(200);
  restored.step(cue.endsAtMs + 50);
  expect(restored.persistentState(t.ids[0]!)!.health).toBe(hp);
  t.sim.removePlayer(t.ids[0]!);
  expect(t.boss.attackCue).toBeNull();
});

it('adds the sentinel to an old zone checkpoint without replacing players or existing entities', () => {
  const current = getGameData(),
    raw = structuredClone(current.raw);
  for (const chunk of raw.chunks)
    chunk.spawnPoints = chunk.spawnPoints.filter((s) => s.refId !== B);
  const old = new ZoneSimulation(GameData.load(raw), DEMO_ZONE_ID, { nowMs: 1000 });
  const id = uuidv7();
  old.addPlayer(
    {
      characterId: id,
      name: 'Existing',
      maxSpeed: 6,
      combat: {
        level: 3,
        health: 77,
        maxHealth: 200,
        stats: {},
        weapon: { min: 1, max: 1, attackSpeedMs: 2000 },
        abilityCooldowns: { 'ability.warrior.heavy_strike': 9000 },
      },
    },
    { x: 0, y: 0, z: 6 },
    0,
    1000,
  );
  const before = structuredClone(old.listEntities());
  const after = new ZoneSimulation(current, DEMO_ZONE_ID);
  after.restoreCheckpoint(old.checkpoint());
  expect(after.persistentState(id)).toEqual(old.persistentState(id));
  for (const entity of before)
    expect(after.listEntities().find((e) => e.id === entity.id)).toEqual(entity);
  expect(after.listEntities().filter((e) => e.refId === B)).toHaveLength(1);
});
