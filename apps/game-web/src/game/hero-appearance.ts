import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import type { PlayerAppearance } from '@mmo/schemas';
import { getGameData } from '@mmo/game-data';

/** Base class clothes plus actual server-equipped gear; condition never erases an item's identity. */
export function dressHero(
  scene: Scene,
  root: Mesh,
  hand: Mesh,
  appearance: PlayerAppearance,
  leftHand: Mesh,
) {
  const meshes: Mesh[] = [],
    materials: StandardMaterial[] = [];
  const mage = appearance.classId === 'class.mage';
  const gd = getGameData();
  const gear = appearance.gear;
  const chestType = gd.itemTemplates.get(gear?.chest ?? '')?.equipment?.equipmentTypeId;
  const headType = gd.itemTemplates.get(gear?.head ?? '')?.equipment?.equipmentTypeId;
  const accentColor =
    appearance.specialisationId === 'spec.mage.fire'
      ? '#ed9859'
      : appearance.specialisationId === 'spec.mage.frost'
        ? '#80ddec'
        : appearance.specialisationId === 'spec.warrior.berserker'
          ? '#c96c54'
          : appearance.specialisationId === 'spec.warrior.guardian'
            ? '#e1c67d'
            : mage
              ? '#ab9cd4'
              : '#b5c6cd';
  const mat = (name: string, hex: string, glow = false) => {
    const m = new StandardMaterial(`${root.name}_${name}`, scene);
    m.diffuseColor = Color3.FromHexString(hex);
    m.specularColor = Color3.Black();
    if (glow) m.emissiveColor = Color3.FromHexString(hex).scale(0.3);
    materials.push(m);
    return m;
  };
  const cloth = mat(
      'class_cloth',
      chestType === 'cloth' ? '#315f87' : mage ? '#504b80' : '#405c70',
    ),
    accent = mat('class_accent', accentColor),
    metal = mat('weapon_metal', '#d2dedc'),
    wood = mat('weapon_wood', '#806044');
  (root.material as StandardMaterial).diffuseColor = cloth.diffuseColor.clone();
  const box = (
    name: string,
    size: [number, number, number],
    pos: [number, number, number],
    material = cloth,
    parent = root,
  ) => {
    const m = MeshBuilder.CreateBox(
      `${root.name}_${name}`,
      { width: size[0], height: size[1], depth: size[2] },
      scene,
    );
    m.parent = parent;
    m.position.set(...pos);
    m.material = material;
    meshes.push(m);
    return m;
  };
  if (mage) {
    const robe = MeshBuilder.CreateCylinder(
      `${root.name}_mage_robe`,
      { height: 0.9, diameterTop: 0.59, diameterBottom: 0.94, tessellation: 8 },
      scene,
    );
    robe.parent = root;
    robe.position.y = -0.65;
    robe.material = cloth;
    meshes.push(robe);
    box('robe_trim', [0.14, 0.88, 0.035], [0, -0.64, 0.43], accent);
    box('mage_collar', [0.75, 0.24, 0.49], [0, 0.28, 0], accent);
    if (!headType) {
      box('hood_back', [0.5, 0.55, 0.15], [0, 0.62, -0.21]);
      for (const x of [-0.26, 0.26]) box('hood_side', [0.12, 0.44, 0.4], [x, 0.66, -0.02]);
      box('hood_top', [0.61, 0.15, 0.48], [0, 0.92, -0.02]);
    }
  } else {
    box('warrior_cuirass', [0.7, 0.59, 0.12], [0, 0.03, 0.23], accent);
    for (const x of [-0.47, 0.47]) box('warrior_pauldron', [0.38, 0.25, 0.48], [x, 0.3, 0], accent);
    box('warrior_tabard', [0.36, 0.66, 0.06], [0, -0.57, 0.25], cloth);
  }
  if (headType) {
    const leather = mat('equipped_cap_leather', '#73563e');
    box('equipped_head_crown', [0.54, 0.27, 0.5], [0, 0.87, -0.01], leather);
    box('equipped_head_brim', [0.67, 0.08, 0.66], [0, 0.76, 0.08], leather);
    box('equipped_head_band', [0.56, 0.065, 0.52], [0, 0.8, -0.01], accent);
  }
  if (chestType === 'plate') {
    box('equipped_chest_plate', [0.78, 0.68, 0.14], [0, 0.03, 0.29], metal);
    box('equipped_chest_back', [0.73, 0.66, 0.1], [0, 0.03, -0.25], metal);
    for (const x of [-0.48, 0.48])
      box('equipped_chest_shoulder', [0.42, 0.3, 0.56], [x, 0.32, 0], metal);
    box('equipped_chest_crest', [0.23, 0.32, 0.035], [0, 0.04, 0.38], accent);
  } else if (chestType === 'cloth') {
    const embroidery = mat('robe_embroidery', '#d5b76d');
    box('equipped_chest_sash', [0.7, 0.14, 0.46], [0, -0.24, 0], embroidery);
    box('equipped_chest_panel', [0.3, 0.62, 0.05], [0, -0.56, 0.45], cloth);
    box('equipped_chest_hem', [0.76, 0.09, 0.06], [0, -1.03, 0.4], embroidery);
  }
  if (gd.itemTemplates.get(gear?.cloak ?? '')?.equipment?.equipmentTypeId === 'cloak') {
    const cape = mat(
      'equipped_cloak_cloth',
      gear?.cloak === 'accessory.cloak.oathkeepers_mantle'
        ? '#416a92'
        : gear?.cloak === 'accessory.cloak.rootward_mantle'
          ? '#77587d'
          : '#527052',
    );
    const drape = MeshBuilder.CreateRibbon(
      `${root.name}_equipped_cloak`,
      {
        pathArray: [
          [
            new Vector3(-0.28, 0.28, -0.31),
            new Vector3(0, 0.28, -0.35),
            new Vector3(0.28, 0.28, -0.31),
          ],
          [
            new Vector3(-0.39, -0.3, -0.36),
            new Vector3(0, -0.3, -0.48),
            new Vector3(0.39, -0.3, -0.36),
          ],
          [
            new Vector3(-0.51, -0.88, -0.46),
            new Vector3(0, -0.91, -0.52),
            new Vector3(0.51, -0.88, -0.46),
          ],
        ],
        sideOrientation: 2,
      },
      scene,
    );
    drape.parent = root;
    drape.material = cape;
    meshes.push(drape);
    box('equipped_cloak_clasp', [0.13, 0.13, 0.08], [-0.23, 0.28, 0.29], accent);
  }
  if (gd.itemTemplates.get(gear?.offHand ?? '')?.equipment?.equipmentTypeId === 'shield') {
    const shield = MeshBuilder.CreateCylinder(
      `${root.name}_equipped_shield`,
      { height: 0.13, diameter: 0.92, tessellation: 12 },
      scene,
    );
    shield.parent = leftHand;
    shield.position.set(-0.19, -0.18, 0.08);
    shield.rotation.z = Math.PI / 2;
    shield.material = wood;
    meshes.push(shield);
    const rim = MeshBuilder.CreateTorus(
      `${root.name}_equipped_shield_rim`,
      { diameter: 0.87, thickness: 0.07, tessellation: 16 },
      scene,
    );
    rim.parent = shield;
    rim.position.y = 0.08;
    rim.material = metal;
    meshes.push(rim);
    box('equipped_shield_boss', [0.16, 0.23, 0.23], [-0.28, -0.18, 0.08], metal, leftHand);
  }
  const type = gd.itemTemplates.get(appearance.mainHandTemplateId ?? '')?.equipment
    ?.equipmentTypeId;
  if (type === 'staff' || type === 'wand') {
    const length = type === 'staff' ? 1.8 : 0.65;
    box(`held_${type}`, [0.09, length, 0.09], [0.07, -0.15, 0.33], wood, hand);
    const orb = MeshBuilder.CreateIcoSphere(
      `${root.name}_focus_gem`,
      { radius: type === 'staff' ? 0.19 : 0.12, subdivisions: 0 },
      scene,
    );
    orb.parent = hand;
    orb.position.set(0.07, length / 2 - 0.1, 0.33);
    orb.material = mat('focus_light', accentColor, true);
    meshes.push(orb);
  } else if (type) {
    const length = type === 'dagger' ? 0.58 : 1.1;
    box(`held_${type}`, [0.13, 0.07, length], [0, -0.26, length / 2 + 0.15], metal, hand);
    box('weapon_grip', [0.1, 0.09, 0.28], [0, -0.26, 0.08], wood, hand);
    box('weapon_guard', [0.4, 0.08, 0.08], [0, -0.26, 0.25], accent, hand);
    if (type === 'axe') box('axe_head', [0.52, 0.1, 0.34], [0.17, -0.26, 1.03], metal, hand);
    if (type === 'mace') box('mace_head', [0.32, 0.3, 0.32], [0, -0.26, 1.12], metal, hand);
  }
  return () => {
    meshes.forEach((m) => m.dispose());
    materials.forEach((m) => m.dispose());
  };
}
