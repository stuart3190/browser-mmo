import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AddressInfo } from 'node:net';
import { WebSocket } from 'ws';
import { and, eq, sql } from 'drizzle-orm';
import * as domain from '@mmo/domain';
import { loadDotEnv } from '@mmo/config';
import { createDb, schema } from '@mmo/db';
import {
  DevAuthProvider,
  SessionService,
  adminGrantItem,
  createCharacter,
  createDomainContext,
  createListing,
  getCharacterItems,
  moveItem,
} from '@mmo/domain';
import { DEMO_ZONE_ID, getGameData } from '@mmo/game-data';
import type { ServerMessage } from '@mmo/networking';
import { RealtimeClient, encodeClientMessage, parseServerMessage } from '@mmo/networking';
import type { Item } from '@mmo/schemas';
import { Metrics, createLogger } from '@mmo/server-kit';
import { DomainError, uuidv7 } from '@mmo/shared';
import { createRealtimeServer } from '../src/server';

loadDotEnv();
const TEST_URL = process.env.TEST_DATABASE_URL!;
const handle = createDb({ url: TEST_URL, max: 5 });
const ctx = createDomainContext({ db: handle.db, gameData: getGameData() });
const sessions = new SessionService(1);
const server = createRealtimeServer({
  ctx,
  sessions,
  logger: createLogger({ service: 'rt-sync-test', level: process.env.RT_LOG ?? 'silent' }),
  metrics: new Metrics(),
  zoneIds: [DEMO_ZONE_ID],
  tickHz: 20,
  allowedOrigins: ['http://localhost:5173'],
  changeFeedUrl: TEST_URL,
});
let url = '';
const ADMIN = { accountId: null, characterId: null };

beforeAll(async () => {
  await server.start('127.0.0.1', 0);
  url = `ws://127.0.0.1:${(server.http.address() as AddressInfo).port}/ws`;
});
afterAll(async () => {
  await server.stop();
  await handle.db.delete(schema.zoneCheckpoints);
  await handle.close();
});

class TestClient {
  readonly ws: WebSocket;
  messages: ServerMessage[] = [];
  private seq = 0;
  readonly opened: Promise<void>;
  constructor() {
    this.ws = new WebSocket(url, { origin: 'http://localhost:5173' });
    this.opened = new Promise((res, rej) => {
      this.ws.on('open', () => res());
      this.ws.on('error', rej);
    });
    this.ws.on('message', (d) => {
      const p = parseServerMessage(d.toString());
      if (p.ok) this.messages.push(p.message);
    });
  }
  send(t: Parameters<typeof encodeClientMessage>[0], d: unknown) {
    this.ws.send(encodeClientMessage(t, ++this.seq, d as never));
  }
  /** Waits for the first message (received after `since`) matching. */
  async waitFor<T extends ServerMessage['t']>(
    t: T,
    pred: (m: Extract<ServerMessage, { t: T }>) => boolean = () => true,
    since = 0,
    timeout = 4000,
  ) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const m = this.messages
        .slice(since)
        .find((x) => x.t === t && pred(x as Extract<ServerMessage, { t: T }>));
      if (m) return m as Extract<ServerMessage, { t: T }>;
      await new Promise((r) => setTimeout(r, 15));
    }
    throw new Error(
      `timed out waiting for ${t}; got ${this.messages
        .slice(since)
        .map((m) => m.t)
        .join(',')}`,
    );
  }
  mark() {
    return this.messages.length;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const name = (p: string) =>
  `${p}${uuidv7()
    .replace(/[^a-f]/g, '')
    .slice(0, 12)}`;

async function newAccount() {
  const { accountId } = await new DevAuthProvider(new Set()).authenticate(ctx, {
    username: `sy_${uuidv7().replace(/-/g, '').slice(-16)}`,
  });
  const { token } = await sessions.create(ctx, accountId, 'game_web');
  return { accountId, token };
}

async function join(token: string, characterId: string) {
  const c = new TestClient();
  try {
    await c.opened;
    c.send('auth.hello', { token, characterId, client: 'game_web' });
    await c.waitFor('auth.ok');
    await c.waitFor('character.stats');
    await c.waitFor('wallet.updated');
    return c;
  } catch (err) {
    c.ws.terminate();
    throw err;
  }
}

const grant = (characterId: string, templateId: string) =>
  adminGrantItem(ctx, { actor: ADMIN, characterId, templateId, quantity: 1, reason: 'test grant' });

const move = (
  accountId: string,
  characterId: string,
  item: Item,
  to: Parameters<typeof moveItem>[1]['request']['to'],
) =>
  moveItem(ctx, {
    accountId,
    characterId,
    request: { itemInstanceId: item.instance.id, expectedVersion: item.instance.version, to },
  });

async function containerId(accountId: string, characterId: string, kind: string) {
  const inv = await getCharacterItems(ctx.db, ctx, accountId, characterId);
  return inv.containers.find((c) => c.container.kind === kind)!.container.id;
}

describe('server-side item changes are pushed to connected clients', () => {
  it('pushes items created by another write path (admin grant) without any client action', async () => {
    const acc = await newAccount();
    const ch = await createCharacter(ctx, {
      accountId: acc.accountId,
      name: name('Sy'),
      classId: 'class.warrior',
    });
    const c = await join(acc.token, ch.id);
    const m0 = c.mark();
    const sword = await grant(ch.id, 'weapon.sword.iron_longsword');
    const upd = await c.waitFor(
      'inventory.updated',
      (m) => m.d.items.some((i) => i.instance.id === sword.instance.id),
      m0,
    );
    expect(upd.d.reason).toBe('sync');
    expect(
      upd.d.items.find((i) => i.instance.id === sword.instance.id)!.instance.location,
    ).toMatchObject({ kind: 'container', containerKind: 'backpack' });
    c.ws.close();
  });

  it('pushes equip/unequip with recomputed authoritative stats', async () => {
    const acc = await newAccount();
    const ch = await createCharacter(ctx, {
      accountId: acc.accountId,
      name: name('Eq'),
      classId: 'class.warrior',
    });
    const c = await join(acc.token, ch.id);
    const baseStr = (await c.waitFor('character.stats')).d.stats.total.strength!;
    const sword = await grant(ch.id, 'weapon.sword.iron_longsword');
    const swordStr = sword.instance.stats.strength!;
    expect(swordStr).toBeGreaterThan(0);

    let m0 = c.mark();
    const [equipped] = await move(acc.accountId, ch.id, sword, {
      kind: 'equipped',
      slotId: 'main_hand',
    });
    const upd = await c.waitFor(
      'inventory.updated',
      (m) => m.d.items.some((i) => i.instance.location.kind === 'equipped'),
      m0,
    );
    expect(upd.d.items[0]!.instance.location).toEqual({
      kind: 'equipped',
      characterId: ch.id,
      slotId: 'main_hand',
    });
    const stats = await c.waitFor(
      'character.stats',
      (m) => m.d.stats.total.strength === baseStr + swordStr,
      m0,
    );
    expect(stats.d.stats.fromEquipment.strength).toBe(swordStr);

    m0 = c.mark();
    await move(acc.accountId, ch.id, equipped!, {
      kind: 'container',
      containerId: await containerId(acc.accountId, ch.id, 'backpack'),
    });
    await c.waitFor(
      'inventory.updated',
      (m) => m.d.items.some((i) => i.instance.location.kind === 'container'),
      m0,
    );
    await c.waitFor(
      'character.stats',
      (m) => m.d.stats.total.strength === baseStr && m.d.stats.fromEquipment.strength === undefined,
      m0,
    );
    c.ws.close();
  });

  it('pushes vault deposit and retrieval', async () => {
    const acc = await newAccount();
    const ch = await createCharacter(ctx, {
      accountId: acc.accountId,
      name: name('Va'),
      classId: 'class.warrior',
    });
    const c = await join(acc.token, ch.id);
    const cloak = await grant(ch.id, 'accessory.cloak.wayfarer_cloak');
    let m0 = c.mark();
    const [stored] = await move(acc.accountId, ch.id, cloak, {
      kind: 'container',
      containerId: await containerId(acc.accountId, ch.id, 'character_vault'),
    });
    await c.waitFor(
      'inventory.updated',
      (m) =>
        m.d.items.some(
          (i) =>
            i.instance.location.kind === 'container' &&
            i.instance.location.containerKind === 'character_vault',
        ),
      m0,
    );
    m0 = c.mark();
    await move(acc.accountId, ch.id, stored!, {
      kind: 'container',
      containerId: await containerId(acc.accountId, ch.id, 'backpack'),
    });
    await c.waitFor(
      'inventory.updated',
      (m) =>
        m.d.items.some(
          (i) =>
            i.instance.location.kind === 'container' &&
            i.instance.location.containerKind === 'backpack',
        ),
      m0,
    );
    c.ws.close();
  });

  it('sends nothing for a rejected (invalid) equip and leaves the database unchanged', async () => {
    const acc = await newAccount();
    const ch = await createCharacter(ctx, {
      accountId: acc.accountId,
      name: name('Mg'),
      classId: 'class.mage',
    });
    const c = await join(acc.token, ch.id);
    const sword = await grant(ch.id, 'weapon.sword.iron_longsword');
    await c.waitFor('inventory.updated', (m) =>
      m.d.items.some((i) => i.instance.id === sword.instance.id),
    );
    const m0 = c.mark();
    await expect(
      move(acc.accountId, ch.id, sword, { kind: 'equipped', slotId: 'main_hand' }),
    ).rejects.toBeInstanceOf(DomainError);
    await sleep(300);
    expect(c.messages.slice(m0).filter((m) => m.t === 'inventory.updated')).toHaveLength(0);
    const [row] = await ctx.db
      .select()
      .from(schema.itemInstances)
      .where(eq(schema.itemInstances.id, sword.instance.id));
    expect(row).toMatchObject({ locationKind: 'container', version: sword.instance.version });
  });

  it('removes items that leave the view (marketplace escrow) and pushes wallet changes', async () => {
    const acc = await newAccount();
    const ch = await createCharacter(ctx, {
      accountId: acc.accountId,
      name: name('Mk'),
      classId: 'class.warrior',
    });
    const c = await join(acc.token, ch.id);
    const sword = await grant(ch.id, 'weapon.sword.iron_longsword');
    await c.waitFor('inventory.updated', (m) =>
      m.d.items.some((i) => i.instance.id === sword.instance.id),
    );
    const m0 = c.mark();
    await createListing(ctx, {
      actor: { accountId: acc.accountId, characterId: ch.id },
      itemInstanceId: sword.instance.id,
      price: 100,
      durationHours: 24,
    });
    const upd = await c.waitFor(
      'inventory.updated',
      (m) => m.d.removed.some((r) => r.id === sword.instance.id),
      m0,
    );
    expect(upd.d.removed.find((r) => r.id === sword.instance.id)!.version).toBe(
      sword.instance.version + 1,
    );
    const wallet = await c.waitFor('wallet.updated', () => true, m0);
    expect(wallet.d.balances.find((b) => b.currencyId === 'gold')!.amount).toBe(1000 - 10);
    c.ws.close();
  });

  it('keeps two characters of one account consistent through the shared vault', async () => {
    const acc = await newAccount();
    const a = await createCharacter(ctx, {
      accountId: acc.accountId,
      name: name('Aa'),
      classId: 'class.warrior',
    });
    const b = await createCharacter(ctx, {
      accountId: acc.accountId,
      name: name('Bb'),
      classId: 'class.warrior',
    });
    const ca = await join(acc.token, a.id);
    const cb = await join(acc.token, b.id);
    const ring = await grant(a.id, 'accessory.ring.copper_band');
    let ma = ca.mark();
    let mb = cb.mark();
    const [shared] = await move(acc.accountId, a.id, ring, {
      kind: 'container',
      containerId: await containerId(acc.accountId, a.id, 'account_vault'),
    });
    await ca.waitFor(
      'inventory.updated',
      (m) => m.d.items.some((i) => i.instance.id === ring.instance.id),
      ma,
    );
    await cb.waitFor(
      'inventory.updated',
      (m) => m.d.items.some((i) => i.instance.id === ring.instance.id),
      mb,
    );
    ma = ca.mark();
    mb = cb.mark();
    await move(acc.accountId, b.id, shared!, {
      kind: 'container',
      containerId: await containerId(acc.accountId, b.id, 'backpack'),
    });
    await ca.waitFor(
      'inventory.updated',
      (m) => m.d.removed.some((r) => r.id === ring.instance.id),
      ma,
    );
    await cb.waitFor(
      'inventory.updated',
      (m) =>
        m.d.items.some(
          (i) => i.instance.id === ring.instance.id && i.instance.location.kind === 'container',
        ),
      mb,
    );
    ca.ws.close();
    cb.ws.close();
  });

  it('resyncs every client from the database after the change-feed connection is lost', async () => {
    const acc = await newAccount();
    const ch = await createCharacter(ctx, {
      accountId: acc.accountId,
      name: name('Rs'),
      classId: 'class.warrior',
    });
    const c = await join(acc.token, ch.id);
    const m0 = c.mark();
    await ctx.db.execute(
      sql`select pg_terminate_backend(pid) from pg_stat_activity where application_name = 'mmo-change-feed' and datname = current_database()`,
    );
    // While the listener is down, a change happens that NOTIFY cannot deliver to us...
    const potion = await grant(ch.id, 'consumable.potion.minor_healing');
    // ...but the reconnect resync sends a full snapshot that contains it.
    const snap = await c.waitFor(
      'inventory.snapshot',
      (m) =>
        m.d.items.containers.some((x) => x.items.some((i) => i.instance.id === potion.instance.id)),
      m0,
      8000,
    );
    expect(snap).toBeDefined();
    c.ws.close();
  });
});

describe('reconnect', () => {
  it('RealtimeClient recovers from a dropped socket and receives fresh snapshots', async () => {
    const acc = await newAccount();
    const ch = await createCharacter(ctx, {
      accountId: acc.accountId,
      name: name('Rc'),
      classId: 'class.warrior',
    });
    const client = new RealtimeClient(url, {
      initialBackoffMs: 50,
      WebSocketImpl: globalThis.WebSocket,
    });
    const authOks: number[] = [];
    const snapshots: number[] = [];
    const statuses: string[] = [];
    client.on('auth.ok', () => authOks.push(Date.now()));
    client.on('inventory.snapshot', () => snapshots.push(Date.now()));
    client.onStatus((s) => statuses.push(s));
    await client.connect({ token: acc.token, characterId: ch.id, client: 'game_web' });
    while (snapshots.length < 1) await sleep(10);

    client.simulateDrop();
    const start = Date.now();
    while ((authOks.length < 2 || snapshots.length < 2) && Date.now() - start < 5000)
      await sleep(20);
    expect(authOks).toHaveLength(2);
    expect(snapshots.length).toBeGreaterThanOrEqual(2);
    expect(client.reconnects).toBe(1);
    expect(statuses).toEqual(['connecting', 'open', 'reconnecting', 'open']);
    await sleep(100);
    // Exactly one live session for the character on the server: no ghost player left behind.
    const live = await ctx.db
      .select()
      .from(schema.characters)
      .where(and(eq(schema.characters.id, ch.id)));
    expect(live).toHaveLength(1);
    expect(server.playerCount()).toBeGreaterThanOrEqual(1);

    // Items changed while connected again are still pushed after the reconnect.
    const seen: string[] = [];
    client.on('inventory.updated', (m) => m.d.items.forEach((i) => seen.push(i.instance.id)));
    const sword = await grant(ch.id, 'weapon.sword.iron_longsword');
    const t0 = Date.now();
    while (!seen.includes(sword.instance.id) && Date.now() - t0 < 4000) await sleep(20);
    expect(seen).toContain(sword.instance.id);
    client.close();
  });

  it('does not auto-reconnect after a deliberate server close (session replaced elsewhere)', async () => {
    const acc = await newAccount();
    const ch = await createCharacter(ctx, {
      accountId: acc.accountId,
      name: name('Rp'),
      classId: 'class.warrior',
    });
    const first = new RealtimeClient(url, {
      initialBackoffMs: 50,
      WebSocketImpl: globalThis.WebSocket,
    });
    const statuses: string[] = [];
    first.onStatus((s) => statuses.push(s));
    let admitted = false;
    first.on('character.progress', () => {
      admitted = true;
    });
    let second: TestClient | undefined;
    try {
      await first.connect({ token: acc.token, characterId: ch.id, client: 'game_web' });
      // connect() resolves at socket-open, not completed server admission. A fixed sleep
      // accidentally tests concurrent admission rather than deliberate session replacement.
      await vi.waitFor(() => expect(admitted).toBe(true), { timeout: 4000 });
      second = await join(acc.token, ch.id);
      await vi.waitFor(() => expect(statuses.at(-1)).toBe('closed'), { timeout: 4000 });
      await sleep(500); // observe beyond the configured reconnect backoff
      expect(first.reconnects).toBe(0);
    } finally {
      first.close();
      second?.ws.close();
    }
  });
});

it('repairs simulation gear as well as inventory after missed notifications', async () => {
  const acc = await newAccount();
  const ch = await createCharacter(ctx, {
    accountId: acc.accountId,
    name: name('Gear'),
    classId: 'class.warrior',
  });
  const c = await join(acc.token, ch.id);
  try {
    const mark = c.mark();
    await ctx.db.execute(
      sql`select pg_terminate_backend(pid) from pg_stat_activity where application_name = 'mmo-change-feed' and datname = current_database()`,
    );
    const sword = await grant(ch.id, 'weapon.sword.iron_longsword');
    await move(acc.accountId, ch.id, sword, { kind: 'equipped', slotId: 'main_hand' });
    await c.waitFor(
      'inventory.snapshot',
      (m) => m.d.items.equipment.slots['main_hand']?.instance.id === sword.instance.id,
      mark,
      8000,
    );
    const expected = await domain.getCombatProfile(ctx.db, ctx, ch.id);
    await vi.waitFor(() =>
      expect(server.zones.get(DEMO_ZONE_ID)!.getPlayer(ch.id)!.weapon).toEqual(expected.weapon),
    );
  } finally {
    c.ws.close();
  }
});

it('reconciles a failed fan-out query without needing another item event', async () => {
  const acc = await newAccount();
  const ch = await createCharacter(ctx, {
    accountId: acc.accountId,
    name: name('Retry'),
    classId: 'class.warrior',
  });
  const c = await join(acc.token, ch.id);
  const query = vi
    .spyOn(domain, 'getCharacterStats')
    .mockRejectedValueOnce(new Error('temporary query failure'));
  try {
    const mark = c.mark();
    const potion = await grant(ch.id, 'consumable.potion.minor_healing');
    await c.waitFor(
      'inventory.snapshot',
      (m) =>
        m.d.items.containers.some((bag) =>
          bag.items.some((i) => i.instance.id === potion.instance.id),
        ),
      mark,
      8000,
    );
    expect(query).toHaveBeenCalled();
  } finally {
    query.mockRestore();
    c.ws.close();
  }
});
