import { remedyEffect } from '@mmo/game-data';
import type { GameState } from './game-state';

/** Presentation and input guard only. Consumption, healing and cooldown remain server-owned. */
export function remedyStatus(
  state: Pick<
    GameState,
    'items' | 'systems' | 'vitals' | 'connection' | 'serverOffsetMs' | 'remedyPendingSeq'
  >,
  now = Date.now(),
  itemId?: string,
) {
  const carried = state.items
    .inContainer('backpack')
    .filter(
      (i) =>
        i.template.id === remedyEffect.templateId &&
        !i.instance.flags.locked &&
        i.instance.quantity > 0,
    );
  const item = itemId ? carried.find((i) => i.instance.id === itemId) : carried[0];
  const count = carried.reduce((n, i) => n + i.instance.quantity, 0);
  const ready = state.systems.remedyReadyAtMs;
  const remainingMs = Math.max(0, (ready ?? 0) - now - state.serverOffsetMs);
  const reason =
    state.connection !== 'open'
      ? 'Reconnecting'
      : state.remedyPendingSeq !== null
        ? 'Drinking…'
        : ready === undefined
          ? 'Checking remedy'
          : !item
            ? 'No carried remedy'
            : state.vitals?.dead
              ? 'Cannot drink while dead'
              : !state.vitals || state.vitals.health >= state.vitals.maxHealth
                ? 'Health is full'
                : remainingMs > 0
                  ? 'Remedy is cooling down'
                  : null;
  return { item, count, remainingMs, reason };
}
