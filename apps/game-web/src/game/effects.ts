import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { Scene } from '@babylonjs/core/scene';

/**
 * Placeholder ability effects (no final VFX): a glowing ball that flies from caster to target.
 * Purely cosmetic — damage was already decided by the server when this is drawn.
 */
export class Effects {
  private readonly flying: { mesh: Mesh; from: Vector3; to: Vector3; t: number }[] = [];
  private readonly materials = new Map<string, StandardMaterial>();

  constructor(private readonly scene: Scene) {}

  projectile(from: Vector3, to: Vector3, color: string): void {
    const mesh = MeshBuilder.CreateSphere(
      'projectile',
      { diameter: 0.45, segments: 6 },
      this.scene,
    );
    mesh.material = this.material(color);
    mesh.isPickable = false;
    const up = new Vector3(0, 0.6, 0);
    this.flying.push({ mesh, from: from.add(up), to: to.add(up), t: 0 });
    mesh.position.copyFrom(from.add(up));
  }

  update(dt: number): void {
    for (let i = this.flying.length - 1; i >= 0; i--) {
      const f = this.flying[i]!;
      f.t = Math.min(1, f.t + dt / 0.25);
      Vector3.LerpToRef(f.from, f.to, f.t, f.mesh.position);
      if (f.t >= 1) {
        f.mesh.dispose();
        this.flying.splice(i, 1);
      }
    }
  }

  private material(hex: string): StandardMaterial {
    let m = this.materials.get(hex);
    if (!m) {
      m = new StandardMaterial(`fx_${hex}`, this.scene);
      m.emissiveColor = Color3.FromHexString(hex);
      m.disableLighting = true;
      this.materials.set(hex, m);
    }
    return m;
  }
}
