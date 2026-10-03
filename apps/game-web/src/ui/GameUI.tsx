import { useEffect, useRef, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import type { WindowId } from '../state/game-state';
import { BankWindow } from './BankWindow';
import { CharacterWindow } from './CharacterWindow';
import { UiContext, useGame } from './context';
import type { UiDeps } from './context';
import { hoverTooltip } from './hover';
import { InventoryWindow } from './InventoryWindow';
import { ItemDetails } from './ItemDetails';
import { ItemTooltip } from './ItemTooltip';

const SHORTCUTS: Record<string, WindowId> = {
  KeyB: 'inventory',
  KeyI: 'inventory',
  KeyC: 'character',
  KeyV: 'bank',
};

export function mountGameUi(root: HTMLElement, deps: UiDeps): void {
  createRoot(root).render(
    <UiContext.Provider value={deps}>
      <GameUI />
    </UiContext.Provider>,
  );
}

function GameUI() {
  const { state } = useGame();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.repeat) return;
      if (e.code === 'Escape') {
        state.update((s) => {
          if (s.selectedItemId) s.selectedItemId = null;
          else s.open = new Set();
        });
        return;
      }
      const w = SHORTCUTS[e.code];
      if (w) state.toggle(w);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state]);

  return (
    <div className="ui-root">
      <StatusPanel />
      <ConnectionBanner />
      {state.prompt && <div className="panel prompt">{state.prompt}</div>}
      <LogPanel />
      <Toasts />
      <div className="windows">
        <CharacterWindow />
        <InventoryWindow />
        <BankWindow />
      </div>
      <ItemDetails />
      <HoverTooltip />
      <ActionBar />
    </div>
  );
}

function StatusPanel() {
  const { state, gameData } = useGame();
  const c = state.character;
  return (
    <div className="panel status" data-testid="status">
      <strong>{c.name}</strong> · {gameData.characterClass(c.classId).name} {c.level} ·{' '}
      {state.zoneName}
      <div className="muted small">
        {state.renderer} · WASD move · drag look · E interact · B bag · C character · V bank
      </div>
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
  const { state } = useGame();
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
    </nav>
  );
}
