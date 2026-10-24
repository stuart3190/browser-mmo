import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import type { Scene } from '@babylonjs/core/scene';
import type { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { WorldChunk } from '@mmo/schemas';
import { tidewatch } from '@mmo/game-data';

/** Walkable tidal shallows and survey marks. Solid shore rocks use the shared prop colliders. */
export function coastalScenery(
  scene: Scene,
  chunk: WorldChunk,
  size: number,
  material: (hex: string) => StandardMaterial,
) {
  if (chunk.zoneId !== tidewatch.zoneId) return [];
  const meshes = [];
  const minX = chunk.coord.cx * size,
    maxX = minX + size,
    minZ = chunk.coord.cz * size,
    maxZ = minZ + size;
  const patch = (
    name: string,
    x0: number,
    z0: number,
    x1: number,
    z1: number,
    color: string,
    y: number,
  ) => {
    const left = Math.max(minX, x0),
      right = Math.min(maxX, x1),
      near = Math.max(minZ, z0),
      far = Math.min(maxZ, z1);
    if (right <= left || far <= near) return;
    const mesh = MeshBuilder.CreateGround(name, { width: right - left, height: far - near }, scene);
    mesh.position.set((left + right) / 2, y, (near + far) / 2);
    mesh.material = material(color);
    mesh.isPickable = false;
    meshes.push(mesh);
  };
  patch('tidewatch_shallows', 175, 64, 385, 96, '#548e9b', 0.012);
  patch('tidewatch_open_water', 386, 96, 450, 260, '#548e9b', 0.012);
  patch('tidewatch_east_sand', 380, 96, 386, 260, '#b9ac82', 0.014);
  for (const x of [389, 399, 413])
    patch('tidewatch_east_foam', x, 99, x + 0.3, 256, '#bedbd4', 0.018);
  patch('tidewatch_wet_sand', 175, 96, 385, 101, '#b9ac82', 0.014);
  for (const z of [70, 80, 91]) patch('tidewatch_foam', 182, z, 378, z + 0.3, '#bedbd4', 0.018);
  for (const l of tidewatch.landmarks) {
    if (l.position.x < minX || l.position.x >= maxX || l.position.z < minZ || l.position.z >= maxZ)
      continue;
    const ring = MeshBuilder.CreateTorus(
      `survey_${l.id}`,
      { diameter: 3.6, thickness: 0.12, tessellation: 32 },
      scene,
    );
    ring.position.set(l.position.x, 0.07, l.position.z);
    ring.material = material('#e4cb8d');
    ring.isPickable = false;
    meshes.push(ring);
    for (const x of [-0.6, 0, 0.6]) {
      const rune = MeshBuilder.CreateGround(
        'tidewatch_oath_mark',
        { width: 0.12, height: 1.4 },
        scene,
      );
      rune.position.set(l.position.x + x, 0.045, l.position.z);
      rune.material = material('#4d7778');
      rune.isPickable = false;
      meshes.push(rune);
    }
  }
  return meshes;
}
