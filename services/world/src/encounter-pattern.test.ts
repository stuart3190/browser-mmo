import { expect, it } from 'vitest';
import { getGameData, livingSeal } from '@mmo/game-data';
import { ZoneSimulation } from './zone-simulation';

it('alternates named fixed geometry, recovers the second step, hits bystanders once, and resets after evasion', () => {
  const gd = getGameData();
  let sim = new ZoneSimulation(gd, livingSeal.zoneId, { nowMs: 1000, rng: { next: () => 0.5 } });
  const bossId = sim.listEntities().find((e) => e.refId === 'enemy.elderwood.rootbound_cantor')!.id;
  const boss = () => sim.listEntities().find((e) => e.id === bossId)!;
  const origin = { ...boss().position };
  for (const [id, dz] of [
    ['target', 5],
    ['bystander', 6],
    ['behind', -5],
  ] as const) {
    sim.addPlayer(
      {
        characterId: id,
        name: id,
        maxSpeed: 6,
        combat: {
          level: 6,
          health: 500,
          maxHealth: 500,
          stats: {},
          weapon: { min: 1, max: 1, attackSpeedMs: 2000 },
        },
      },
      { ...origin, z: origin.z + dz },
      0,
      1000,
    );
  }
  let now = 1000;
  const step = (ms: number) => {
    for (const end = now + ms; now < end;) {
      now += 50;
      sim.step(now);
    }
  };
  step(100);
  expect(boss().attackCue).toMatchObject({ name: 'Roots Reach', range: 4.5 });
  expect(boss().attackCue?.cleave).toBeUndefined();
  step(2200);
  const afterRoots = sim.getHealth('target')!;
  expect(afterRoots).toBeLessThan(500);
  expect(sim.getHealth('behind')).toBe(500);
  step(4800);
  const sweep = structuredClone(boss().attackCue)!;
  expect(sweep.name).toBe('Bough Sweep');
  expect(sweep.groundPosition).toEqual(origin);
  expect(sweep.cleave?.arc).toBeCloseTo((150 * Math.PI) / 180);
  expect(sweep.range).toBeGreaterThan(7);
  const image = sim.checkpoint();
  sim = new ZoneSimulation(gd, livingSeal.zoneId, { rng: { next: () => 0.5 } });
  sim.restoreCheckpoint(image);
  expect(boss().attackCue).toEqual(sweep);
  step(2000);
  expect(sim.getHealth('target')).toBeLessThan(afterRoots);
  expect(sim.getHealth('bystander')).toBeLessThan(afterRoots);
  expect(sim.getHealth('behind')).toBe(500);
  const afterSweep = sim.getHealth('target');
  step(50);
  expect(sim.getHealth('target')).toBe(afterSweep);
  step(4750);
  expect(boss().attackCue?.name).toBe('Roots Reach');
  // Removing every player cancels the committed strike; a fresh pull starts the song again.
  for (const id of ['target', 'bystander', 'behind']) sim.removePlayer(id);
  step(100);
  expect(boss().attackCue).toBeNull();
  sim.addPlayer(
    {
      characterId: 'new',
      name: 'New pull',
      maxSpeed: 6,
      combat: {
        level: 6,
        health: 500,
        maxHealth: 500,
        stats: {},
        weapon: { min: 1, max: 1, attackSpeedMs: 2000 },
      },
    },
    { ...origin, z: origin.z + 5 },
    0,
    now,
  );
  for (let n = 0; n < 120 && !boss().attackCue; n++) step(50);
  expect(boss().attackCue?.name).toBe('Roots Reach');
});
