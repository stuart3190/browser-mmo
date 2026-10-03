import type { ChunkCoord, Vec3, WorldZone } from '@mmo/schemas';

export function chunkCoordFor(
  zone: Pick<WorldZone, 'chunkSize'>,
  pos: Pick<Vec3, 'x' | 'z'>,
): ChunkCoord {
  return { cx: Math.floor(pos.x / zone.chunkSize), cz: Math.floor(pos.z / zone.chunkSize) };
}

export function chunkKey(c: ChunkCoord): string {
  return `${c.cx},${c.cz}`;
}

export function isInsideZone(zone: WorldZone, pos: Pick<Vec3, 'x' | 'z'>): boolean {
  const c = chunkCoordFor(zone, pos);
  return (
    c.cx >= zone.bounds.minCx &&
    c.cx <= zone.bounds.maxCx &&
    c.cz >= zone.bounds.minCz &&
    c.cz <= zone.bounds.maxCz
  );
}

/** Chunks within `radius` chunks of `center` (square), clipped to zone bounds. Used for streaming + AOI. */
export function chunksInRadius(zone: WorldZone, center: ChunkCoord, radius: number): ChunkCoord[] {
  const out: ChunkCoord[] = [];
  for (let cx = center.cx - radius; cx <= center.cx + radius; cx++) {
    for (let cz = center.cz - radius; cz <= center.cz + radius; cz++) {
      if (
        cx >= zone.bounds.minCx &&
        cx <= zone.bounds.maxCx &&
        cz >= zone.bounds.minCz &&
        cz <= zone.bounds.maxCz
      ) {
        out.push({ cx, cz });
      }
    }
  }
  return out;
}

export function distance2D(a: Pick<Vec3, 'x' | 'z'>, b: Pick<Vec3, 'x' | 'z'>): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}
