import { availableQuestOffers, questGiverPlace } from '../state/quest-offers';
import { EquipmentPreview } from './EquipmentPreview';
import { ItemGlyph } from './ItemGlyph';
import { ServiceOffer } from './ServiceOffer';
import { SpecialisationChoices } from './SpecialisationChoices';
import { canRepairAt, repairCost } from '@mmo/game-data';
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
  return (
    <div className="quest-rewards">
      <p className="small">Rewards: {parts.join(' · ')}</p>
      {quest.rewards.items.map((i) => {
        const template = gameData.itemTemplates.get(i.itemTemplateId);
        if (!template) return null;
        return (
          <details className="reward-preview" key={i.itemTemplateId} data-reward={i.itemTemplateId}>
            <summary>
              <span className="reward-glyph">
                <ItemGlyph template={template} />
              </span>
              <span>
                {template.name}
                {i.quantity > 1 ? ` ×${i.quantity}` : ''}
                <small>View reward</small>
              </span>
            </summary>
            {template.description && <p className="small">{template.description}</p>}
            {template.equipment ? (
              <EquipmentPreview template={template} testPrefix="reward" />
            ) : (
              <p className="small muted">
                {template.binding === 'on_pickup'
                  ? 'Binds to your character when received.'
                  : 'Carried item.'}
              </p>
            )}
            {quest.state === 'completed' && (
              <p className="small muted">
                Current quest reward preview; previously earned items are unchanged.
              </p>
            )}
          </details>
        );
      })}
    </div>
  );
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
  const repairer = canRepairAt(gameData.raw.serviceOffers ?? [], d.npcId);
  const condition = [...state.items.equipped().values()]
    .filter((i) => !i.instance.flags.locked)
    .flatMap((i) => (i.instance.durability ? [i.instance.durability] : []));
  const quote = repairCost(condition);
  const copper = state.balances.find((b) => b.currencyId === 'gold')?.amount ?? 0;
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
      <SpecialisationChoices />
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
      {repairer && (
        <section className="dialogue-quest" data-testid="repair-service">
          <strong>Equipment repairs</strong>
          <p className="small">
            Restore the condition of all equipped gear. One copper repairs ten condition. Broken
            equipment regains its bonuses.
          </p>
          <button
            data-testid="repair-all"
            disabled={
              quote === 0 ||
              copper < quote ||
              state.connection !== 'open' ||
              state.vitals?.inCombat ||
              state.vitals?.dead
            }
            onClick={() => quests.repair(quote)}
          >
            {quote ? `Repair equipped gear · ${quote} copper` : 'Equipped gear is fully repaired'}
          </button>
          {copper < quote && <p className="small">You need {quote - copper} more copper.</p>}
        </section>
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
          <ServiceOffer key={o.id} offer={o} />
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
  const { state, gameData, controls } = useGame();
  const [tab, setTab] = useState<'active' | 'available' | 'completed'>('active');
  const zone = controls.zoneId() ?? state.character.zoneId;
  const offers = availableQuestOffers(
    gameData,
    state.quests,
    zone,
    controls.position() ?? { x: 0, z: 0 },
  );
  const list =
    tab === 'available'
      ? offers
      : state.quests.filter((q) =>
          tab === 'active'
            ? q.state === 'active' || q.state === 'ready_to_turn_in'
            : q.state === 'completed',
        );
  if (tab === 'completed')
    list.sort(
      (a, b) =>
        (b.completedAt ? Date.parse(b.completedAt) : 0) -
        (a.completedAt ? Date.parse(a.completedAt) : 0),
    );
  const guide = (id: string) => {
    state.trackQuest(id);
    state.toggle('quests', false);
  };
  return (
    <Window id="quests" title="Quests">
      <Tabs
        value={tab}
        onChange={setTab}
        options={[
          { id: 'active', label: 'Active' },
          { id: 'available', label: `Available (${offers.length})` },
          { id: 'completed', label: 'Completed' },
        ]}
      />
      {tab === 'available' && (
        <p className="small muted">
          People with work for you. Follow a guide to speak in person; continuing stories appear
          first.
        </p>
      )}
      {list.length === 0 && (
        <p className="small muted">
          {tab === 'active'
            ? offers.length
              ? 'No quests in progress. Choose an available adventure to find your next quest giver.'
              : 'No quests in progress. Explore the atlas, gather supplies, or revisit a dungeon with friends.'
            : tab === 'available'
              ? 'No new quests are available at your current level and story progress.'
              : 'Nothing completed yet.'}
        </p>
      )}
      {tab === 'active' && list.length === 0 && offers.length > 0 && (
        <button data-testid="quest-find-adventure" onClick={() => setTab('available')}>
          Find an adventure
        </button>
      )}
      {list.map((q, index) => {
        const place = questGiverPlace(gameData, q.giverNpcId);
        const giver = q.giverNpcId ? gameData.npcs.get(q.giverNpcId)?.name : undefined;
        const conclusion = gameData.quests.get(q.questId)?.dialogue?.readyToTurnIn;
        return (
          <article
            key={q.questId}
            className="quest-entry"
            data-quest={q.questId}
            data-state={q.state}
          >
            <h3>{q.name}</h3>
            {q.state === 'available' && (
              <>
                <p className="small" data-testid="quest-offer-place">
                  {index === 0 ? 'Suggested · ' : ''}
                  {giver ?? 'Quest giver'}
                  {place ? ` · ${gameData.zone(place.zoneId).name}` : ''}
                </p>
                <button data-testid="quest-guide-offer" onClick={() => guide(q.questId)}>
                  Guide to quest giver
                </button>
              </>
            )}
            {(q.state === 'active' || q.state === 'ready_to_turn_in') && (
              <button
                className="secondary"
                data-testid="quest-track"
                onClick={() => guide(q.questId)}
              >
                Track quest
              </button>
            )}
            <p className="small">{q.description}</p>
            {q.state !== 'completed' && q.state !== 'available' && <Objectives quest={q} />}
            {q.state === 'ready_to_turn_in' && (
              <p className="ready small">{returnTo(q, (id) => gameData.npcs.get(id)?.name)}</p>
            )}
            {q.state === 'completed' && (
              <>
                {conclusion && (
                  <blockquote className="quest-conclusion" data-testid="quest-conclusion">
                    {conclusion}
                  </blockquote>
                )}
                <p className="small muted">
                  Completed {q.completedAt ? new Date(q.completedAt).toLocaleString() : ''}
                </p>
              </>
            )}
            <Rewards quest={q} />
          </article>
        );
      })}
    </Window>
  );
}
