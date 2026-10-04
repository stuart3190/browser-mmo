import type { Collider, Vec3, WorldChunk } from '@mmo/schemas';
import { propShapes } from '../content/props';

type XZ = Pick<Vec3, 'x' | 'z'>;

/** Colliders of one chunk: derived from its props (shared prop-shape table) plus explicit ones. */
export function chunkColliders(chunk: WorldChunk): Collider[] {
  const out: Collider[] = [...chunk.colliders];
  for (const prop of chunk.props) {
    const c = propShapes[prop.kind].collider;
    if (!c) continue;
    if (c.shape === 'circle') {
      out.push({
        shape: 'circle',
        x: prop.position.x,
        z: prop.position.z,
        radius: c.radius * prop.scale,
        blocksSight: c.blocksSight,
      });
    } else {
      out.push({
        shape: 'box',
        x: prop.position.x,
        z: prop.position.z,
        halfWidth: c.halfWidth * prop.scale,
        halfDepth: c.halfDepth * prop.scale,
        rotationY: prop.rotationY,
        blocksSight: c.blocksSight,
      });
    }
  }
  return out;
}

/** Bounding radius of a collider (for the spatial index). */
function extent(c: Collider): number {
  return c.shape === 'circle' ? c.radius : Math.hypot(c.halfWidth, c.halfDepth);
}

/** Point in a box's local frame (rotation about Y, matching Babylon's rotation.y). */
function toLocal(c: Extract<Collider, { shape: 'box' }>, p: XZ): XZ {
  const dx = p.x - c.x;
  const dz = p.z - c.z;
  const cos = Math.cos(c.rotationY);
  const sin = Math.sin(c.rotationY);
  // inverse rotation
  return { x: dx * cos - dz * sin, z: dx * sin + dz * cos };
}

function circleOverlaps(c: Collider, p: XZ, r: number): boolean {
  if (c.shape === 'circle') return Math.hypot(p.x - c.x, p.z - c.z) < c.radius + r;
  const l = toLocal(c, p);
  const qx = Math.max(Math.abs(l.x) - c.halfWidth, 0);
  const qz = Math.max(Math.abs(l.z) - c.halfDepth, 0);
  return Math.hypot(qx, qz) < r;
}

/** Does the segment a→b, swept by radius r, intersect the collider? */
function segmentHits(c: Collider, a: XZ, b: XZ, r: number): boolean {
  if (c.shape === 'circle') {
    const R = c.radius + r;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len2 = dx * dx + dz * dz;
    const t =
      len2 === 0 ? 0 : Math.max(0, Math.min(1, ((c.x - a.x) * dx + (c.z - a.z) * dz) / len2));
    return Math.hypot(a.x + dx * t - c.x, a.z + dz * t - c.z) < R;
  }
  // Slab test against the box expanded by r (Minkowski approximation of a capsule sweep).
  const la = toLocal(c, a);
  const lb = toLocal(c, b);
  const hx = c.halfWidth + r;
  const hz = c.halfDepth + r;
  let t0 = 0;
  let t1 = 1;
  const d = { x: lb.x - la.x, z: lb.z - la.z };
  for (const [p, dd, h] of [
    [la.x, d.x, hx],
    [la.z, d.z, hz],
  ] as const) {
    if (Math.abs(dd) < 1e-9) {
      if (p < -h || p > h) return false;
      continue;
    }
    let ta = (-h - p) / dd;
    let tb = (h - p) / dd;
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta);
    t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  return true;
}

/**
 * Static collision world for one zone, with a uniform-grid spatial index. Pure and shared:
 * the server uses it for movement validation, line of sight and enemy navigation; the client uses
 * the same code to predict movement so corrections are rare.
 */
export class CollisionWorld {
  private readonly cells = new Map<string, number[]>();

  constructor(
    readonly colliders: readonly Collider[],
    private readonly cellSize = 8,
  ) {
    colliders.forEach((c, i) => {
      const e = extent(c);
      for (
        let cx = Math.floor((c.x - e) / cellSize);
        cx <= Math.floor((c.x + e) / cellSize);
        cx++
      ) {
        for (
          let cz = Math.floor((c.z - e) / cellSize);
          cz <= Math.floor((c.z + e) / cellSize);
          cz++
        ) {
          const k = `${cx},${cz}`;
          const list = this.cells.get(k);
          if (list) list.push(i);
          else this.cells.set(k, [i]);
        }
      }
    });
  }

  private candidates(minX: number, minZ: number, maxX: number, maxZ: number): Set<number> {
    const out = new Set<number>();
    for (let cx = Math.floor(minX / this.cellSize); cx <= Math.floor(maxX / this.cellSize); cx++) {
      for (
        let cz = Math.floor(minZ / this.cellSize);
        cz <= Math.floor(maxZ / this.cellSize);
        cz++
      ) {
        this.cells.get(`${cx},${cz}`)?.forEach((i) => out.add(i));
      }
    }
    return out;
  }

  /** Is a circle of radius r at p overlapping any collider? */
  overlaps(p: XZ, r: number): boolean {
    for (const i of this.candidates(p.x - r, p.z - r, p.x + r, p.z + r))
      if (circleOverlaps(this.colliders[i]!, p, r)) return true;
    return false;
  }

  /** Would moving a circle of radius r straight from a to b hit anything? */
  sweepBlocked(a: XZ, b: XZ, r: number): boolean {
    for (const i of this.candidates(
      Math.min(a.x, b.x) - r,
      Math.min(a.z, b.z) - r,
      Math.max(a.x, b.x) + r,
      Math.max(a.z, b.z) + r,
    )) {
      if (segmentHits(this.colliders[i]!, a, b, r)) return true;
    }
    return false;
  }

  /** Line of sight between two points (only sight-blocking colliders count). */
  hasLineOfSight(a: XZ, b: XZ): boolean {
    for (const i of this.candidates(
      Math.min(a.x, b.x),
      Math.min(a.z, b.z),
      Math.max(a.x, b.x),
      Math.max(a.z, b.z),
    )) {
      const c = this.colliders[i]!;
      if (c.blocksSight && segmentHits(c, a, b, 0)) return false;
    }
    return true;
  }

  /**
   * Collide-and-slide for one movement step: full move if free, otherwise the larger of the
   * X-only / Z-only moves, otherwise stay. Used identically by client prediction.
   */
  slide(from: XZ, to: XZ, r: number): XZ {
    if (!this.sweepBlocked(from, to, r) && !this.overlaps(to, r)) return { x: to.x, z: to.z };
    const xOnly = { x: to.x, z: from.z };
    const zOnly = { x: from.x, z: to.z };
    const okX = !this.sweepBlocked(from, xOnly, r) && !this.overlaps(xOnly, r);
    const okZ = !this.sweepBlocked(from, zOnly, r) && !this.overlaps(zOnly, r);
    if (okX && okZ) return Math.abs(to.x - from.x) >= Math.abs(to.z - from.z) ? xOnly : zOnly;
    if (okX) return xOnly;
    if (okZ) return zOnly;
    return { x: from.x, z: from.z };
  }

  /** Nearest free point to p (spiral search), for spawns/respawns that must not start inside geometry. */
  nearestFree(p: XZ, r: number, maxRadius = 12): XZ {
    if (!this.overlaps(p, r)) return { x: p.x, z: p.z };
    for (let d = 0.5; d <= maxRadius; d += 0.5) {
      for (let a = 0; a < 16; a++) {
        const q = {
          x: p.x + Math.cos((a / 16) * Math.PI * 2) * d,
          z: p.z + Math.sin((a / 16) * Math.PI * 2) * d,
        };
        if (!this.overlaps(q, r)) return q;
      }
    }
    return { x: p.x, z: p.z };
  }
}
