import { Color3 } from '@babylonjs/core/Maths/math.color';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { Scene } from '@babylonjs/core/scene';

/** Small procedural rigs. Animation is presentation only; server events drive hits/death. */
export class ActorModel {
  readonly mesh: Mesh;
  private readonly shadow: Mesh;
  private readonly limbs: Mesh[] = [];
  private readonly materials: StandardMaterial[] = [];
  private weapon: Mesh | undefined;
  private phase = 0;
  private strike = 0;
  private dead = false;

  constructor(
    scene: Scene,
    id: string,
    readonly kind: 'hero' | 'wolf' | 'lantern' | 'warden',
    coat = '#426877',
  ) {
    const material = (hex: string) => {
      const m = new StandardMaterial(`${id}_${hex}`, scene);
      m.diffuseColor = Color3.FromHexString(hex);
      m.specularColor = Color3.Black();
      this.materials.push(m);
      return m;
    };
    this.shadow = MeshBuilder.CreateDisc(
      `${id}_shadow`,
      { radius: kind === 'wolf' ? 0.8 : 0.55, tessellation: 20 },
      scene,
    );
    this.shadow.rotation.x = Math.PI / 2;
    this.shadow.isPickable = false;
    const shade = material('#243c30');
    shade.alpha = 0.25;
    shade.disableLighting = true;
    this.shadow.material = shade;
    const main = material(kind === 'wolf' ? '#78838b' : coat);
    const dark = material(kind === 'wolf' ? '#394951' : '#333b41');
    const light = material(kind === 'wolf' ? '#c5c9bd' : '#d2b58a');
    this.mesh =
      kind === 'lantern'
        ? MeshBuilder.CreateIcoSphere(id, { radius: 0.65, subdivisions: 0 }, scene)
        : MeshBuilder.CreateBox(
            id,
            kind === 'wolf'
              ? { width: 0.65, height: 0.55, depth: 1.25 }
              : { width: 0.65, height: 0.7, depth: 0.38 },
            scene,
          );
    this.mesh.material = main;
    this.mesh.position.y = kind === 'wolf' ? 0.65 : 1.05;
    const part = (
      name: string,
      size: [number, number, number],
      pos: [number, number, number],
      mat = main,
    ) => {
      const m = MeshBuilder.CreateBox(
        `${id}_${name}`,
        { width: size[0], height: size[1], depth: size[2] },
        scene,
      );
      m.parent = this.mesh;
      m.position.set(...pos);
      m.material = mat;
      return m;
    };
    if (kind === 'warden') {
      main.diffuseColor = Color3.FromHexString('#758d8e');
      dark.diffuseColor = Color3.FromHexString('#435c63');
      light.diffuseColor = Color3.FromHexString('#56d5d6');
      light.emissiveColor = Color3.FromHexString('#257d87');
      this.mesh.scaling.x = 1.65;
      part('crest', [0.7, 0.6, 0.45], [0, 0.6, 0], dark);
      part('seal', [0.25, 0.3, 0.15], [0, 0, 0.27], light);
      for (const x of [-0.65, 0.65]) {
        this.limbs.push(part('stone_arm', [0.35, 0.9, 0.5], [x, -0.08, 0]));
        this.limbs.push(part('stone_foot', [0.35, 0.65, 0.5], [x * 0.5, -0.72, 0], dark));
      }
    } else if (kind === 'lantern') {
      main.diffuseColor = Color3.FromHexString('#9373bd');
      main.emissiveColor = Color3.FromHexString('#362047');
      for (const x of [-0.85, 0.85]) {
        const shard = part('ward_shard', [0.22, 1.3, 0.3], [x, 0, 0], dark);
        shard.rotation.z = x * 0.4;
        this.limbs.push(shard);
      }
      part('light', [0.32, 0.45, 0.18], [0, 0, 0.6], light);
    } else if (kind === 'wolf') {
      part('neck', [0.55, 0.62, 0.55], [0, 0.13, 0.55]);
      part('muzzle', [0.33, 0.24, 0.5], [0, 0.06, 0.95], light);
      part('nose', [0.27, 0.15, 0.12], [0, 0.09, 1.21], dark);
      for (const x of [-0.2, 0.2]) {
        const ear = part('ear', [0.16, 0.32, 0.18], [x, 0.53, 0.57], dark);
        ear.rotation.z = x;
        part('eye', [0.05, 0.07, 0.09], [x * 1.4, 0.22, 0.79], light);
        for (const z of [-0.4, 0.4])
          this.limbs.push(part('leg', [0.14, 0.54, 0.17], [x, -0.4, z], dark));
      }
      const tail = part('tail', [0.2, 0.2, 0.7], [0, 0, -0.9]);
      tail.rotation.x = -0.4;
    } else {
      part('head', [0.4, 0.43, 0.38], [0, 0.57, 0], light);
      part('hair', [0.44, 0.17, 0.42], [0, 0.8, -0.02], dark);
      part('belt', [0.68, 0.12, 0.42], [0, -0.29, 0], dark);
      part('buckle', [0.13, 0.1, 0.04], [0, -0.29, 0.23], light);
      for (const x of [-0.19, 0.19])
        this.limbs.push(part('boot', [0.25, 0.65, 0.3], [x, -0.72, 0], dark));
      for (const x of [-0.46, 0.46])
        this.limbs.push(part('arm', [0.22, 0.66, 0.25], [x, -0.04, 0]));
      part('scarf', [0.67, 0.17, 0.45], [0, 0.27, 0], light);
      this.weapon = MeshBuilder.CreateBox(
        `${id}_weapon`,
        { width: 0.11, height: 0.08, depth: 1 },
        scene,
      );
      this.weapon.parent = this.limbs[3]!;
      this.weapon.position.set(0, -0.25, 0.65);
      this.weapon.material = material('#c5d5d5');
      this.weapon.setEnabled(false);
    }
  }

  setArmed(armed: boolean): void {
    this.weapon?.setEnabled(armed);
  }

  attack(): void {
    this.strike = 0.3;
  }
  setDead(dead: boolean): void {
    this.dead = dead;
    this.mesh.rotation.z = dead ? Math.PI / 2 : 0;
  }
  update(dt: number, speed: number): void {
    this.shadow.position.set(this.mesh.position.x, 0.06, this.mesh.position.z);
    const step = Math.min(dt, 0.1);
    this.phase += step * (speed > 0.1 ? 11 : 2);
    this.strike = Math.max(0, this.strike - step);
    this.mesh.scaling.y = this.dead ? 1 : 1 + Math.sin(this.phase * 0.5) * 0.015;
    if (this.kind === 'lantern') {
      this.mesh.rotation.z = this.dead ? Math.PI / 2 : Math.sin(this.phase) * 0.12;
      this.limbs.forEach((limb, i) => {
        limb.rotation.y = this.dead ? 0 : this.phase * (i ? 0.3 : -0.3);
      });
      return;
    }
    this.limbs.forEach((limb, i) => {
      const walking = speed > 0.1 ? Math.sin(this.phase + (i % 2) * Math.PI) * 0.55 : 0;
      limb.rotation.x = this.dead
        ? 0
        : this.strike > 0 && i === 3
          ? -1.7 * Math.sin((this.strike / 0.3) * Math.PI)
          : walking;
    });
  }
  dispose(): void {
    this.shadow.dispose();
    this.mesh.dispose();
    this.materials.forEach((m) => m.dispose());
  }
}
