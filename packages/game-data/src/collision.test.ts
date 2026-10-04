import { describe, expect, it } from 'vitest';
import { CollisionWorld, DEMO_ZONE_ID, getGameData, PLAYER_COLLISION_RADIUS } from './index';

const box = {
  shape: 'box' as const,
  x: 0,
  z: 0,
  halfWidth: 5,
  halfDepth: 0.15,
  rotationY: 0,
  blocksSight: false,
};
const pillar = { shape: 'circle' as const, x: 10, z: 0, radius: 1, blocksSight: true };

describe('CollisionWorld', () => {
  const w = new CollisionWorld([box, pillar]);

  it('detects overlap with circles and (rotated) boxes', () => {
    expect(w.overlaps({ x: 10.5, z: 0 }, 0.4)).toBe(true);
    expect(w.overlaps({ x: 12, z: 0 }, 0.4)).toBe(false);
    expect(w.overlaps({ x: 0, z: 0.4 }, 0.3)).toBe(true);
    expect(w.overlaps({ x: 0, z: 1 }, 0.3)).toBe(false);
    const rotated = new CollisionWorld([{ ...box, rotationY: Math.PI / 2 }]); // now long along Z
    expect(rotated.overlaps({ x: 0, z: 4 }, 0.3)).toBe(true);
    expect(rotated.overlaps({ x: 4, z: 0 }, 0.3)).toBe(false);
  });

  it('blocks movement sweeps through thin walls (no tunnelling) but not around them', () => {
    expect(w.sweepBlocked({ x: 0, z: -2 }, { x: 0, z: 2 }, 0.45)).toBe(true);
    expect(w.sweepBlocked({ x: 7, z: -2 }, { x: 7, z: 2 }, 0.45)).toBe(false);
  });

  it('separates sight from movement: low fences block walking, not line of sight', () => {
    expect(w.hasLineOfSight({ x: 0, z: -5 }, { x: 0, z: 5 })).toBe(true);
    expect(w.hasLineOfSight({ x: 5, z: 0 }, { x: 15, z: 0 })).toBe(false);
  });

  it('slides along obstacles instead of stopping dead', () => {
    const moved = w.slide({ x: 0, z: -1 }, { x: 1, z: 0.2 }, 0.45);
    expect(moved).toEqual({ x: 1, z: -1 }); // Z blocked by the wall, X allowed
    expect(w.slide({ x: 0, z: -1 }, { x: 0, z: 0.2 }, 0.45)).toEqual({ x: 0, z: -1 });
  });

  it('finds a nearby free point for spawns inside geometry', () => {
    const p = w.nearestFree({ x: 10, z: 0 }, 0.45);
    expect(w.overlaps(p, 0.45)).toBe(false);
    expect(Math.hypot(p.x - 10, p.z)).toBeLessThan(2);
  });
});

describe('Greenvale collision data', () => {
  it('derives colliders from props (visual and gameplay geometry share one table)', () => {
    const gd = getGameData();
    const world = gd.collisionWorld(DEMO_ZONE_ID);
    expect(world.colliders.length).toBeGreaterThan(100);
    const house = gd
      .chunksForZone(DEMO_ZONE_ID)
      .flatMap((c) => c.props)
      .find((p) => p.id === 'house_a')!;
    expect(world.overlaps(house.position, PLAYER_COLLISION_RADIUS)).toBe(true);
    // the village spawn and roads are clear
    expect(world.overlaps(gd.zone(DEMO_ZONE_ID).defaultSpawn, PLAYER_COLLISION_RADIUS)).toBe(false);
    expect(world.sweepBlocked({ x: 0, z: -8 }, { x: 0, z: 40 }, PLAYER_COLLISION_RADIUS)).toBe(
      false,
    );
  });
});
