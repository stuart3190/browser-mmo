import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import type { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { WorldChunk } from '@mmo/schemas';
import { livingSeal } from '@mmo/game-data';

/** Survey glyphs and moss make the living-seal trail readable; solid trunks use shared props. */
export function forestScenery(
  scene: Scene,
  chunk: WorldChunk,
  size: number,
  material: (hex: string) => StandardMaterial,
) {
  if (chunk.zoneId !== livingSeal.zoneId) return [];
  const meshes: Mesh[] = [];
  const contains = (x: number, z: number) =>
    Math.floor(x / size) === chunk.coord.cx && Math.floor(z / size) === chunk.coord.cz;
  const disc = (name: string, x: number, z: number, radius: number, color: string) => {
    const m = MeshBuilder.CreateDisc(name, { radius, tessellation: 16 }, scene);
    m.rotation.x = Math.PI / 2;
    m.position.set(x, 0.025, z);
    m.material = material(color);
    m.isPickable = false;
    meshes.push(m);
    return m;
  };
  for (const p of chunk.props.filter((p) => p.modelId === 'authored:elder_tree'))
    disc(`${p.id}_moss`, p.position.x, p.position.z, 2.2 * p.scale, '#3d573e');
  for (const l of livingSeal.landmarks) {
    if (!contains(l.position.x, l.position.z)) continue;
    disc(`${l.id}_clearing`, l.position.x, l.position.z, 3.2, '#6d7851');
    const ring = MeshBuilder.CreateTorus(
      `${l.id}_survey`,
      { diameter: 3.7, thickness: 0.13, tessellation: 32 },
      scene,
    );
    ring.position.set(l.position.x, 0.07, l.position.z);
    ring.material = material('#d7ca86');
    ring.isPickable = false;
    meshes.push(ring);
    for (let i = 0; i < 5; i++) {
      const a = (i * Math.PI * 2) / 5;
      const leaf = MeshBuilder.CreateGround(`${l.id}_leaf`, { width: 0.18, height: 1.3 }, scene);
      leaf.position.set(
        l.position.x + Math.sin(a) * 0.55,
        0.055,
        l.position.z + Math.cos(a) * 0.55,
      );
      leaf.rotation.y = a;
      leaf.material = material('#aac77b');
      leaf.isPickable = false;
      meshes.push(leaf);
      const mote = MeshBuilder.CreateIcoSphere(
        `${l.id}_seedlight`,
        { radius: 0.07, subdivisions: 0 },
        scene,
      );
      mote.position.set(
        l.position.x + Math.sin(a) * 2.6,
        0.65 + (i % 3) * 0.4,
        l.position.z + Math.cos(a) * 2.6,
      );
      mote.material = material('#dfdc99');
      mote.isPickable = false;
      meshes.push(mote);
    }
  }
  return meshes;
}
