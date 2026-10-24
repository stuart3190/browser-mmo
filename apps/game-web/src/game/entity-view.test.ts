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

it('renders the frozen amber sector independently of enemy movement and cleans it up', () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  try {
    void scene.defaultMaterial;
    const views = new EntityViews(scene, 'local');
    const baseline = scene.meshes.length;
    const e = {
      id: 'sentinel',
      kind: 'enemy' as const,
      name: 'Aster',
      position: { x: 33, y: 0, z: 118 },
      rotationY: Math.PI,
      refId: 'enemy.greenvale.last_door_sentinel',
      characterId: null,
      dead: false,
      attackCue: {
        endsAtMs: 3000,
        range: 6,
        groundPosition: { x: 33, y: 0, z: 118 },
        cleave: { heading: Math.PI, arc: Math.PI / 2 },
      },
    };
    views.upsert(e);
    views.upsert({ ...e, rotationY: 0 });
    views.update(0.1);
    expect(scene.getMeshByName('sentinel')!.rotation.y).toBeCloseTo(0);
    views.move(e.id, 40, 0, 120, 0);
    views.update(0.1);
    const sector = scene.getMeshByName('bite_sentinel')!;
    expect(sector.position.x).toBe(33);
    expect(sector.position.z).toBe(118);
    expect(sector.rotation.y).toBe(Math.PI);
    expect(sector.getTotalVertices()).toBeGreaterThan(0);
    expect(sector.isPickable).toBe(false);
    views.upsert({ ...e, attackCue: null });
    expect(scene.getMeshByName('bite_sentinel')).toBeNull();
    views.remove(e.id);
    expect(scene.meshes.length).toBe(baseline);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

it('gives shore creatures distinct pickable rigs and preserves boss scale through animation', () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  try {
    void scene.defaultMaterial;
    const baseline = { meshes: scene.meshes.length, materials: scene.materials.length };
    const views = new EntityViews(scene, 'local');
    for (const [id, refId] of [
      ['crab', 'enemy.amber_coast.glassback_crab'],
      ['bell', 'enemy.amber_coast.drowned_bellkeeper'],
    ] as const) {
      views.upsert({
        id,
        refId,
        kind: 'enemy',
        name: id,
        position: { x: 0, y: 0, z: 0 },
        rotationY: 0,
        characterId: null,
      });
    }
    expect(views.entityIdOfMesh(scene.getMeshByName('crab_crab_claw')!)).toBe('crab');
    expect(views.entityIdOfMesh(scene.getMeshByName('bell_anchor_flukes')!)).toBe('bell');
    views.update(0.1);
    expect(scene.getMeshByName('bell')!.scaling.y).toBeGreaterThan(1.3);
    views.remove('crab');
    views.remove('bell');
    expect(scene.meshes).toHaveLength(baseline.meshes);
    expect(scene.materials).toHaveLength(baseline.materials);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

it('renders replicated class outfits and held gear, updates existing actors and releases removed outfits', () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  void scene.defaultMaterial;
  try {
    const views = new EntityViews(scene, 'local');
    const before = { meshes: scene.meshes.length, materials: scene.materials.length };
    const e = {
      id: 'visitor',
      kind: 'player' as const,
      name: 'Visitor',
      position: { x: 0, y: 0, z: 0 },
      rotationY: 0,
      refId: null,
      characterId: null,
      appearance: {
        classId: 'class.mage',
        specialisationId: 'spec.mage.frost',
        mainHandTemplateId: 'weapon.staff.oak_staff',
      },
    };
    views.upsert(e);
    expect(scene.getMeshByName('visitor_mage_robe')).toBeTruthy();
    expect(scene.getMeshByName('visitor_warrior_cuirass')).toBeNull();
    const staff = scene.getMeshByName('visitor_held_staff')!;
    expect(views.entityIdOfMesh(staff)).toBe('visitor');
    const dressed = { meshes: scene.meshes.length, materials: scene.materials.length };
    for (let i = 0; i < 5; i++) views.upsert(e);
    expect(scene.meshes).toHaveLength(dressed.meshes);
    expect(scene.materials).toHaveLength(dressed.materials);
    views.upsert({ ...e, appearance: { ...e.appearance, mainHandTemplateId: null } });
    expect(scene.getMeshByName('visitor_held_staff')).toBeNull();
    expect(scene.getMeshByName('visitor_mage_robe')).toBeTruthy();
    views.upsert({
      ...e,
      appearance: {
        classId: 'class.warrior',
        specialisationId: 'spec.warrior.guardian',
        mainHandTemplateId: 'weapon.sword.iron_longsword',
      },
    });
    expect(scene.getMeshByName('visitor_mage_robe')).toBeNull();
    expect(scene.getMeshByName('visitor_warrior_cuirass')).toBeTruthy();
    expect(views.entityIdOfMesh(scene.getMeshByName('visitor_held_sword')!)).toBe('visitor');
    views.update(0.1);
    views.remove(e.id);
    expect(scene.meshes).toHaveLength(before.meshes);
    expect(scene.materials).toHaveLength(before.materials);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});
it.each([
  ['enemy.elderwood.briar_spitter', 'spitter'],
  ['enemy.elderwood.rootbound_cantor', 'cantor'],
])('renders a distinct pickable %s and cleans its plant rig/cue on despawn', (ref, id) => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  try {
    void scene.defaultMaterial;
    const views = new EntityViews(scene, 'local'),
      before = { meshes: scene.meshes.length, materials: scene.materials.length };
    views.upsert({
      id: id!,
      kind: 'enemy',
      name: id!,
      position: { x: 1, y: 0, z: 2 },
      rotationY: 0,
      refId: ref!,
      characterId: null,
      dead: false,
      attackCue: { endsAtMs: 2000, range: 4.5, groundPosition: { x: 3, y: 0, z: 4 } },
    });
    expect(views.entityIdOfMesh(scene.getMeshByName(`${id}_heart_seed`)!)).toBe(id);
    expect(scene.getMeshByName(`${id}_leaf_crown`)).toBeTruthy();
    views.update(0.1);
    expect(scene.getMeshByName(`bite_${id}`)!.position.x).toBe(3);
    views.remove(id!);
    expect(scene.meshes).toHaveLength(before.meshes);
    expect(scene.materials).toHaveLength(before.materials);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

it('shows actual equipped armour, cap, cloak and shield, preserves picking and removes them cleanly', () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  void scene.defaultMaterial;
  try {
    const views = new EntityViews(scene, 'local');
    const baseline = { meshes: scene.meshes.length, materials: scene.materials.length };
    const e = {
      id: 'outfitted',
      kind: 'player' as const,
      name: 'Outfitted',
      position: { x: 0, y: 0, z: 0 },
      rotationY: 0,
      refId: null,
      characterId: null,
      appearance: {
        classId: 'class.warrior',
        specialisationId: null,
        mainHandTemplateId: 'weapon.sword.iron_longsword',
        gear: {
          head: 'armor.leather.trapper_cap',
          chest: 'armor.plate.recruit_breastplate',
          cloak: 'accessory.cloak.wayfarer_cloak',
          offHand: 'armor.shield.oak_buckler',
        },
      },
    };
    views.upsert(e);
    for (const name of [
      'equipped_head_crown',
      'equipped_chest_plate',
      'equipped_cloak',
      'equipped_shield',
      'equipped_shield_rim',
    ]) {
      const mesh = scene.getMeshByName(`outfitted_${name}`)!;
      expect(mesh).toBeTruthy();
      expect(views.entityIdOfMesh(mesh)).toBe(e.id);
    }
    const count = scene.meshes.length;
    views.upsert(e);
    expect(scene.meshes.length).toBe(count);
    views.upsert({
      ...e,
      appearance: {
        ...e.appearance,
        gear: { head: null, chest: null, cloak: null, offHand: null },
      },
    });
    expect(scene.meshes.filter((m) => m.name.startsWith('outfitted_equipped_'))).toHaveLength(0);
    expect(scene.getMeshByName('outfitted_held_sword')).toBeTruthy();
    views.upsert({
      ...e,
      appearance: {
        classId: 'class.mage',
        specialisationId: null,
        mainHandTemplateId: null,
        gear: {
          head: null,
          chest: 'armor.cloth.apprentice_robe',
          cloak: 'accessory.cloak.rootward_mantle',
          offHand: null,
        },
      },
    });
    expect(scene.getMeshByName('outfitted_equipped_chest_sash')).toBeTruthy();
    expect(scene.getMeshByName('outfitted_equipped_chest_plate')).toBeNull();
    views.remove(e.id);
    expect(scene.meshes.length).toBe(baseline.meshes);
    expect(scene.materials.length).toBe(baseline.materials);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});
