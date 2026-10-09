import { craftDuration } from '@mmo/game-data';
import { useState } from 'react';
import type { QuestView } from '@mmo/schemas';
import { formatCurrency } from '@mmo/ui';
import { useGame } from './context';
import { Tabs, Window } from './Window';

/** "Grey Wolves slain 3 / 5" rows. */
function Objectives({ quest }: { quest: QuestView }) {
  return (
    <ul className="quest-objectives">
      {quest.objectives.map((o) => (
        <li key={o.id} className={o.done ? 'done' : ''} data-objective={o.id}>
          <span>{o.label}</span>
          <span className="count">
            {o.current} / {o.required}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Rewards({ quest }: { quest: QuestView }) {
  const { gameData } = useGame();
  const parts = [`${quest.rewards.xp} XP`];
  for (const c of quest.rewards.currency) {
    const def = gameData.currencies.get(c.currencyId);
    if (def) parts.push(formatCurrency(def, c.amount));
  }
  for (const i of quest.rewards.items) {
    const t = gameData.itemTemplates.get(i.itemTemplateId);
    parts.push(i.quantity > 1 ? `${t?.name ?? i.itemTemplateId} ×${i.quantity}` : (t?.name ?? ''));
  }
  return <p className="quest-rewards small">Rewards: {parts.join(' · ')}</p>;
}

function returnTo(quest: QuestView, npcName: (id: string) => string | undefined): string {
  return `Return to ${(quest.turnInNpcId && npcName(quest.turnInNpcId)) ?? 'the quest giver'}`;
}

/** NPC dialogue: greeting, then each quest line with the single action the server offered. */
export function DialoguePanel() {
  const { state, quests, gameData } = useGame();
  const [sellId, setSellId] = useState('');
  const d = state.dialogue;
  if (!d) return null;
  const vendor = gameData.raw.serviceOffers?.some((o) => o.npcId === d.npcId && o.kind === 'buy');
  const stock = state.items
    .inContainer('backpack')
    .filter((i) => !i.instance.flags.locked && i.template.vendorValue > 0);
  const selected = stock.find((i) => i.instance.id === sellId);
  const population = gameData.raw.worldCatalog?.populations.find((p) => p.id === d.npcId);
  const banker =
    gameData.raw.worldCatalog?.npcArchetypes.find((a) => a.id === population?.archetypeId)?.role ===
    'banker';
  return (
    <aside
      className="panel dialogue"
      data-testid="dialogue"
      aria-label={`${d.name} dialogue`}
      role="dialog"
    >
      <header className="dialogue-header">
        <div>
          <strong>{d.name}</strong>
          {d.title && <span className="muted small"> · {d.title}</span>}
        </div>
        <button
          className="icon-button"
          aria-label="Close dialogue"
          onClick={() => quests.closeDialogue()}
        >
          ×
        </button>
      </header>
      {banker && (
        <button
          data-testid="banker-vault"
          onClick={() => {
            quests.closeDialogue();
            state.toggle('bank', true);
          }}
        >
          Open vault
        </button>
      )}
      {vendor && (
        <section className="dialogue-quest">
          <label>
            Sell a carried item{' '}
            <select
              aria-label="Sell backpack item"
              style={{ display: 'block', width: '100%', maxWidth: '100%' }}
              value={selected?.instance.id ?? ''}
              onChange={(e) => setSellId(e.target.value)}
            >
              <option value="">Choose an item…</option>
              {stock.map((i) => (
                <option key={i.instance.id} value={i.instance.id}>
                  {i.template.name} ·{' '}
                  {gameData.rarities.get(i.instance.rarityId)?.name ?? i.instance.rarityId} ×
                  {i.instance.quantity} · {i.template.vendorValue * i.instance.quantity} copper
                </option>
              ))}
            </select>
          </label>
          <p className="small">
            Sells the selected whole stack at base vendor value. Equipped, vaulted and locked items
            are protected.
          </p>
          <button
            data-testid="vendor-sell"
            disabled={
              !selected ||
              state.connection !== 'open' ||
              state.vitals?.inCombat ||
              state.vitals?.dead
            }
            onClick={() => selected && quests.sell(selected.instance.id, selected.instance.version)}
          >
            Sell selected stack
            {selected
              ? ` · ${selected.template.vendorValue * selected.instance.quantity} copper`
              : ''}
          </button>
        </section>
      )}
      {d.quests.length === 0 && <p className="dialogue-line">“{d.greeting}”</p>}
      {[...d.quests]
        .sort((a, b) => {
          const rank = (e: typeof a) =>
            e.action === 'turn_in'
              ? 0
              : e.action === 'accept'
                ? 1
                : e.quest.state === 'completed'
                  ? 3
                  : 2;
          return rank(a) - rank(b);
        })
        .map(({ quest, line, action }) => (
          <section
            key={quest.questId}
            className="dialogue-quest"
            data-quest={quest.questId}
            data-state={quest.state}
          >
            <h3>{quest.name}</h3>
            <p className="dialogue-line">“{line}”</p>
            {action === 'accept' && <p className="small muted">{quest.description}</p>}
            {(quest.state === 'active' || quest.state === 'ready_to_turn_in') && (
              <Objectives quest={quest} />
            )}
            {quest.state !== 'completed' && <Rewards quest={quest} />}
            <div className="dialogue-actions">
              {action === 'accept' && (
                <button onClick={() => quests.accept(quest.questId)} data-testid="quest-accept">
                  Accept quest
                </button>
              )}
              {action === 'turn_in' && (
                <button onClick={() => quests.turnIn(quest.questId)} data-testid="quest-turn-in">
                  Complete quest
                </button>
              )}
            </div>
          </section>
        ))}
      {(gameData.raw.serviceOffers ?? [])
        .filter((o) => o.npcId === d.npcId)
        .map((o) => (
          <section key={o.id} className="dialogue-quest">
            <strong>{o.name}</strong>
            <p className="small">
              {o.inputs
                .map((i) => `${i.quantity} ${gameData.template(i.itemTemplateId).name}`)
                .join(' + ')}
              {o.copper < 0
                ? ` · ${-o.copper} copper`
                : o.copper > 0
                  ? ` → ${o.copper} copper`
                  : ''}
              {o.output ? ` → ${gameData.template(o.output.itemTemplateId).name}` : ''}
              {craftDuration(o) ? ` · ${craftDuration(o) / 1000}s · Fieldcraft +20 XP` : ''}
            </p>
            <button
              data-service={o.id}
              disabled={
                state.connection !== 'open' ||
                state.vitals?.dead ||
                state.vitals?.inCombat ||
                (o.kind === 'craft' && state.systems.jobs.some((j) => !j.completed))
              }
              onClick={() => quests.service(o.id)}
            >
              {o.kind === 'buy' ? 'Buy' : o.kind === 'sell' ? 'Sell one' : 'Craft'}
            </button>
          </section>
        ))}
      <div className="dialogue-actions">
        <button
          className="secondary"
          onClick={() => quests.closeDialogue()}
          data-testid="dialogue-close"
        >
          Goodbye
        </button>
      </div>
    </aside>
  );
}

/** Compact always-on tracker for quests in progress. */
export function QuestTracker() {
  const { state, gameData } = useGame();
  const allTracked = state.quests.filter(
    (q) => q.state === 'active' || q.state === 'ready_to_turn_in',
  );
  if (allTracked.length === 0) return null;
  const tracked = [...allTracked]
    .sort(
      (a, b) =>
        Number(b.questId === state.trackedQuestId) - Number(a.questId === state.trackedQuestId),
    )
    .slice(0, 3);
  return (
    <div className="panel quest-tracker" data-testid="quest-tracker" aria-label="Quest tracker">
      {allTracked.length > 3 && (
        <button className="secondary" onClick={() => state.toggle('quests', true)}>
          {allTracked.length} active quests · Open log
        </button>
      )}
      {tracked.map((q) => (
        <div key={q.questId} className="tracked" data-quest={q.questId} data-state={q.state}>
          <button
            className="tracked-title secondary"
            aria-label={`Track ${q.name}`}
            onClick={() => state.trackQuest(q.questId)}
          >
            {q.name}
          </button>
          {q.state === 'ready_to_turn_in' ? (
            <div className="ready" data-testid="quest-ready">
              {returnTo(q, (id) => gameData.npcs.get(id)?.name)}
            </div>
          ) : (
            <Objectives quest={q} />
          )}
        </div>
      ))}
    </div>
  );
}

/** Quest log window: active and completed quests with details, progress and rewards. */
export function QuestLogWindow() {
  const { state, gameData } = useGame();
  const [tab, setTab] = useState<'active' | 'completed'>('active');
  const list = state.quests.filter((q) =>
    tab === 'active'
      ? q.state === 'active' || q.state === 'ready_to_turn_in'
      : q.state === 'completed',
  );
  return (
    <Window id="quests" title="Quests">
      <Tabs
        value={tab}
        onChange={setTab}
        options={[
          { id: 'active', label: 'Active' },
          { id: 'completed', label: 'Completed' },
        ]}
      />
      {list.length === 0 && (
        <p className="muted small">
          {tab === 'active'
            ? 'No quests in progress. Talk to people in Greenvale.'
            : 'Nothing completed yet.'}
        </p>
      )}
      {list.map((q) => (
        <article
          key={q.questId}
          className="quest-entry"
          data-quest={q.questId}
          data-state={q.state}
        >
          <h3>{q.name}</h3>
          {q.state !== 'completed' && (
            <button
              className="secondary"
              onClick={() => state.trackQuest(q.questId)}
              data-testid="quest-track"
            >
              Track quest
            </button>
          )}
          <p className="small">{q.description}</p>
          {q.state !== 'completed' && <Objectives quest={q} />}
          {q.state === 'ready_to_turn_in' && (
            <p className="ready small">{returnTo(q, (id) => gameData.npcs.get(id)?.name)}</p>
          )}
          {q.state === 'completed' && (
            <p className="small muted">
              Completed {q.completedAt ? new Date(q.completedAt).toLocaleString() : ''}
            </p>
          )}
          <Rewards quest={q} />
        </article>
      ))}
    </Window>
  );
}
