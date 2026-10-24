import { useEffect, useState } from 'react';
import type { QuestView } from '@mmo/schemas';
import { questRepeatReadyAt, questRepeatWait } from '../state/quest-repeat';
import { useGame } from './context';

export function QuestRepeatStatus({ quest }: { quest: QuestView }) {
  const { gameData, state } = useGame();
  const def = gameData.quests.get(quest.questId);
  const [now, setNow] = useState(Date.now());
  const readyAt = def?.repeatable
    ? questRepeatReadyAt(quest.completedAt, def.repeatCooldownMs)
    : null;
  useEffect(() => {
    if (!readyAt) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, [readyAt]);
  if (!def?.repeatable) return null;
  return (
    <p
      className="small quest-repeat"
      data-testid="quest-repeat"
      data-ready-at={readyAt ?? undefined}
    >
      {readyAt ? (
        <>
          {questRepeatWait(readyAt, now + state.serverOffsetMs)}
          <br />
          <time dateTime={new Date(readyAt).toISOString()}>
            {new Date(readyAt).toLocaleString()}
          </time>
        </>
      ) : (
        `Repeatable · ${(def.repeatCooldownMs ?? 86400000) / 3600000} hours after completion`
      )}
    </p>
  );
}
