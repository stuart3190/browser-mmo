import { expect, it } from 'vitest';
import { getGameData } from '@mmo/game-data';
import { uuidv7 } from '@mmo/shared';
import { ZoneSimulation } from './zone-simulation';
const zone = 'zone.aurelian.greenvale_marches';
const combat = {
  level: 1,
  maxHealth: 144,
  health: 144,
  stats: { strength: 12 },
  weapon: { min: 1, max: 3, attackSpeedMs: 2000 },
};
it('reserves in-range living gatherers, rejects races/distance/death and restores durable depletion over stale images', () => {
  const sim = new ZoneSimulation(getGameData(), zone, { nowMs: 1000 });
  const herb = sim.listEntities().find((e) => e.kind === 'resource_node')!;
  const a = uuidv7(),
    b = uuidv7();
  sim.addPlayer({ characterId: a, name: 'A', maxSpeed: 6, combat }, herb.position, 0, 1000);
  sim.addPlayer(
    { characterId: b, name: 'B', maxSpeed: 6, combat },
    { x: 256, y: 0, z: 400 },
    0,
    1000,
  );
  expect(() => sim.reservePickup(b, herb.id)).toThrow('Too far');
  const dead = uuidv7();
  sim.addPlayer(
    { characterId: dead, name: 'Dead', maxSpeed: 6, combat: { ...combat, health: 0 } },
    herb.position,
    0,
    1000,
  );
  expect(() => sim.reservePickup(dead, herb.id)).toThrow('You are dead');
  const before = sim.checkpoint();
  const r = sim.reservePickup(a, herb.id);
  expect(r.resource).toBe(true);
  expect(() => sim.reservePickup(a, herb.id)).toThrow('already in progress');
  sim.releasePickup(herb.id);
  expect(sim.reservePickup(a, herb.id).spawnPointId).toBe(r.spawnPointId);
  sim.commitPickup(herb.id, 1000, 61000);
  expect(sim.listEntities().some((e) => e.id === herb.id)).toBe(false);
  const crashed = new ZoneSimulation(getGameData(), zone, { nowMs: 2000 });
  crashed.restoreCheckpoint(before);
  crashed.restoreResources([{ nodeId: r.spawnPointId, readyAt: new Date(61000) }], 2000);
  expect(
    crashed
      .listEntities()
      .some((e) => e.kind === 'resource_node' && e.position.x === herb.position.x),
  ).toBe(false);
  crashed.step(61001);
  const regrown = crashed
    .listEntities()
    .find((e) => e.kind === 'resource_node' && e.position.x === herb.position.x)!;
  expect(regrown).toBeDefined();
  expect(regrown.id).not.toBe(herb.id);
  expect(() => crashed.reservePickup(a, herb.id)).toThrow('Nothing');
});
