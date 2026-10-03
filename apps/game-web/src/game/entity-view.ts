import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { Scene } from '@babylonjs/core/scene';
import type { WorldEntity } from '@mmo/schemas';

interface View {
  entity: WorldEntity;
  mesh: Mesh;
  target: Vector3;
  targetRot: number;
}

/**
 * Renders replicated entities with placeholder geometry and smooths remote movement by
 * interpolating toward the latest server position.
 */
export class EntityViews {
  private readonly views = new Map<string, View>();

  constructor(
    private readonly scene: Scene,
    private readonly localEntityId: string,
  ) {}

  upsert(entity: WorldEntity): void {
    if (entity.id === this.localEntityId) return; // local player is rendered by PlayerController
    const existing = this.views.get(entity.id);
    if (existing) {
      existing.entity = entity;
      existing.target.set(entity.position.x, existing.target.y, entity.position.z);
      return;
    }
    const mesh = this.createMesh(entity);
    const y = mesh.position.y;
    mesh.position.set(entity.position.x, y, entity.position.z);
    mesh.rotation.y = entity.rotationY;
    this.views.set(entity.id, {
      entity,
      mesh,
      target: new Vector3(entity.position.x, y, entity.position.z),
      targetRot: entity.rotationY,
    });
  }

  move(entityId: string, x: number, _y: number, z: number, rotationY: number): void {
    const v = this.views.get(entityId);
    if (!v) return;
    v.target.set(x, v.target.y, z);
    v.targetRot = rotationY;
    v.entity.position = { x, y: 0, z };
  }

  remove(entityId: string): void {
    const v = this.views.get(entityId);
    if (!v) return;
    v.mesh.material?.dispose();
    v.mesh.dispose();
    this.views.delete(entityId);
  }

  update(dtSeconds: number): void {
    const k = Math.min(1, dtSeconds * 12);
    for (const v of this.views.values()) {
      Vector3.LerpToRef(v.mesh.position, v.target, k, v.mesh.position);
      v.mesh.rotation.y += (v.targetRot - v.mesh.rotation.y) * k;
      if (v.entity.kind === 'pickup') v.mesh.rotation.y += dtSeconds * 1.5;
    }
  }

  /** Nearest entity of a kind within range of a point (client-side hint only; server re-checks). */
  nearest(kind: WorldEntity['kind'], from: Vector3, range: number): WorldEntity | undefined {
    let best: { e: WorldEntity; d: number } | undefined;
    for (const v of this.views.values()) {
      if (v.entity.kind !== kind) continue;
      const d = Math.hypot(v.entity.position.x - from.x, v.entity.position.z - from.z);
      if (d <= range && (!best || d < best.d)) best = { e: v.entity, d };
    }
    return best?.e;
  }

  private createMesh(e: WorldEntity): Mesh {
    const mat = new StandardMaterial(`mat_${e.id}`, this.scene);
    let mesh: Mesh;
    if (e.kind === 'player') {
      mesh = MeshBuilder.CreateCapsule(e.id, { height: 1.8, radius: 0.4 }, this.scene);
      mesh.position.y = 0.9;
      mat.diffuseColor = new Color3(0.3, 0.5, 0.9);
    } else if (e.kind === 'npc') {
      mesh = MeshBuilder.CreateCylinder(e.id, { height: 1.9, diameter: 0.8 }, this.scene);
      mesh.position.y = 0.95;
      mat.diffuseColor = new Color3(0.9, 0.8, 0.2);
    } else if (e.kind === 'pickup') {
      mesh = MeshBuilder.CreateBox(e.id, { width: 0.6, height: 0.6, depth: 0.6 }, this.scene);
      mesh.position.y = 0.6;
      mat.diffuseColor = new Color3(0.95, 0.5, 0.1);
      mat.emissiveColor = new Color3(0.4, 0.2, 0.0);
    } else {
      mesh = MeshBuilder.CreateSphere(e.id, { diameter: 1 }, this.scene);
      mesh.position.y = 0.5;
      mat.diffuseColor = new Color3(0.8, 0.2, 0.2);
    }
    mesh.material = mat;
    return mesh;
  }
}
