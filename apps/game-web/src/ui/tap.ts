import { useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

/**
 * Button handlers that fire on touch/pen `pointerdown` instead of `click`. While another finger is
 * on the joystick, browsers do not synthesize a click for a second finger's tap, so combat buttons
 * must react to the pointer itself (also lower latency). Mouse and keyboard keep using click; the
 * click that may follow a touch is ignored so one tap never acts twice.
 */
export function useTap(action: () => void) {
  const lastTouch = useRef(0);
  return {
    onPointerDown: (e: ReactPointerEvent) => {
      if (e.pointerType === 'mouse') return;
      e.preventDefault();
      lastTouch.current = Date.now();
      action();
    },
    onClick: () => {
      if (Date.now() - lastTouch.current < 700) return;
      action();
    },
  };
}
