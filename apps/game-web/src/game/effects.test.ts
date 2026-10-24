import { expect, it } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { WorldEntitySchema } from '@mmo/schemas';
import { Effects } from './effects';

it('renders replicated guard/root effects without blocking selection, follows movement and cleans up on expiry/death', () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  try {
    void scene.defaultMaterial;
    const before = scene.materials.length;
    const fx = new Effects(scene);
    const entity = WorldEntitySchema.parse({
      id: 'test',
      kind: 'player',
      refId: null,
      characterId: null,
      name: 'Test',
      position: { x: 1, y: 0, z: 2 },
      rotationY: 0,
      statuses: [{ kind: 'guard', magnitude: 0.5, expiresAtMs: 5000 }],
    });
    fx.setStatuses(entity);
    fx.setStatuses(entity); // identical snapshots must not create duplicate effects
    expect(scene.meshes).toHaveLength(1);
    expect(scene.meshes[0]!.isPickable).toBe(false);
    fx.update(0.1, 2000, () => new Vector3(5, 0, 8));
    expect(scene.meshes[0]!.position.asArray()).toEqual([5, 1, 8]);
    fx.update(0.1, 5000);
    expect(scene.meshes).toHaveLength(0);
    expect(scene.materials).toHaveLength(before);
    entity.statuses = [{ kind: 'root', magnitude: 0, expiresAtMs: 8000 }];
    fx.setStatuses(entity);
    expect(scene.meshes).toHaveLength(1);
    fx.setStatuses({ ...entity, dead: true });
    expect(scene.meshes).toHaveLength(0);
    fx.setStatuses(entity);
    fx.clearStatuses();
    expect(scene.meshes).toHaveLength(0);
    expect(scene.materials).toHaveLength(before);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});
