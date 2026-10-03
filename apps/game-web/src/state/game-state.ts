import type { ConnectionStatus } from '@mmo/networking';
import type { CharacterStats, CurrencyBalance, PlayerCharacter } from '@mmo/schemas';
import { ItemStore } from '@mmo/ui';

export type WindowId = 'inventory' | 'character' | 'bank';

export interface LogLine {
  id: number;
  at: number;
  text: string;
  kind: 'info' | 'error';
}

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'error';
}

/**
 * Client UI state. Fed only by server messages and HTTP responses; the 3D loop and React UI read
 * from it. `revision` changes on every mutation so React can subscribe cheaply.
 */
export class GameState {
  readonly items = new ItemStore();
  character: PlayerCharacter;
  stats: CharacterStats | null = null;
  /** Stats before the last change, used to highlight what moved. */
  previousStats: CharacterStats | null = null;
  balances: CurrencyBalance[] = [];
  connection: ConnectionStatus = 'idle';
  reconnects = 0;
  renderer = '';
  zoneName = '';
  prompt: string | null = null;
  log: LogLine[] = [];
  toasts: Toast[] = [];
  open = new Set<WindowId>();
  selectedItemId: string | null = null;
  /** Item IDs with a request in flight (UI disables their actions). */
  pending = new Set<string>();
  revision = 0;
  private nextId = 1;
  private readonly listeners = new Set<() => void>();

  constructor(character: PlayerCharacter) {
    this.character = character;
    this.items.subscribe(() => this.emit());
  }

  subscribe = (l: () => void): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  getRevision = (): number => this.revision;

  emit(): void {
    this.revision++;
    this.listeners.forEach((l) => l());
  }

  update(fn: (s: this) => void): void {
    fn(this);
    this.emit();
  }

  setStats(stats: CharacterStats): void {
    this.previousStats = this.stats;
    this.stats = stats;
    this.emit();
  }

  addLog(text: string, kind: LogLine['kind'] = 'info'): void {
    this.log = [...this.log.slice(-29), { id: this.nextId++, at: Date.now(), text, kind }];
    this.emit();
  }

  toast(text: string, kind: Toast['kind'] = 'info'): void {
    const t = { id: this.nextId++, text, kind };
    this.toasts = [...this.toasts.slice(-3), t];
    this.emit();
    setTimeout(() => this.update((s) => (s.toasts = s.toasts.filter((x) => x.id !== t.id))), 4000);
  }

  toggle(w: WindowId, force?: boolean): void {
    const on = force ?? !this.open.has(w);
    const next = new Set(this.open);
    if (on) next.add(w);
    else next.delete(w);
    this.open = next;
    this.emit();
  }
}
