import pg from 'pg';
import { z } from 'zod';

/**
 * Change feed over PostgreSQL LISTEN/NOTIFY (ADR 0014).
 *
 * Triggers in migration 0001 publish `{k:'item', i, a, pa}` for every item_instances insert/update
 * and `{k:'wallet', a}` for every currency_balances insert/update on channel `mmo_changes`.
 * Delivery happens only on COMMIT. Payloads carry IDs only — consumers must re-read rows.
 *
 * NOTIFY is not durable: events emitted while a listener is disconnected are lost. Consumers get
 * `onResync()` after every (re)connect and must rebuild client state from the database then.
 */
export const CHANGE_CHANNEL = 'mmo_changes';

export const ChangeEventSchema = z.discriminatedUnion('k', [
  z.object({ k: z.literal('item'), i: z.uuid(), a: z.uuid(), pa: z.uuid().nullable() }),
  z.object({ k: z.literal('wallet'), a: z.uuid() }),
]);
export type ChangeEvent = z.infer<typeof ChangeEventSchema>;

export interface ChangeFeedOptions {
  url: string;
  onEvent: (event: ChangeEvent) => void;
  /** Called after every successful (re)connect, including the first. */
  onResync: () => void;
  onError?: (err: unknown) => void;
  maxBackoffMs?: number;
}

export class ChangeFeedListener {
  private client: pg.Client | undefined;
  private stopped = false;
  private attempt = 0;
  private retryTimer: NodeJS.Timeout | undefined;

  constructor(private readonly opts: ChangeFeedOptions) {}

  async start(): Promise<void> {
    this.stopped = false;
    await this.connect();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    clearTimeout(this.retryTimer);
    const c = this.client;
    this.client = undefined;
    await c?.end().catch(() => undefined);
  }

  /** True while a LISTEN connection is established. */
  get connected(): boolean {
    return this.client !== undefined;
  }

  private async connect(): Promise<void> {
    const client = new pg.Client({
      connectionString: this.opts.url,
      application_name: 'mmo-change-feed',
    });
    client.on('notification', (msg) => {
      if (msg.channel !== CHANGE_CHANNEL || !msg.payload) return;
      try {
        const parsed = ChangeEventSchema.safeParse(JSON.parse(msg.payload));
        if (parsed.success) this.opts.onEvent(parsed.data);
      } catch (err) {
        this.opts.onError?.(err);
      }
    });
    const onLost = (err?: unknown) => {
      if (this.client !== client) return;
      this.client = undefined;
      if (err) this.opts.onError?.(err);
      void client.end().catch(() => undefined);
      this.scheduleReconnect();
    };
    client.on('error', onLost);
    client.on('end', () => onLost());
    try {
      await client.connect();
      await client.query(`LISTEN ${CHANGE_CHANNEL}`);
    } catch (err) {
      this.opts.onError?.(err);
      await client.end().catch(() => undefined);
      this.scheduleReconnect();
      return;
    }
    if (this.stopped) {
      await client.end().catch(() => undefined);
      return;
    }
    this.client = client;
    this.attempt = 0;
    this.opts.onResync();
  }

  private scheduleReconnect(): void {
    if (this.stopped) return;
    const delay = Math.min(this.opts.maxBackoffMs ?? 10_000, 250 * 2 ** this.attempt++);
    this.retryTimer = setTimeout(() => void this.connect(), delay);
  }
}
