/**
 * Analog movement intent shared by the on-screen joystick (UI) and the player controller (3D).
 * x = right, y = forward (camera-relative), magnitude 0..1. Keyboard input is combined with it in
 * PlayerController, so touch and keys feed the same prediction + server-validated movement path.
 */
export class AnalogInput {
  x = 0;
  y = 0;

  set(x: number, y: number): void {
    const m = Math.hypot(x, y);
    const k = m > 1 ? 1 / m : 1;
    this.x = x * k;
    this.y = y * k;
  }

  clear(): void {
    this.x = 0;
    this.y = 0;
  }
}
