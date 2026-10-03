import type { ClientKind } from '@mmo/schemas';
import { encodeClientMessage, parseServerMessage } from './codec';
import type {
  ClientMessageType,
  ClientPayload,
  ServerMessage,
  ServerMessageType,
} from './protocol';

type Handler<T extends ServerMessageType> = (msg: Extract<ServerMessage, { t: T }>) => void;

/**
 * Minimal typed realtime client for browser clients (game, later the companion app via a
 * WebSocket polyfill). Handles envelope encoding, sequence numbers and typed dispatch only —
 * reconnection policy belongs to the application.
 */
export class RealtimeClient {
  private ws: WebSocket | undefined;
  private seq = 0;
  private readonly handlers = new Map<string, Set<(msg: ServerMessage) => void>>();
  onClose: ((code: number, reason: string) => void) | undefined;

  constructor(private readonly url: string) {}

  connect(auth: { token: string; characterId: string; client: ClientKind }): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url);
      this.ws = ws;
      ws.onopen = () => {
        this.send('auth.hello', auth);
        resolve();
      };
      ws.onerror = () => reject(new Error('WebSocket connection failed'));
      ws.onclose = (ev) => this.onClose?.(ev.code, ev.reason);
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

  /** Sends an intent. Returns the seq so callers can match `ack` on replies. */
  send<T extends ClientMessageType>(t: T, d: ClientPayload<T>): number {
    const seq = ++this.seq;
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(encodeClientMessage(t, seq, d));
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

  close(): void {
    this.ws?.close(1000, 'client closing');
  }
}
