import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { Scene } from '@babylonjs/core/scene';
import { PLAYER_COLLISION_RADIUS } from '@mmo/game-data';
import type { CollisionWorld } from '@mmo/game-data';
import type { Vec3 } from '@mmo/schemas';
import type { AnalogInput } from './analog-input';

/**
 * Local player: WASD / on-screen joystick movement relative to the camera, third-person orbit
 * camera (drag to rotate, wheel/pinch to zoom). Movement is predicted locally with the SAME
 * collision world and slide rule the server uses, so walking into a tree or wall slides along it
 * instead of being corrected; the server still validates every move and may snap the player back.
 */
export class PlayerController {
  readonly mesh: Mesh;
  readonly camera: ArcRotateCamera;
  private readonly keys = new Set<string>();
  private lastSent = { x: Number.NaN, z: Number.NaN, r: Number.NaN };
  private sinceSend = 0;
  /** False while dead: input is ignored (the server rejects movement anyway). */
  private enabled = true;

  constructor(
    scene: Scene,
    canvas: HTMLCanvasElement,
    start: Vec3,
    private readonly speed: number,
    private readonly sendMove: (pos: Vec3, rotationY: number) => void,
    private readonly collision: CollisionWorld,
    private readonly analog: AnalogInput,
  ) {
    this.mesh = MeshBuilder.CreateCapsule('local_player', { height: 1.8, radius: 0.4 }, scene);
    const mat = new StandardMaterial('local_player_mat', scene);
    mat.diffuseColor = new Color3(0.2, 0.8, 0.4);
    this.mesh.material = mat;
    this.mesh.position.set(start.x, 0.9, start.z);

    this.camera = new ArcRotateCamera(
      'camera',
      -Math.PI / 2,
      Math.PI / 3,
      14,
      this.mesh.position.clone(),
      scene,
    );
    this.camera.lowerRadiusLimit = 4;
    this.camera.upperRadiusLimit = 40;
    this.camera.upperBetaLimit = Math.PI / 2.1;
    this.camera.attachControl(true);
    this.camera.keysUp = [];
    this.camera.keysDown = [];
    this.camera.keysLeft = [];
    this.camera.keysRight = [];

    window.addEventListener('keydown', (e) => this.keys.add(e.code));
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    canvas.focus();
  }

  get position(): Vector3 {
    return this.mesh.position;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.keys.clear();
      this.analog.clear();
    }
  }

  /** Authoritative correction from the server. */
  correct(pos: Vec3, rotationY: number): void {
    this.mesh.position.set(pos.x, 0.9, pos.z);
    this.mesh.rotation.y = rotationY;
    this.lastSent = { x: pos.x, z: pos.z, r: rotationY };
  }

  update(dt: number): void {
    let fx = 0;
    let fz = 0;
    if (!this.enabled) {
      this.camera.target.copyFrom(this.mesh.position);
      return;
    }
    if (this.keys.has('KeyW')) fz += 1;
    if (this.keys.has('KeyS')) fz -= 1;
    if (this.keys.has('KeyA')) fx -= 1;
    if (this.keys.has('KeyD')) fx += 1;
    // Keys are digital (full speed); the joystick is analog (partial tilt = slower walk).
    let throttle = fx !== 0 || fz !== 0 ? 1 : 0;
    if (throttle === 0 && (this.analog.x !== 0 || this.analog.y !== 0)) {
      fx = this.analog.x;
      fz = this.analog.y;
      throttle = Math.min(1, Math.hypot(fx, fz));
    }
    if (throttle > 0) {
      // Camera-relative directions on the ground plane.
      const forward = this.camera.getTarget().subtract(this.camera.position);
      forward.y = 0;
      forward.normalize();
      const right = Vector3.Cross(Vector3.Up(), forward).normalize();
      const dir = forward.scale(fz).add(right.scale(fx)).normalize();
      // Clamp the frame step so a long frame (tab switch) cannot tunnel or trip the speed check.
      const step = this.speed * throttle * Math.min(dt, 0.1);
      const from = { x: this.mesh.position.x, z: this.mesh.position.z };
      const to = this.collision.slide(
        from,
        { x: from.x + dir.x * step, z: from.z + dir.z * step },
        PLAYER_COLLISION_RADIUS,
      );
      this.mesh.position.x = to.x;
      this.mesh.position.z = to.z;
      this.mesh.rotation.y = Math.atan2(dir.x, dir.z);
    }
    this.camera.target.copyFrom(this.mesh.position);

    // Send intent at most 10 times per second, only when something changed.
    this.sinceSend += dt;
    const p = this.mesh.position;
    const changed =
      p.x !== this.lastSent.x ||
      p.z !== this.lastSent.z ||
      this.mesh.rotation.y !== this.lastSent.r;
    if (changed && this.sinceSend >= 0.1) {
      this.sinceSend = 0;
      this.lastSent = { x: p.x, z: p.z, r: this.mesh.rotation.y };
      this.sendMove({ x: p.x, y: 0, z: p.z }, this.mesh.rotation.y);
    }
  }
}
