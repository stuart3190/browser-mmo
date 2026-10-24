import { useEffect, useState } from 'react';
import { remedyEffect } from '@mmo/game-data';
import { remedyStatus } from '../state/remedy-state';
import { useGame } from './context';
import { useTap } from './tap';

export function useRemedyStatus(itemId?: string) {
  const { state } = useGame();
  const [now, setNow] = useState(Date.now());
  const status = remedyStatus(state, Math.max(now, Date.now()), itemId);
  const ticking = status.remainingMs > 0;
  useEffect(() => {
    if (!ticking) return;
    const timer = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(timer);
  }, [ticking]);
  return status;
}
export function QuickRemedy() {
  const { quests } = useGame();
  const s = useRemedyStatus();
  const tap = useTap(() => quests.useRemedy());
  if (!s.count && !s.remainingMs) return null;
  const seconds = Math.ceil(s.remainingMs / 1000);
  return (
    <button
      className="quick-remedy"
      data-testid="quick-remedy"
      data-count={s.count}
      data-cooldown={seconds}
      disabled={s.reason !== null}
      {...tap}
      title={`${s.reason ?? `Restore up to ${remedyEffect.heal} health`} · H · ${s.count} carried`}
      aria-label={`Drink remedy, ${s.count} carried${seconds ? `, ready in ${seconds} seconds` : ''}`}
    >
      <span aria-hidden="true" className="remedy-glyph">
        ✚
      </span>
      <span>{seconds ? `${seconds}s` : 'Remedy'}</span>
      <span className="remedy-count">{s.count}</span>
      <kbd>H</kbd>
    </button>
  );
}
