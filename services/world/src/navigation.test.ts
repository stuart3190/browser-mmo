import { describe, expect, it } from 'vitest';
import { CollisionWorld, DEMO_ZONE_ID, getGameData } from '@mmo/game-data';
import { NavGrid } from './navigation';

const wallWithGap = new CollisionWorld([
  // a wall along x=0 from z=-20..20 except a gap near z=15
  { shape: 'box', x: 0, z: -3, halfWidth: 0.5, halfDepth: 16, rotationY: 0, blocksSight: true },
]);
const bounds = { minX: -30, minZ: -30, maxX: 30, maxZ: 30 };

describe('NavGrid', () => {
  it('routes around a wall through the gap and every leg is collision-free', () => {
    const nav = new NavGrid(wallWithGap, bounds, 0.6);
    const path = nav.findPath({ x: -10, z: 0 }, { x: 10, z: 0 })!;
    expect(path).not.toBeNull();
    expect(path.at(-1)).toEqual({ x: 10, z: 0 });
    expect(path.some((p) => p.z > 13)).toBe(true); // went through the gap
    let prev = { x: -10, z: 0 };
    for (const p of path) {
      expect(wallWithGap.sweepBlocked(prev, p, 0.5)).toBe(false);
      prev = p;
    }
    expect(path.length).toBeLessThan(6); // smoothed, not one point per cell
  });

  it('returns null for unreachable goals within budget and handles goals inside obstacles', () => {
    const sealed = new CollisionWorld([
      { shape: 'circle', x: 0, z: 0, radius: 5, blocksSight: true },
    ]);
    const nav = new NavGrid(sealed, bounds, 0.6);
    // goal inside the obstacle: snaps to nearest walkable cell within range
    expect(nav.findPath({ x: -15, z: 0 }, { x: -4.5, z: 0 })).not.toBeNull();
    // a fully enclosed area is unreachable
    const box = new CollisionWorld([
      {
        shape: 'box',
        x: 0,
        z: 10,
        halfWidth: 10.5,
        halfDepth: 0.5,
        rotationY: 0,
        blocksSight: true,
      },
      {
        shape: 'box',
        x: 0,
        z: -10,
        halfWidth: 10.5,
        halfDepth: 0.5,
        rotationY: 0,
        blocksSight: true,
      },
      {
        shape: 'box',
        x: 10,
        z: 0,
        halfWidth: 0.5,
        halfDepth: 10.5,
        rotationY: 0,
        blocksSight: true,
      },
      {
        shape: 'box',
        x: -10,
        z: 0,
        halfWidth: 0.5,
        halfDepth: 10.5,
        rotationY: 0,
        blocksSight: true,
      },
    ]);
    expect(
      new NavGrid(box, bounds, 0.6).findPath({ x: 20, z: 20 }, { x: 0, z: 0 }, 5000),
    ).toBeNull();
  });

  it('builds for the real zone and plans across it within the search budget', () => {
    const gd = getGameData();
    const zone = gd.zone(DEMO_ZONE_ID);
    const t0 = performance.now();
    const nav = new NavGrid(
      gd.collisionWorld(DEMO_ZONE_ID),
      {
        minX: zone.bounds.minCx * 64,
        minZ: zone.bounds.minCz * 64,
        maxX: (zone.bounds.maxCx + 1) * 64,
        maxZ: (zone.bounds.maxCz + 1) * 64,
      },
      0.6,
    );
    const built = performance.now() - t0;
    // village -> behind the eastern ridge
    const path = nav.findPath({ x: 30, z: -20 }, { x: 70, z: -20 });
    expect(path).not.toBeNull();
    expect(built).toBeLessThan(2000);
    const t1 = performance.now();
    for (let i = 0; i < 20; i++) nav.findPath({ x: 0, z: -8 }, { x: 5, z: 68 });
    expect((performance.now() - t1) / 20).toBeLessThan(25); // ms per long search
  });
});
