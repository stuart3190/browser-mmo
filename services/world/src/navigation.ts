import type { CollisionWorld } from '@mmo/game-data';

type XZ = { x: number; z: number };

/**
 * First navigation layer: a uniform walkability grid (default 1 m cells) baked once per zone from
 * the static CollisionWorld, A* over it (8-connected, no corner cutting, octile heuristic) and
 * line-of-sight string pulling to produce few, smooth waypoints.
 *
 * Cost control: searches reuse typed arrays via generation stamps (no per-search allocation of
 * the grid) and stop after `maxExpansions`. Callers repath rarely (on a timer or when the goal
 * moves). Designed to be swapped for a navmesh/hierarchical planner behind the same `findPath`
 * contract when zones get large.
 */
export class NavGrid {
  readonly cols: number;
  readonly rows: number;
  private readonly walkable: Uint8Array;
  private readonly g: Float64Array;
  private readonly came: Int32Array;
  private readonly stamp: Uint32Array;
  private readonly closed: Uint32Array;
  private generation = 0;
  /** Diagnostics: expansions used by the last search. */
  lastExpansions = 0;

  constructor(
    private readonly collision: CollisionWorld,
    private readonly bounds: { minX: number; minZ: number; maxX: number; maxZ: number },
    readonly agentRadius: number,
    readonly cellSize = 1,
  ) {
    this.cols = Math.ceil((bounds.maxX - bounds.minX) / cellSize);
    this.rows = Math.ceil((bounds.maxZ - bounds.minZ) / cellSize);
    const n = this.cols * this.rows;
    this.walkable = new Uint8Array(n);
    this.g = new Float64Array(n);
    this.came = new Int32Array(n);
    this.stamp = new Uint32Array(n);
    this.closed = new Uint32Array(n);
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const p = this.center(r * this.cols + c);
        // keep a margin from the zone edge as well
        const inside =
          p.x > bounds.minX + agentRadius &&
          p.x < bounds.maxX - agentRadius &&
          p.z > bounds.minZ + agentRadius &&
          p.z < bounds.maxZ - agentRadius;
        this.walkable[r * this.cols + c] =
          inside && !collision.overlaps(p, agentRadius + 0.15) ? 1 : 0;
      }
    }
  }

  private index(p: XZ): number {
    const c = Math.floor((p.x - this.bounds.minX) / this.cellSize);
    const r = Math.floor((p.z - this.bounds.minZ) / this.cellSize);
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return -1;
    return r * this.cols + c;
  }

  private center(i: number): XZ {
    const c = i % this.cols;
    const r = Math.floor(i / this.cols);
    return {
      x: this.bounds.minX + (c + 0.5) * this.cellSize,
      z: this.bounds.minZ + (r + 0.5) * this.cellSize,
    };
  }

  isWalkable(p: XZ): boolean {
    const i = this.index(p);
    return i >= 0 && this.walkable[i] === 1;
  }

  /** Nearest walkable cell to p within `radius` cells (ring search), or -1. */
  private nearestWalkable(p: XZ, radius = 6): number {
    const i = this.index(p);
    if (i >= 0 && this.walkable[i]) return i;
    const c0 = Math.floor((p.x - this.bounds.minX) / this.cellSize);
    const r0 = Math.floor((p.z - this.bounds.minZ) / this.cellSize);
    let best = -1;
    let bestD = Infinity;
    for (let d = 1; d <= radius && best < 0; d++) {
      for (let dr = -d; dr <= d; dr++) {
        for (let dc = -d; dc <= d; dc++) {
          if (Math.max(Math.abs(dr), Math.abs(dc)) !== d) continue;
          const r = r0 + dr;
          const c = c0 + dc;
          if (r < 0 || c < 0 || r >= this.rows || c >= this.cols) continue;
          const j = r * this.cols + c;
          if (!this.walkable[j]) continue;
          const dd = dr * dr + dc * dc;
          if (dd < bestD) {
            bestD = dd;
            best = j;
          }
        }
      }
    }
    return best;
  }

  /**
   * Smoothed waypoints from `from` to `to` (excluding `from`, ending at `to` or the nearest
   * reachable point to it), or null when no path exists within the search budget.
   */
  findPath(from: XZ, to: XZ, maxExpansions = 8000): XZ[] | null {
    const start = this.nearestWalkable(from);
    const goal = this.nearestWalkable(to);
    if (start < 0 || goal < 0) return null;
    if (start === goal) return [{ x: to.x, z: to.z }];
    const gen = ++this.generation;
    const heap = new MinHeap();
    const gc = this.center(goal);
    const h = (i: number) => {
      const p = this.center(i);
      const dx = Math.abs(p.x - gc.x);
      const dz = Math.abs(p.z - gc.z);
      return Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz);
    };
    this.stamp[start] = gen;
    this.g[start] = 0;
    this.came[start] = -1;
    heap.push(start, h(start));
    let expansions = 0;
    let found = false;
    while (heap.size > 0) {
      const cur = heap.pop();
      if (this.closed[cur] === gen) continue;
      this.closed[cur] = gen;
      if (cur === goal) {
        found = true;
        break;
      }
      if (++expansions > maxExpansions) break;
      const cc = cur % this.cols;
      const cr = Math.floor(cur / this.cols);
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (!dr && !dc) continue;
          const r = cr + dr;
          const c = cc + dc;
          if (r < 0 || c < 0 || r >= this.rows || c >= this.cols) continue;
          const n = r * this.cols + c;
          if (!this.walkable[n] || this.closed[n] === gen) continue;
          if (
            dr &&
            dc &&
            (!this.walkable[cr * this.cols + c] || !this.walkable[r * this.cols + cc])
          )
            continue; // no corner cutting
          const ng = this.g[cur]! + (dr && dc ? Math.SQRT2 : 1);
          if (this.stamp[n] === gen && ng >= this.g[n]!) continue;
          this.stamp[n] = gen;
          this.g[n] = ng;
          this.came[n] = cur;
          heap.push(n, ng + h(n));
        }
      }
    }
    this.lastExpansions = expansions;
    if (!found) return null;
    const cells: XZ[] = [];
    for (let i = goal; i !== -1 && i !== start; i = this.came[i]!) cells.push(this.center(i));
    cells.reverse();
    const goalPoint = this.index(to) === goal ? { x: to.x, z: to.z } : this.center(goal);
    cells[cells.length - 1] = goalPoint;
    return this.smooth(from, cells);
  }

  /** String pulling: keep only waypoints needed to stay clear of obstacles. */
  private smooth(from: XZ, pts: XZ[]): XZ[] {
    const out: XZ[] = [];
    let anchor = from;
    let i = 0;
    while (i < pts.length) {
      let far = i;
      for (let j = pts.length - 1; j > i; j--) {
        if (!this.collision.sweepBlocked(anchor, pts[j]!, this.agentRadius * 0.9)) {
          far = j;
          break;
        }
      }
      out.push(pts[far]!);
      anchor = pts[far]!;
      i = far + 1;
    }
    return out;
  }
}

class MinHeap {
  private ids: number[] = [];
  private keys: number[] = [];
  get size() {
    return this.ids.length;
  }
  push(id: number, key: number) {
    this.ids.push(id);
    this.keys.push(key);
    let i = this.ids.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.keys[p]! <= this.keys[i]!) break;
      this.swap(i, p);
      i = p;
    }
  }
  pop(): number {
    const top = this.ids[0]!;
    const lastId = this.ids.pop()!;
    const lastKey = this.keys.pop()!;
    if (this.ids.length > 0) {
      this.ids[0] = lastId;
      this.keys[0] = lastKey;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < this.ids.length && this.keys[l]! < this.keys[m]!) m = l;
        if (r < this.ids.length && this.keys[r]! < this.keys[m]!) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }
  private swap(a: number, b: number) {
    [this.ids[a], this.ids[b]] = [this.ids[b]!, this.ids[a]!];
    [this.keys[a], this.keys[b]] = [this.keys[b]!, this.keys[a]!];
  }
}
