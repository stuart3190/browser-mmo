import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { Matrix } from '@babylonjs/core/Maths/math.vector';
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
  private ring: Mesh | undefined;
  private ringTarget: string | null = null;
  private readonly flashes = new Map<string, number>();
  private readonly baseEmissive = new Map<string, Color3>();

  constructor(
    private readonly scene: Scene,
    private localEntityId: string,
  ) {}

  /** Drops every remote entity (used after a reconnect, before the new zone snapshot). */
  reset(localEntityId: string): void {
    for (const id of [...this.views.keys()]) this.remove(id);
    this.localEntityId = localEntityId;
  }

  upsert(entity: WorldEntity): void {
    if (entity.id === this.localEntityId) return; // local player is rendered by PlayerController
    const existing = this.views.get(entity.id);
    if (existing) {
      if (existing.entity.dead !== entity.dead) this.setDead(entity.id, entity.dead ?? false);
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
    if (entity.dead) this.setDead(entity.id, true);
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
    for (const [id, left] of this.flashes) {
      if (left - dtSeconds > 0) {
        this.flashes.set(id, left - dtSeconds);
        continue;
      }
      this.flashes.delete(id);
      const mat = this.views.get(id)?.mesh.material as StandardMaterial | null | undefined;
      const base = this.baseEmissive.get(id);
      if (mat && base) mat.emissiveColor = base;
      this.baseEmissive.delete(id);
    }
    if (this.ring) {
      const t = this.ringTarget ? this.views.get(this.ringTarget) : undefined;
      this.ring.isVisible = t !== undefined;
      if (t) this.ring.position.set(t.mesh.position.x, 0.05, t.mesh.position.z);
    }
    for (const v of this.views.values()) {
      Vector3.LerpToRef(v.mesh.position, v.target, k, v.mesh.position);
      v.mesh.rotation.y += (v.targetRot - v.mesh.rotation.y) * k;
      if (v.entity.kind === 'pickup') v.mesh.rotation.y += dtSeconds * 1.5;
    }
  }

  /** Maps a picked mesh back to its entity (null for the local player, world props, ground). */
  /** Current (smoothed) positions of replicated entities, for the minimap. */
  markers(): { id: string; kind: WorldEntity['kind']; x: number; z: number; dead: boolean }[] {
    return [...this.views.values()].map((v) => ({
      id: v.entity.id,
      kind: v.entity.kind,
      x: v.mesh.position.x,
      z: v.mesh.position.z,
      dead: v.entity.dead ?? false,
    }));
  }

  entityIdOfMesh(mesh: AbstractMesh): string | null {
    return this.views.has(mesh.name) ? mesh.name : null;
  }

  /** Corpses lie on their side and turn grey. */
  setDead(entityId: string, dead: boolean): void {
    const v = this.views.get(entityId);
    if (!v) return;
    v.entity = { ...v.entity, dead };
    v.mesh.rotation.z = dead ? Math.PI / 2 : 0;
    const mat = v.mesh.material as StandardMaterial | null;
    if (mat && v.entity.kind === 'enemy')
      mat.diffuseColor = dead ? new Color3(0.25, 0.25, 0.25) : new Color3(0.55, 0.55, 0.6);
  }

  /** Selection ring under the current target. */
  setTarget(entityId: string | null): void {
    this.ringTarget = entityId;
    if (!this.ring) {
      this.ring = MeshBuilder.CreateTorus(
        'target_ring',
        { diameter: 1.8, thickness: 0.08, tessellation: 32 },
        this.scene,
      );
      const m = new StandardMaterial('target_ring_mat', this.scene);
      m.emissiveColor = new Color3(1, 0.3, 0.2);
      m.disableLighting = true;
      this.ring.material = m;
      this.ring.isPickable = false;
    }
    this.ring.isVisible = entityId !== null && this.views.has(entityId);
  }

  /** CSS-pixel screen coordinates of an entity (floating text, automation). */
  screenPosition(entityId: string, scene: Scene): { x: number; y: number } | null {
    const v = this.views.get(entityId);
    return v ? projectToScreen(scene, v.mesh.getAbsolutePosition()) : null;
  }

  /** Brief red flash when an entity is hit (driven by update(), no timers). */
  flash(entityId: string): void {
    const v = this.views.get(entityId);
    const mat = v?.mesh.material as StandardMaterial | null | undefined;
    if (!v || !mat) return;
    if (!this.flashes.has(entityId)) this.baseEmissive.set(entityId, mat.emissiveColor.clone());
    this.flashes.set(entityId, 0.15);
    mat.emissiveColor = new Color3(0.7, 0.12, 0.08);
  }

  /** Nearest entity of a kind within range of a point (client-side hint only; server re-checks). */
  nearest(
    kind: WorldEntity['kind'],
    from: Vector3,
    range: number,
    filter: (e: WorldEntity) => boolean = () => true,
  ): WorldEntity | undefined {
    let best: { e: WorldEntity; d: number } | undefined;
    for (const v of this.views.values()) {
      if (v.entity.kind !== kind || !filter(v.entity)) continue;
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
    } else if (e.kind === 'enemy') {
      // Placeholder wolf: a low, long box.
      mesh = MeshBuilder.CreateBox(e.id, { width: 0.7, height: 0.8, depth: 1.5 }, this.scene);
      mesh.position.y = 0.4;
      mat.diffuseColor = new Color3(0.55, 0.55, 0.6);
    } else {
      mesh = MeshBuilder.CreateSphere(e.id, { diameter: 1 }, this.scene);
      mesh.position.y = 0.5;
      mat.diffuseColor = new Color3(0.8, 0.2, 0.2);
    }
    mesh.material = mat;
    return mesh;
  }
}

/** Projects a world position to CSS-pixel page coordinates. */
export function projectToScreen(scene: Scene, world: Vector3): { x: number; y: number } | null {
  const engine = scene.getEngine();
  if (!scene.activeCamera) return null;
  const p = Vector3.Project(
    world,
    Matrix.Identity(),
    scene.getTransformMatrix(),
    scene.activeCamera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight()),
  );
  if (p.z < 0 || p.z > 1) return null; // behind the camera
  const scale = engine.getHardwareScalingLevel();
  const rect = engine.getRenderingCanvasClientRect();
  return { x: p.x * scale + (rect?.left ?? 0), y: p.y * scale + (rect?.top ?? 0) };
}
