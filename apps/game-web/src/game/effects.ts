import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { WorldEntity, CombatStatus } from '@mmo/schemas';
import type { Scene } from '@babylonjs/core/scene';

/**
 * Placeholder ability effects (no final VFX): a glowing ball that flies from caster to target.
 * Purely cosmetic — damage was already decided by the server when this is drawn.
 */
export class Effects {
  private readonly flying: { mesh: Mesh; from: Vector3; to: Vector3; t: number }[] = [];
  private readonly statuses = new Map<
    string,
    { entityId: string; status: CombatStatus; mesh: Mesh }
  >();
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

  /** Replicated statuses also arrive in reconnect/interest snapshots. Never infer gameplay effects. */
  setStatuses(entity: WorldEntity): void {
    const active = entity.dead ? [] : (entity.statuses ?? []);
    for (const [key, entry] of this.statuses)
      if (
        entry.entityId === entity.id &&
        !active.some(
          (s) => s.kind === entry.status.kind && s.expiresAtMs === entry.status.expiresAtMs,
        )
      ) {
        entry.mesh.material?.dispose();
        entry.mesh.dispose();
        this.statuses.delete(key);
      }
    for (const status of active) {
      const key = `${entity.id}:${status.kind}`;
      if (this.statuses.has(key)) continue;
      const mesh =
        status.kind === 'guard'
          ? MeshBuilder.CreateSphere(
              `guard_${entity.id}`,
              { diameter: 2.1, segments: 12 },
              this.scene,
            )
          : MeshBuilder.CreateTorus(
              `frost_${entity.id}`,
              { diameter: 1.6, thickness: 0.14, tessellation: 40 },
              this.scene,
            );
      const mat = new StandardMaterial(`status_${key}`, this.scene);
      mat.emissiveColor = Color3.FromHexString(status.kind === 'guard' ? '#e9be67' : '#83e6ff');
      mat.diffuseColor = mat.emissiveColor;
      mat.disableLighting = true;
      mat.alpha = status.kind === 'guard' ? 0.22 : 0.85;
      mat.backFaceCulling = false;
      mesh.material = mat;
      mesh.isPickable = false;
      mesh.position.set(entity.position.x, status.kind === 'guard' ? 1 : 0.12, entity.position.z);
      this.statuses.set(key, { entityId: entity.id, status, mesh });
    }
  }

  clearStatuses(entityId?: string): void {
    for (const [key, entry] of this.statuses) {
      if (entityId && entry.entityId !== entityId) continue;
      entry.mesh.material?.dispose();
      entry.mesh.dispose();
      this.statuses.delete(key);
    }
  }

  update(
    dt: number,
    nowMs: number = Date.now(),
    locate?: (id: string) => Vector3 | null | undefined,
  ): void {
    for (const [key, entry] of this.statuses) {
      const remaining = entry.status.expiresAtMs - nowMs;
      if (remaining <= 0) {
        entry.mesh.material?.dispose();
        entry.mesh.dispose();
        this.statuses.delete(key);
        continue;
      }
      const position = locate?.(entry.entityId);
      if (position && entry.status.kind !== 'frost_nova') {
        entry.mesh.position.x = position.x;
        entry.mesh.position.z = position.z;
      }
      if (entry.status.kind === 'frost_nova') {
        const progress = Math.max(0, 1 - remaining / 600);
        const scale = 1 + progress * ((entry.status.magnitude * 2) / 1.6 - 1);
        entry.mesh.scaling.set(scale, 1, scale);
        entry.mesh.visibility = 1 - progress;
      } else entry.mesh.visibility = Math.min(1, remaining / 250);
    }

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
