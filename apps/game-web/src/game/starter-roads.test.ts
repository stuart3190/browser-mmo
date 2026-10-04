import { expect, it } from 'vitest';
import { getGameData, PLAYER_COLLISION_RADIUS } from '@mmo/game-data';
import { starterRoads } from './starter-roads';

it('keeps every signposted road centre traversable with the authoritative player collider', () => {
  const collision = getGameData().collisionWorld('zone.greenvale.meadows');
  for (const [ax, az, bx, bz] of starterRoads) {
    expect(
      collision.sweepBlocked({ x: ax, z: az }, { x: bx, z: bz }, PLAYER_COLLISION_RADIUS),
      `${ax},${az} -> ${bx},${bz}`,
    ).toBe(false);
  }
});
