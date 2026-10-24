import { Mesh } from '@babylonjs/core/Meshes/mesh';

/** Bake static prop hierarchies into one draw per material/side within a single world chunk. */
export function batchStaticProps(roots: Mesh[], chunkKey: string): Mesh[] {
  if (!roots.length) return [];
  const groups = new Map<string, Mesh[]>();
  for (const root of roots) {
    for (const mesh of [root, ...root.getChildMeshes(false)] as Mesh[]) {
      const key = `${mesh.material?.uniqueId ?? 'none'}:${mesh.sideOrientation}`;
      const group = groups.get(key) ?? [];
      group.push(mesh);
      groups.set(key, group);
    }
  }
  const batches: Mesh[] = [];
  // Keep every source parent alive until all child world transforms have been baked.
  for (const [key, meshes] of groups) {
    const batch = Mesh.MergeMeshes(meshes, false, true);
    if (!batch) {
      for (const created of batches) created.dispose();
      return roots;
    }
    batch.name = `static_${chunkKey}_${key}`;
    batch.isPickable = false;
    batch.freezeWorldMatrix();
    batches.push(batch);
  }
  // Shared materials belong to WorldView; disposing a chunk must never dispose them.
  for (const root of roots) root.dispose();
  return batches;
}
