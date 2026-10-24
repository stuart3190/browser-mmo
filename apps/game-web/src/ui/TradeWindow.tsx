import { useEffect, useRef, useState } from 'react';
import { isCurrentlyTradeable } from '@mmo/game-data';
import type { DirectTrade, TradeAction } from '@mmo/schemas';
import { useGame } from './context';
import { ItemTooltip } from './ItemTooltip';
import { Wallet } from './InventoryWindow';
import { Window } from './Window';

export function TradeWindow() {
  const { state, api } = useGame();
  const open = state.open.has('trade');
  const [trades, setTrades] = useState<DirectTrade[]>([]);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const inFlight = useRef(false);
  const generation = useRef(0);
  const characterId = state.character.id;
  useEffect(() => {
    if (!open) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      const version = generation.current;
      if (!inFlight.current) {
        try {
          const result = await api.trades(characterId);
          if (!stopped && version === generation.current) setTrades(result.trades);
        } catch (e) {
          if (!stopped && version === generation.current)
            setError(e instanceof Error ? e.message : 'Cannot refresh trades');
        }
      }
      if (!stopped) timer = setTimeout(() => void refresh(), 2000);
    };
    void refresh();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [open, api, characterId]);
  const run = async (operation: () => Promise<{ trade: DirectTrade }>) => {
    if (inFlight.current) return;
    inFlight.current = true;
    generation.current++;
    setBusy(true);
    setError('');
    try {
      const { trade } = await operation();
      setTrades((previous) => [trade, ...previous.filter((t) => t.id !== trade.id)]);
      setSelected(trade.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Trade failed');
      try {
        setTrades((await api.trades(characterId)).trades);
      } catch {
        /* Keep the last reviewed offer visible. */
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  const trade =
    trades.find((t) => t.id === selected) ??
    trades.find((t) => ['open', 'locked'].includes(t.status)) ??
    trades[0];
  return (
    <Window id="trade" title="Player trading">
      <p className="muted small">
        Both players review, lock, then confirm. Offers expire after five minutes. Whole stacks are
        exchanged; items stay in your bags until completion.
      </p>
      <form
        className="trade-create"
        onSubmit={(e) => {
          e.preventDefault();
          void run(() => api.createTrade(characterId, name.trim(), crypto.randomUUID()));
        }}
      >
        <label>
          Character name
          <input
            aria-label="Trade with character"
            maxLength={24}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </label>
        <button disabled={busy || !name.trim()}>Invite to trade</button>
      </form>
      <Wallet />
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {trades.length === 0 && (
        <p>No trades yet. Enter a character name, or ask a friend to invite you and open Trade.</p>
      )}
      {trades.length > 1 && (
        <label>
          Recent trades
          <select
            aria-label="Recent trades"
            value={trade?.id ?? ''}
            onChange={(e) => setSelected(e.target.value)}
          >
            {trades.map((t) => (
              <option key={t.id} value={t.id}>
                {t.sides.find((s) => s.characterId !== characterId)?.name} — {t.status}
              </option>
            ))}
          </select>
        </label>
      )}
      {trade && (
        <TradeEditor
          key={`${trade.id}:${trade.revision}`}
          trade={trade}
          busy={busy}
          act={(action) => void run(() => api.tradeAction(characterId, trade.id, action))}
        />
      )}
    </Window>
  );
}

function TradeEditor({
  trade,
  busy,
  act,
}: {
  trade: DirectTrade;
  busy: boolean;
  act: (action: TradeAction) => void;
}) {
  const { state } = useGame();
  const mine = trade.sides.find((s) => s.characterId === state.character.id)!;
  const [selected, setSelected] = useState(mine.items.map((i) => i.instance.id));
  const [copper, setCopper] = useState(String(mine.copper));
  const [dirty, setDirty] = useState(false);
  const [editing, setEditing] = useState(false);
  const active = ['open', 'locked'].includes(trade.status);
  const available = state.items
    .all()
    .filter(
      (i) =>
        i.instance.location.kind === 'container' &&
        ['backpack', 'material_pouch'].includes(i.instance.location.containerKind) &&
        !i.instance.flags.locked &&
        isCurrentlyTradeable(i.template, i.instance.binding),
    );
  const amount = Number(copper);
  return (
    <div className="trade-editor">
      <p role="status" data-testid="trade-status">
        <strong>
          {trade.status === 'completed'
            ? 'Trade completed'
            : trade.status === 'locked'
              ? 'Both offers locked — review and confirm'
              : `Trade ${trade.status}`}
        </strong>{' '}
        · Revision {trade.revision}
      </p>
      <div className="trade-offers">
        {trade.sides.map((side) => (
          <section
            key={side.characterId}
            className="trade-offer"
            aria-label={`${side.name}'s offer`}
          >
            <h3>{side.characterId === state.character.id ? 'You' : side.name} offer</h3>
            <p>
              {side.copper} copper ·{' '}
              {side.accepted ? 'Confirmed' : side.locked ? 'Locked' : 'Editing'}
            </p>
            {!side.items.length && <p className="muted">No items</p>}
            {side.items.map((item) => (
              <details key={item.instance.id}>
                <summary>
                  {item.template.name} ×{item.instance.quantity}
                </summary>
                <ItemTooltip item={item} />
              </details>
            ))}
          </section>
        ))}
      </div>
      {active && (
        <>
          {mine.locked && (
            <button onClick={() => setEditing((value) => !value)}>
              {editing ? 'Hide editor' : 'Edit offer'}
            </button>
          )}
          {(!mine.locked || editing) && (
            <fieldset disabled={busy} className="trade-draft">
              <legend>Your offer</legend>
              <label>
                Copper
                <input
                  aria-label="Offer copper"
                  type="number"
                  min="0"
                  step="1"
                  value={copper}
                  onChange={(e) => {
                    setCopper(e.target.value);
                    setDirty(true);
                  }}
                />
              </label>
              <p className="muted small">
                Choose up to 12 unlocked, unbound stacks from your bags.
              </p>
              <div className="trade-items">
                {available.map((item) => (
                  <label key={item.instance.id}>
                    <input
                      type="checkbox"
                      aria-label={`Offer ${item.template.name}`}
                      checked={selected.includes(item.instance.id)}
                      disabled={!selected.includes(item.instance.id) && selected.length >= 12}
                      onChange={(e) => {
                        setDirty(true);
                        setSelected((ids) =>
                          e.target.checked
                            ? [...ids, item.instance.id]
                            : ids.filter((id) => id !== item.instance.id),
                        );
                      }}
                    />
                    {item.template.name} ×{item.instance.quantity}
                  </label>
                ))}
                {!available.length && <p>No tradeable items in your bags.</p>}
              </div>
              <button
                disabled={!Number.isSafeInteger(amount) || amount < 0}
                onClick={() =>
                  act({
                    action: 'offer',
                    revision: trade.revision,
                    offer: {
                      copper: amount,
                      items: selected.map((id) => {
                        const item =
                          state.items.get(id) ?? mine.items.find((i) => i.instance.id === id);
                        return { id, version: item?.instance.version ?? 0 };
                      }),
                    },
                  })
                }
              >
                Update offer
              </button>
            </fieldset>
          )}
          <p className="muted small">
            Changing either offer clears both players’ locks and confirmations. Review item details
            before confirming.
          </p>
          {dirty && <p role="status">Update your offer before locking or confirming.</p>}
          <div className="trade-buttons">
            <button
              disabled={busy || dirty || mine.locked}
              onClick={() => act({ action: 'lock', revision: trade.revision })}
            >
              Lock offer
            </button>
            <button
              disabled={busy || dirty || trade.status !== 'locked' || mine.accepted}
              onClick={() => act({ action: 'confirm', revision: trade.revision })}
            >
              Confirm exchange
            </button>
            <button
              disabled={busy}
              onClick={() => act({ action: 'cancel', revision: trade.revision })}
            >
              Cancel trade
            </button>
          </div>
        </>
      )}
    </div>
  );
}
