import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { AbilityBar } from './AbilityBar';
import { useTap } from './tap';
import { useGame } from './context';

/** Joystick travel in CSS px; the knob is clamped to this radius. */
const RADIUS = 48;
/** Ignore tiny thumb wobble around the centre. */
const DEADZONE = 0.15;

/**
 * True on touch-first devices, or as soon as the player touches the screen (tablets with mice,
 * desktop browsers in device emulation). Desktop with a mouse never shows the touch controls.
 */
export function useTouchControls(): boolean {
  const [touch, setTouch] = useState(
    () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches,
  );
  useEffect(() => {
    if (touch) return;
    const on = (e: PointerEvent) => {
      if (e.pointerType === 'touch') setTouch(true);
    };
    window.addEventListener('pointerdown', on, { capture: true });
    return () => window.removeEventListener('pointerdown', on, { capture: true });
  }, [touch]);
  return touch;
}

/**
 * On-screen controls for phones: a virtual joystick (left thumb) feeding the same analog input as
 * the keyboard, plus Attack / Interact / Next-target buttons (right thumb). Each control tracks its
 * own pointer id, so moving, rotating the camera (drag on the 3D view) and tapping targets or
 * buttons work simultaneously with multiple fingers.
 */
export function TouchControls() {
  const { state, combat, controls } = useGame();
  const t = state.targetInfo();
  const canAttack = t !== null && t.kind === 'enemy' && !t.dead;
  const dead = state.vitals?.dead ?? false;
  const interactLabel = state.prompt?.replace(/^Press E to /, '') ?? null;
  const interactTap = useTap(() => controls.interact());
  const targetTap = useTap(() => controls.targetNearest());
  const attackTap = useTap(() => combat.toggleAttack());
  return (
    <div className="touch-controls" data-testid="touch-controls">
      <Joystick disabled={dead} />
      <div className="touch-buttons">
        {interactLabel && !dead && (
          <button
            className="touch-btn interact"
            {...interactTap}
            data-testid="touch-interact"
            aria-label={interactLabel}
          >
            {interactLabel.includes('passage')
              ? 'Travel'
              : interactLabel.split(' ')[0] === 'talk'
                ? 'Talk'
                : 'Take'}
          </button>
        )}
        {!dead && (
          <button
            className="touch-btn next-target"
            {...targetTap}
            data-testid="touch-target"
            aria-label="Target nearest enemy"
          >
            ◎
          </button>
        )}
        {!dead && <AbilityBar touch />}
        {canAttack && !dead && (
          <button
            className={state.target.attacking ? 'touch-btn attack active' : 'touch-btn attack'}
            {...attackTap}
            data-testid="touch-attack"
            aria-pressed={state.target.attacking}
          >
            {state.target.attacking ? 'Stop' : 'Attack'}
          </button>
        )}
      </div>
    </div>
  );
}

function Joystick({ disabled }: { disabled: boolean }) {
  const { controls } = useGame();
  const base = useRef<HTMLDivElement>(null);
  const pointer = useRef<number | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });

  const release = () => {
    pointer.current = null;
    setKnob({ x: 0, y: 0 });
    controls.analog.clear();
  };
  useEffect(() => {
    if (disabled) release();
  }, [disabled]);
  useEffect(() => () => controls.analog.clear(), [controls]);

  const track = (e: ReactPointerEvent) => {
    const r = base.current!.getBoundingClientRect();
    let dx = e.clientX - (r.left + r.width / 2);
    let dy = e.clientY - (r.top + r.height / 2);
    const d = Math.hypot(dx, dy);
    if (d > RADIUS) {
      dx *= RADIUS / d;
      dy *= RADIUS / d;
    }
    setKnob({ x: dx, y: dy });
    const nx = dx / RADIUS;
    const ny = -dy / RADIUS; // screen up = forward
    if (Math.hypot(nx, ny) < DEADZONE) controls.analog.clear();
    else controls.analog.set(nx, ny);
  };

  return (
    <div
      ref={base}
      className={disabled ? 'joystick disabled' : 'joystick'}
      data-testid="joystick"
      aria-label="Movement joystick"
      role="application"
      onPointerDown={(e) => {
        if (disabled || pointer.current !== null) return;
        pointer.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        e.preventDefault();
        track(e);
      }}
      onPointerMove={(e) => {
        if (e.pointerId === pointer.current) track(e);
      }}
      onPointerUp={(e) => e.pointerId === pointer.current && release()}
      onPointerCancel={(e) => e.pointerId === pointer.current && release()}
      onLostPointerCapture={(e) => e.pointerId === pointer.current && release()}
    >
      <div className="joystick-knob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
    </div>
  );
}
