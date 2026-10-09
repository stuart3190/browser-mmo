import { useEffect, useState } from 'react';
import { professions, professionRank, professionRankNames } from '@mmo/game-data';
import { useGame } from './context';
import { Window } from './Window';
export function ProfessionWindow() {
  const { state, quests, gameData } = useGame();
  const [now, setNow] = useState(Date.now());
  const open = state.open.has('professions');
  useEffect(() => {
    if (!open) return;
    // Auth and gameplay commands push authoritative state. Only countdowns need a local tick;
    // database polling can overlap a mutation and produce a rate-limit toast.
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [open]);
  return (
    <Window id="professions" title="Field Skills & Broken Vault">
      {professions.map((p) => {
        const xp = state.systems.professions.find((r) => r.id === p.id)?.xp ?? 0,
          rank = professionRank(xp);
        return (
          <section className="dialogue-quest" key={p.id}>
            <strong>
              {p.name} · {professionRankNames[rank - 1]}
            </strong>
            <p>
              {xp} XP · {rank === 5 ? 'Master rank' : `${rank * 100 - xp} XP to next rank`}
            </p>
            <progress max={100} value={rank === 5 ? 100 : xp % 100} />
          </section>
        );
      })}
      <p className="small">
        Harvesting earns 10 XP. Backpack tools add yield and XP; fine tools require Apprentice rank.
        Stored or locked tools give no bonus. Crafting earns 20 XP when the result is delivered.
      </p>
      <h3>Crafts</h3>
      <p className="small">
        Start a recipe at the Roadhouse workshop. One craft at a time; your paid materials stay
        reserved across logout and restart. Results go to your bags or Recovered loot.
      </p>
      {state.systems.jobs.map((j) => (
        <section className="dialogue-quest" key={j.id}>
          <strong>{gameData.raw.serviceOffers?.find((o) => o.id === j.offerId)?.name}</strong>
          <p>
            {j.completed
              ? 'Delivered'
              : now < j.readyAtMs
                ? `Crafting · ${Math.ceil((j.readyAtMs - now) / 1000)}s remaining`
                : 'Ready to collect'}
          </p>
          {!j.completed && (
            <button
              data-craft-finish={j.id}
              disabled={now < j.readyAtMs}
              onClick={() => quests.finishCraft(j.id)}
            >
              Collect result
            </button>
          )}
        </section>
      ))}
      <h3>Broken Vault</h3>
      <p>
        Gather at the Broken Vault entrance. Level 4 required for every member. The leader reserves
        a run; each member enters separately. Membership stays fixed for two hours.
      </p>
      {state.systems.instance && (
        <p data-testid="instance-status">
          {state.systems.instance.status} · {state.systems.instance.kills}/
          {state.systems.instance.required} guardians cleared ·{' '}
          {Math.max(0, Math.ceil((state.systems.instance.expiresAtMs - now) / 60000))} minutes
          remaining
        </p>
      )}
      <p className="small">
        Defeat both stone guardians and the Bell Keeper. Completion awards each player who entered 4
        Iron Shards and 150 copper once. Normal enemy loot stays shared. Death: respawn at the
        threshold; cleared guardians stay cleared. Exit at the threshold, or while dead. Everyone
        must exit before the owner resets.
      </p>
      <div className="dialogue-actions">
        {state.systems.instance?.inside ? (
          <button data-dungeon="exit" onClick={() => quests.dungeon('exit')}>
            Exit at threshold
          </button>
        ) : (
          <button data-dungeon="enter" onClick={() => quests.dungeon('enter')}>
            {state.systems.instance ? 'Rejoin reserved run' : 'Enter solo / party run'}
          </button>
        )}
        {state.systems.instance?.owner && !state.systems.instance.inside && (
          <button data-dungeon="reset" onClick={() => quests.dungeon('reset')}>
            Reset empty run
          </button>
        )}
      </div>
    </Window>
  );
}
export function DungeonSummary() {
  const { state } = useGame();
  const instance = state.systems.instance;
  if (!instance?.inside) return null;
  return (
    <button
      className="panel dungeon-summary"
      onClick={() => state.toggle('professions')}
      data-testid="dungeon-summary"
    >
      Broken Vault ·{' '}
      {instance.status === 'completed'
        ? 'Complete — return to threshold'
        : `${instance.kills}/${instance.required} · clear guardians & Bell Keeper`}
    </button>
  );
}
