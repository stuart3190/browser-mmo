import type { ClientKind } from '@mmo/schemas';
import { encodeClientMessage, parseServerMessage } from './codec';
import type {
  ClientMessageType,
  ClientPayload,
  ServerMessage,
  ServerMessageType,
} from './protocol';

type Handler<T extends ServerMessageType> = (msg: Extract<ServerMessage, { t: T }>) => void;

export type ConnectionStatus =
  | 'idle'
  | 'connecting' // first attempt
  | 'open' // socket open, auth.hello sent
  | 'reconnecting' // dropped; waiting for / performing a retry
  | 'closed'; // stopped for good (client closed, fatal server error, or retries exhausted)

/** Close codes >= 4000 are deliberate server decisions (bad token, replaced session...). Never auto-retry those. */
export const FATAL_CLOSE_CODE_MIN = 4000;

export interface RealtimeClientOptions {
  /** Retry dropped connections with exponential backoff. Default true. */
  autoReconnect?: boolean;
  initialBackoffMs?: number;
  maxBackoffMs?: number;
  /** Give up after this many consecutive failed attempts (default: never). */
  maxAttempts?: number;
  /** WebSocket constructor (defaults to the global one; inject for tests or React Native). */
  WebSocketImpl?: typeof WebSocket;
}

/**
 * Typed realtime client for every client app (browser game now, companion app later).
 *
 * - Envelope encoding, sequence numbers and typed dispatch.
 * - Automatic reconnect with exponential backoff for unexpected drops. Each (re)connect re-sends
 *   `auth.hello`; the server answers with fresh snapshots, so clients must treat every `auth.ok`
 *   as "rebuild your view from the following snapshots".
 * - Handlers survive reconnects.
 */
export class RealtimeClient {
  private ws: WebSocket | undefined;
  private seq = 0;
  private readonly handlers = new Map<string, Set<(msg: ServerMessage) => void>>();
  private readonly statusListeners = new Set<
    (s: ConnectionStatus, info: { attempt: number; code?: number; reason?: string }) => void
  >();
  private auth: { token: string; characterId: string; client: ClientKind } | undefined;
  private attempt = 0;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private manualClose = false;
  private readonly opts: Required<Omit<RealtimeClientOptions, 'maxAttempts' | 'WebSocketImpl'>> & {
    maxAttempts: number;
    WebSocketImpl: typeof WebSocket;
  };
  status: ConnectionStatus = 'idle';
  /** Number of successful reconnects (not counting the first connect). */
  reconnects = 0;

  constructor(
    private readonly url: string,
    options: RealtimeClientOptions = {},
  ) {
    this.opts = {
      autoReconnect: options.autoReconnect ?? true,
      initialBackoffMs: options.initialBackoffMs ?? 500,
      maxBackoffMs: options.maxBackoffMs ?? 10_000,
      maxAttempts: options.maxAttempts ?? Number.POSITIVE_INFINITY,
      WebSocketImpl: options.WebSocketImpl ?? globalThis.WebSocket,
    };
  }

  /** Opens the first connection. Resolves when the socket is open and auth.hello was sent. */
  connect(auth: { token: string; characterId: string; client: ClientKind }): Promise<void> {
    this.auth = auth;
    this.manualClose = false;
    this.setStatus('connecting');
    return this.open(false);
  }

  private open(isRetry: boolean): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new this.opts.WebSocketImpl(this.url);
      this.ws = ws;
      let opened = false;
      ws.onopen = () => {
        opened = true;
        this.seq = 0; // the server keeps one sequence guard per connection
        if (isRetry) this.reconnects++;
        this.attempt = 0;
        this.setStatus('open');
        this.send('auth.hello', this.auth!);
        resolve();
      };
      ws.onerror = () => {
        if (!opened && !isRetry) reject(new Error('WebSocket connection failed'));
      };
      ws.onclose = (ev) => {
        if (this.ws !== ws) return;
        this.ws = undefined;
        const fatal =
          ev.code >= FATAL_CLOSE_CODE_MIN || this.manualClose || !this.opts.autoReconnect;
        if (fatal) {
          this.setStatus('closed', { code: ev.code, reason: ev.reason });
          return;
        }
        if (!opened && !isRetry) return; // first connect failed: caller got the rejection
        this.scheduleRetry(ev.code, ev.reason);
      };
      ws.onmessage = (ev) => {
        if (typeof ev.data !== 'string') return;
        const parsed = parseServerMessage(ev.data);
        if (!parsed.ok) {
          console.warn('Dropping invalid server message', parsed.reason);
          return;
        }
        this.handlers.get(parsed.message.t)?.forEach((h) => h(parsed.message));
      };
    });
  }

  private scheduleRetry(code?: number, reason?: string): void {
    if (this.attempt >= this.opts.maxAttempts) {
      this.setStatus('closed', {
        ...(code !== undefined ? { code } : {}),
        reason: 'retries exhausted',
      });
      return;
    }
    const delay = Math.min(this.opts.maxBackoffMs, this.opts.initialBackoffMs * 2 ** this.attempt);
    this.attempt++;
    this.setStatus('reconnecting', {
      ...(code !== undefined ? { code } : {}),
      ...(reason ? { reason } : {}),
    });
    this.retryTimer = setTimeout(() => {
      if (this.manualClose) return;
      void this.open(true);
    }, delay);
  }

  /** Sends an intent. Returns the seq so callers can match `ack` on replies. Dropped while disconnected. */
  send<T extends ClientMessageType>(t: T, d: ClientPayload<T>): number {
    const seq = ++this.seq;
    if (this.ws?.readyState === this.opts.WebSocketImpl.OPEN)
      this.ws.send(encodeClientMessage(t, seq, d));
    return seq;
  }

  on<T extends ServerMessageType>(t: T, handler: Handler<T>): () => void {
    let set = this.handlers.get(t);
    if (!set) {
      set = new Set();
      this.handlers.set(t, set);
    }
    const h = handler as (msg: ServerMessage) => void;
    set.add(h);
    return () => set.delete(h);
  }

  onStatus(
    listener: (
      s: ConnectionStatus,
      info: { attempt: number; code?: number; reason?: string },
    ) => void,
  ): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  /** Test/debug hook: drop the socket as if the network failed (triggers auto-reconnect). */
  simulateDrop(): void {
    this.ws?.close(3000, 'simulated drop'); // 3000-3999: non-fatal application range
  }

  close(): void {
    this.manualClose = true;
    clearTimeout(this.retryTimer);
    this.ws?.close(1000, 'client closing');
    this.setStatus('closed');
  }

  private setStatus(s: ConnectionStatus, info: { code?: number; reason?: string } = {}): void {
    this.status = s;
    this.statusListeners.forEach((l) => l(s, { attempt: this.attempt, ...info }));
  }
}
