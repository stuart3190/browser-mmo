import { expect, it } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { batchStaticProps } from './static-batches';

function verticesByMaterial(meshes: Mesh[]) {
  const vertices: string[] = [];
  for (const mesh of meshes) {
    const world = mesh.computeWorldMatrix(true),
      positions = mesh.getVerticesData('position')!;
    for (let i = 0; i < positions.length; i += 3) {
      const point = Vector3.TransformCoordinates(Vector3.FromArray(positions, i), world);
      vertices.push(
        `${mesh.material?.name}:${point
          .asArray()
          .map((v) => v.toFixed(3))
          .join(',')}`,
      );
    }
  }
  return vertices.sort();
}

it('preserves rotated/scaled parent and child geometry and materials without retaining source meshes', () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  try {
    const wood = new StandardMaterial('wood', scene),
      roof = new StandardMaterial('roof', scene);
    const roots: Mesh[] = [];
    for (let i = 0; i < 3; i++) {
      const house = MeshBuilder.CreateBox(`house${i}`, { width: 8, height: 5, depth: 6 }, scene);
      house.position.set(i * 19 - 11, 3, i * -13 + 2);
      house.scaling.setAll(0.75 + i * 0.5);
      house.rotation.y = i * 0.8;
      house.material = wood;
      const child = MeshBuilder.CreateBox(`roof${i}`, { width: 5, height: 0.25, depth: 7 }, scene);
      child.parent = house;
      child.position.set(2, 3.25, 0);
      child.rotation.z = -0.5;
      child.material = roof;
      roots.push(house);
    }
    const original = scene.meshes.slice() as Mesh[],
      positions = verticesByMaterial(original),
      indices = original.reduce((n, m) => n + m.getTotalIndices(), 0);
    const batches = batchStaticProps(roots, 'fixture');
    expect(batches).toHaveLength(2);
    expect(verticesByMaterial(batches)).toEqual(positions);
    expect(batches.reduce((n, m) => n + m.getTotalIndices(), 0)).toBe(indices);
    expect(scene.meshes).toHaveLength(2);
    expect(batches.every((m) => !m.isPickable && m.parent === null)).toBe(true);
    for (const mesh of batches) mesh.dispose();
    expect(scene.meshes).toHaveLength(0);
    expect(scene.materials).toEqual(expect.arrayContaining([wood, roof]));
  } finally {
    scene.dispose();
    engine.dispose();
  }
});
