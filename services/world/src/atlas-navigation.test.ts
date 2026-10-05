import { expect, it, vi } from 'vitest';
import { getGameData, seededRng } from '@mmo/game-data';
import { uuidv7 } from '@mmo/shared';
import { ZoneSimulation } from './zone-simulation';
import { NavGrid } from './navigation';

it('uses bounded local navigation for real multi-kilometre regional enemy pursuit', () => {
  const sim = new ZoneSimulation(getGameData(), 'zone.aurelian.greenvale_marches', {
    rng: seededRng(4),
    nowMs: 1000,
  });
  const enemy = sim.listEntities().find((e) => e.refId?.endsWith('.boar.2'))!;
  const startZ = enemy.position.z;
  const id = uuidv7();
  sim.addPlayer(
    {
      characterId: id,
      name: 'Regional traveller',
      maxSpeed: 6,
      combat: {
        level: 1,
        maxHealth: 144,
        health: 144,
        stats: { strength: 12 },
        weapon: { min: 1, max: 3, attackSpeedMs: 2000 },
      },
    },
    { ...enemy.position, z: enemy.position.z + 8 },
    0,
    1000,
  );
  const dimensions: number[][] = [];
  const original = NavGrid.prototype.findPath;
  vi.spyOn(NavGrid.prototype, 'findPath').mockImplementation(function (this: NavGrid, ...args) {
    dimensions.push([this.cols, this.rows]);
    return original.apply(this, args);
  });
  // Force the genuine pursuit branch through A* rather than the direct-path shortcut.
  const sweep = sim.collision.sweepBlocked.bind(sim.collision);
  vi.spyOn(sim.collision, 'sweepBlocked').mockImplementation((a, b, radius) =>
    Math.hypot(a.x - b.x, a.z - b.z) > 3 ? true : sweep(a, b, radius),
  );
  try {
    for (let now = 1050; now <= 2000; now += 50) sim.step(now);
    expect(dimensions.length).toBeGreaterThan(0);
    expect(dimensions.every(([cols, rows]) => cols! <= 192 && rows! <= 192)).toBe(true);
    expect(sim.isThreatened(id)).toBe(true);
    expect(sim.listEntities().find((e) => e.id === enemy.id)!.position.z).toBeGreaterThan(startZ);
  } finally {
    vi.restoreAllMocks();
  }
});
