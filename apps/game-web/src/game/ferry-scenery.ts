import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import type { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';

/** Moored ferry and landing presentation. Travel nodes, walkable shallows and collision stay authoritative. */
export function ferryScenery(
  scene: Scene,
  id: string,
  at: { x: number; z: number },
  zoneId: string,
  material: (hex: string) => StandardMaterial,
): Mesh[] {
  const meshes: Mesh[] = [];
  const paint = zoneId.includes('elderwood')
    ? '#467765'
    : zoneId.includes('amber_coast')
      ? '#477a91'
      : '#8a6940';
  const finish = (m: Mesh, color: string) => {
    m.material = material(color);
    m.isPickable = false;
    meshes.push(m);
    return m;
  };
  const box = (
    name: string,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    color: string,
  ) => {
    const m = MeshBuilder.CreateBox(`${id}_${name}`, { width: w, height: h, depth: d }, scene);
    m.position.set(at.x + x, y, at.z + z);
    return finish(m, color);
  };
  const post = (name: string, x: number, z: number, height: number) => {
    const m = MeshBuilder.CreateCylinder(
      `${id}_${name}`,
      { diameter: 0.2, height, tessellation: 8 },
      scene,
    );
    m.position.set(at.x + x, height / 2, at.z + z);
    return finish(m, '#6b503a');
  };
  // A low plank landing leads away from the departure point; it does not cover the NPC approach.
  for (let i = 0; i < 11; i++)
    box(
      `landing_plank_${i}`,
      0,
      0.045,
      -1 - i * 0.8,
      3.2,
      0.08,
      0.75,
      i % 2 ? '#a48760' : '#977a54',
    );
  for (const x of [-1.8, 1.8])
    for (const z of [-1.5, -5.5, -9.5]) post(`mooring_${x}_${z}`, x, z, 1.1);
  for (let i = 0; i < 6; i++)
    box(`boarding_plank_${i}`, 2 + i * 0.8, 0.045, -8, 0.75, 0.08, 2, '#a48760');

  // Open, pointed hull replaces the old solid box, with seating and visible planking.
  const outline = [
    [0, -5.5],
    [2.2, -3.4],
    [2.2, 3.4],
    [0, 5.5],
    [-2.2, 3.4],
    [-2.2, -3.4],
  ];
  const ring = (scale: number, y: number) =>
    outline.map(([x, z]) => new Vector3(at.x + 7 + x! * scale, y, at.z - 12 + z! * scale));
  finish(
    MeshBuilder.CreateRibbon(
      `${id}_skiff_hull`,
      { pathArray: [ring(0.68, 0.04), ring(1, 1.05)], closePath: true, sideOrientation: 2 },
      scene,
    ),
    paint,
  );
  finish(
    MeshBuilder.CreateRibbon(
      `${id}_skiff_floor`,
      {
        pathArray: [ring(0.85, 0.23), outline.map(() => new Vector3(at.x + 7, 0.23, at.z - 12))],
        closePath: true,
        sideOrientation: 2,
      },
      scene,
    ),
    '#70543c',
  );
  for (let i = 0; i < 8; i++)
    box(`skiff_plank_${i}`, 7, 0.28, -15 + i * 0.82, 3.55, 0.08, 0.76, '#b09368');
  for (const z of [-14.1, -10.3]) box(`bench_${z}`, 7, 0.7, z, 4.15, 0.18, 0.65, '#d0b382');
  const rim = ring(1, 1.08);
  rim.push(rim[0]!.clone());
  finish(
    MeshBuilder.CreateTube(`${id}_skiff_rim`, { path: rim, radius: 0.09, tessellation: 6 }, scene),
    '#d1b786',
  );
  box('bow_locker', 7, 0.58, -16.1, 1.2, 0.65, 1.1, '#77583c');
  box('locker_strap', 7, 0.92, -16.1, 1.27, 0.06, 0.15, '#bca776');
  post('stern_flagpole', 7, -8.3, 2.9);
  box('ferry_flag', 7.4, 2.45, -8.3, 0.8, 0.62, 0.035, paint);
  box('flag_mark', 7.4, 2.45, -8.27, 0.12, 0.4, 0.04, '#e2cc8d');
  const rope = MeshBuilder.CreateTube(
    `${id}_mooring_rope`,
    {
      path: [
        new Vector3(at.x + 1.8, 0.95, at.z - 9.5),
        new Vector3(at.x + 3.5, 0.35, at.z - 9),
        new Vector3(at.x + 5.2, 1.03, at.z - 8.7),
      ],
      radius: 0.045,
      tessellation: 6,
    },
    scene,
  );
  finish(rope, '#c4ae78');
  for (const x of [4.55, 9.45]) {
    const oar = box(`oar_${x}`, x, 0.9, -12, 0.1, 0.1, 3.6, '#cfb685');
    oar.rotation.y = x < 7 ? -0.28 : 0.28;
    const blade = box(
      `oar_blade_${x}`,
      x + (x < 7 ? -0.45 : 0.45),
      0.9,
      -10.4,
      0.35,
      0.1,
      0.7,
      '#a98a59',
    );
    blade.rotation.y = oar.rotation.y;
  }
  for (const [x, z, w] of [
    [-7, -12, 3],
    [-4, -19, 4],
    [10, -20, 3],
    [-9, -7, 2],
  ])
    box(`ripple_${x}_${z}`, x!, 0.027, z!, w!, 0.012, 0.08, '#91b7b7');
  return meshes;
}
