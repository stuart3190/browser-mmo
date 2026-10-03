import type { ReactNode } from 'react';
import type { WindowId } from '../state/game-state';
import { useGame } from './context';

/** Generic panel. Desktop: floating window. Narrow/touch screens: full-width bottom sheet (CSS). */
export function Window({
  id,
  title,
  children,
}: {
  id: WindowId;
  title: string;
  children: ReactNode;
}) {
  const { state } = useGame();
  if (!state.open.has(id)) return null;
  return (
    <section className={`window window-${id}`} role="dialog" aria-label={title} data-window={id}>
      <header className="window-header">
        <h2>{title}</h2>
        <button
          className="icon-button"
          aria-label={`Close ${title}`}
          onClick={() => state.toggle(id, false)}
        >
          ×
        </button>
      </header>
      <div className="window-body">{children}</div>
    </section>
  );
}

export function Tabs<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { id: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="tabs" role="tablist">
      {options.map((o) => (
        <button
          key={o.id}
          role="tab"
          aria-selected={o.id === value}
          className={o.id === value ? 'tab active' : 'tab'}
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
