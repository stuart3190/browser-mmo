import { useEffect, useRef, useSyncExternalStore } from 'react';
import { classAbilities } from '@mmo/game-data';
import { createRoot } from 'react-dom/client';
import type { WindowId } from '../state/game-state';
import { BankWindow } from './BankWindow';
import { DeathOverlay, PlayerFrame, TargetFrame } from './CombatHud';
import { CharacterWindow } from './CharacterWindow';
import { UiContext, useGame } from './context';
import type { UiDeps } from './context';
import { hoverTooltip } from './hover';
import { InventoryWindow } from './InventoryWindow';
import { ItemDetails } from './ItemDetails';
import { ItemTooltip } from './ItemTooltip';
import { AbilityBar } from './AbilityBar';
import { Minimap } from './Minimap';
import { DialoguePanel, QuestLogWindow, QuestTracker } from './QuestUI';
import { TouchControls, useTouchControls } from './TouchControls';

const SHORTCUTS: Record<string, WindowId> = {
  KeyB: 'inventory',
  KeyI: 'inventory',
  KeyC: 'character',
  KeyV: 'bank',
  KeyJ: 'quests',
  KeyL: 'quests',
};

export function mountGameUi(root: HTMLElement, deps: UiDeps): void {
  createRoot(root).render(
    <UiContext.Provider value={deps}>
      <GameUI />
    </UiContext.Provider>,
  );
}

function GameUI() {
  const { state, combat, gameData } = useGame();
  const touch = useTouchControls();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.repeat) return;
      if (e.code === 'Escape') {
        if (state.dialogue) {
          state.update((s) => (s.dialogue = null));
          return;
        }
        if (!state.selectedItemId && state.open.size === 0 && state.target.id) {
          combat.target(null);
          return;
        }
        state.update((s) => {
          if (s.selectedItemId) s.selectedItemId = null;
          else s.open = new Set();
        });
        return;
      }
      if (e.code === 'KeyF') {
        combat.toggleAttack();
        return;
      }
      const digit = /^Digit([1-9])$/.exec(e.code);
      if (digit) {
        const slot = classAbilities(gameData, state.character.classId)[Number(digit[1]) - 1];
        if (slot) combat.useAbility(slot.id);
        return;
      }
      const w = SHORTCUTS[e.code];
      if (w) state.toggle(w);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state, combat, gameData]);

  return (
    <div className={touch ? 'ui-root touch' : 'ui-root'}>
      <PlayerFrame />
      <TargetFrame />
      <Minimap />
      <QuestTracker />
      <ConnectionBanner />
      <DeathOverlay />
      {state.prompt && !state.dialogue && <div className="panel prompt">{state.prompt}</div>}
      <LogPanel />
      <Toasts />
      <div className="windows">
        <CharacterWindow />
        <InventoryWindow />
        <BankWindow />
        <QuestLogWindow />
      </div>
      <DialoguePanel />
      <ItemDetails />
      <HoverTooltip />
      {!touch && <AbilityBar />}
      {touch && <TouchControls />}
      <ActionBar />
    </div>
  );
}

function ConnectionBanner() {
  const { state } = useGame();
  if (
    state.connection === 'open' ||
    state.connection === 'idle' ||
    state.connection === 'connecting'
  )
    return null;
  const text =
    state.connection === 'reconnecting'
      ? 'Connection lost — reconnecting…'
      : 'Disconnected. Reload the page to log in again.';
  return (
    <div
      className={`panel banner ${state.connection}`}
      role="status"
      data-testid="connection-banner"
    >
      {text}
    </div>
  );
}

function LogPanel() {
  const { state } = useGame();
  const ref = useRef<HTMLDivElement>(null);
  const last = state.log.at(-1)?.id;
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [last]);
  return (
    <div className="panel log" data-testid="log" ref={ref}>
      {state.log.map((l) => (
        <div key={l.id} className={l.kind === 'error' ? 'error' : ''}>
          {new Date(l.at).toLocaleTimeString()} {l.text}
        </div>
      ))}
    </div>
  );
}

function Toasts() {
  const { state } = useGame();
  return (
    <div className="toasts" aria-live="polite">
      {state.toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`} data-testid="toast">
          {t.text}
        </div>
      ))}
    </div>
  );
}

function HoverTooltip() {
  const { state } = useGame();
  const id = useSyncExternalStore(hoverTooltip.subscribe, hoverTooltip.get);
  const item = id ? state.items.get(id) : undefined;
  if (!item || !hoverTooltip.anchor || state.selectedItemId === id) return null;
  const a = hoverTooltip.anchor;
  const left = a.right + 300 > window.innerWidth ? Math.max(8, a.left - 290) : a.right + 8;
  return (
    <div className="hover-tooltip" style={{ left, top: Math.min(a.top, window.innerHeight - 320) }}>
      <ItemTooltip item={item} />
    </div>
  );
}

function ActionBar() {
  const { state, combat } = useGame();
  const t = state.targetInfo();
  const btn = (id: WindowId, label: string, key: string) => (
    <button
      className={state.open.has(id) ? 'action active' : 'action'}
      onClick={() => state.toggle(id)}
      data-open={id}
      aria-pressed={state.open.has(id)}
    >
      {label}
      <kbd>{key}</kbd>
    </button>
  );
  return (
    <nav className="action-bar" aria-label="Game menus">
      {btn('character', 'Character', 'C')}
      {btn('inventory', 'Bag', 'B')}
      {btn('bank', 'Bank', 'V')}
      {btn('quests', 'Quests', 'J')}
      {t && t.kind === 'enemy' && !t.dead && (
        <button
          className={state.target.attacking ? 'action attack active' : 'action attack'}
          onClick={() => combat.toggleAttack()}
          data-testid="action-attack"
          aria-pressed={state.target.attacking}
        >
          {state.target.attacking ? 'Stop' : 'Attack'}
          <kbd>F</kbd>
        </button>
      )}
    </nav>
  );
}
