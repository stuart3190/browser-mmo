import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import { PLAYER_COLLISION_RADIUS } from '@mmo/game-data';
import type { CollisionWorld } from '@mmo/game-data';
import type { Vec3 } from '@mmo/schemas';
import type { AnalogInput } from './analog-input';
import { ActorModel } from './actor-model';

/**
 * Local player: WASD / on-screen joystick movement relative to the camera, third-person orbit
 * camera (drag to rotate, wheel/pinch to zoom). Movement is predicted locally with the SAME
 * collision world and slide rule the server uses, so walking into a tree or wall slides along it
 * instead of being corrected; the server still validates every move and may snap the player back.
 */
export class PlayerController {
  readonly mesh: Mesh;
  readonly camera: ArcRotateCamera;
  readonly actor: ActorModel;
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
    this.actor = new ActorModel(scene, 'local_player', 'hero', '#397a70');
    this.mesh = this.actor.mesh;
    this.mesh.position.set(start.x, 1.05, start.z);

    this.camera = new ArcRotateCamera(
      'camera',
      -Math.PI / 2,
      Math.PI / 3,
      21,
      this.mesh.position.clone(),
      scene,
    );
    this.camera.lowerRadiusLimit = 4;
    this.camera.upperRadiusLimit = 28;
    this.camera.lowerBetaLimit = 0.3;
    this.camera.panningSensibility = 0;
    this.camera.wheelPrecision = 30;
    this.camera.inertia = 0.65;
    this.camera.upperBetaLimit = Math.PI / 2.1;
    this.camera.attachControl(true);
    this.camera.keysUp = [];
    this.camera.keysDown = [];
    this.camera.keysLeft = [];
    this.camera.keysRight = [];

    window.addEventListener('keydown', (e) => {
      const target = e.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(target.tagName))
      )
        return;
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    canvas.focus();
  }

  get position(): Vector3 {
    return this.mesh.position;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.actor.setDead(!enabled);
    this.mesh.position.y = enabled ? 1.05 : 0.3;
    if (!enabled) {
      this.keys.clear();
      this.analog.clear();
    }
  }

  face(target: Vector3): void {
    if (this.keys.size || this.analog.x || this.analog.y) return;
    this.mesh.rotation.y = Math.atan2(
      target.x - this.mesh.position.x,
      target.z - this.mesh.position.z,
    );
  }

  /** Authoritative correction from the server. */
  correct(pos: Vec3, rotationY: number): void {
    this.mesh.position.set(pos.x, 1.05, pos.z);
    this.mesh.rotation.y = rotationY;
    this.lastSent = { x: pos.x, z: pos.z, r: rotationY };
  }

  update(dt: number): void {
    const oldX = this.mesh.position.x;
    const oldZ = this.mesh.position.z;
    if (
      document.activeElement instanceof HTMLElement &&
      /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)
    )
      this.keys.clear();
    let fx = 0;
    let fz = 0;
    if (!this.enabled) {
      this.actor.update(dt, 0);
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
    this.actor.update(
      dt,
      Math.hypot(this.mesh.position.x - oldX, this.mesh.position.z - oldZ) / Math.max(dt, 0.001),
    );
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
