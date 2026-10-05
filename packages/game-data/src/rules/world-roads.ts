/** Clip a road to one chunk; large authored roads never create continent-sized draw meshes. */
export function clipRoad(
  a: { x: number; z: number },
  b: { x: number; z: number },
  bounds: { minX: number; minZ: number; maxX: number; maxZ: number },
) {
  const dx = b.x - a.x,
    dz = b.z - a.z;
  let lo = 0,
    hi = 1;
  for (const [p, q] of [
    [-dx, a.x - bounds.minX],
    [dx, bounds.maxX - a.x],
    [-dz, a.z - bounds.minZ],
    [dz, bounds.maxZ - a.z],
  ]) {
    if (p === 0) {
      if (q! < 0) return null;
      continue;
    }
    const t = q! / p!;
    if (p! < 0) lo = Math.max(lo, t);
    else hi = Math.min(hi, t);
    if (lo > hi) return null;
  }
  if (hi - lo < 0.00001) return null;
  return { a: { x: a.x + lo * dx, z: a.z + lo * dz }, b: { x: a.x + hi * dx, z: a.z + hi * dz } };
}
