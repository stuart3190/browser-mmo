import { expect, it } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { EntityViews } from './entity-view';

it('picks articulated children, crosses the rotation seam smoothly, and cleans up a despawned rig', () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  try {
    void scene.defaultMaterial; // Babylon lazily creates this scene-owned fallback.
    const views = new EntityViews(scene, 'local');
    const before = { meshes: scene.meshes.length, materials: scene.materials.length };
    views.upsert({
      id: 'wolf',
      kind: 'enemy',
      name: 'Grey Wolf',
      position: { x: 1, y: 0, z: 2 },
      rotationY: Math.PI - 0.01,
      refId: null,
      characterId: null,
      dead: false,
    });
    const body = scene.getMeshByName('wolf')!;
    const muzzle = scene.getMeshByName('wolf_muzzle')!;
    expect(views.entityIdOfMesh(muzzle)).toBe('wolf');
    views.move('wolf', 2, 0, 2, -Math.PI + 0.01);
    views.update(0.025);
    expect(Math.abs(body.rotation.y - Math.PI)).toBeLessThan(0.03);
    views.setDead('wolf', true);
    views.update(0.1);
    expect(body.rotation.z).toBe(Math.PI / 2);
    views.setDead('wolf', false);
    expect(body.rotation.z).toBe(0);
    views.flash('wolf');
    views.remove('wolf');
    views.update(1);
    expect(scene.meshes).toHaveLength(before.meshes);
    expect(scene.materials).toHaveLength(before.materials);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

it('renders a pickable Lantern, restores its warning and removes all meshes/materials on despawn', () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  try {
    void scene.defaultMaterial;
    const views = new EntityViews(scene, 'local');
    const before = { meshes: scene.meshes.length, materials: scene.materials.length };
    const e = {
      id: 'lantern',
      kind: 'enemy' as const,
      name: 'Hollow Lantern',
      position: { x: -93, y: 0, z: -82 },
      rotationY: 0,
      refId: 'enemy.greenvale.hollow_lantern',
      characterId: null,
      dead: false,
      attackCue: { endsAtMs: 2000, range: 10 },
    };
    views.upsert(e);
    expect(views.entityIdOfMesh(scene.getMeshByName('lantern_ward_shard')!)).toBe(e.id);
    expect(scene.getMeshByName('bite_lantern')).toBeTruthy();
    views.update(0.1);
    views.upsert({ ...e, dead: true, attackCue: null });
    expect(scene.getMeshByName('bite_lantern')).toBeNull();
    views.remove(e.id);
    expect(scene.meshes).toHaveLength(before.meshes);
    expect(scene.materials).toHaveLength(before.materials);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

it('keeps the Warden ground mark fixed while the enemy moves, then clears and disposes it', () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  try {
    void scene.defaultMaterial;
    const views = new EntityViews(scene, 'local');
    const before = { meshes: scene.meshes.length, materials: scene.materials.length };
    const e = {
      id: 'warden',
      kind: 'enemy' as const,
      name: 'Siltbound Warden',
      position: { x: 75, y: 0, z: 27 },
      rotationY: 0,
      refId: 'enemy.greenvale.siltbound_warden',
      characterId: null,
      dead: false,
      attackCue: { endsAtMs: 2000, range: 2.5, groundPosition: { x: 72, y: 0, z: 29 } },
    };
    views.upsert(e);
    views.update(0.1);
    const mark = scene.getMeshByName('bite_warden')!;
    expect(mark.position.x).toBe(72);
    expect(mark.position.z).toBe(29);
    expect(views.entityIdOfMesh(scene.getMeshByName('warden_stone_arm')!)).toBe('warden');
    views.move(e.id, 73, 0, 26, 1);
    views.update(0.1);
    expect(mark.position.x).toBe(72);
    expect(mark.position.z).toBe(29);
    views.upsert({ ...e, attackCue: null });
    expect(scene.getMeshByName('bite_warden')).toBeNull();
    views.upsert(e);
    views.reset('local');
    expect(scene.meshes).toHaveLength(before.meshes);
    expect(scene.materials).toHaveLength(before.materials);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});
