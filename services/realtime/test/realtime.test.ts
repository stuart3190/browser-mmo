import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AddressInfo } from 'node:net';
import { WebSocket } from 'ws';
import { eq } from 'drizzle-orm';
import * as domain from '@mmo/domain';
import { loadDotEnv } from '@mmo/config';
import { createDb, schema } from '@mmo/db';
import { DevAuthProvider, SessionService, createCharacter, createDomainContext } from '@mmo/domain';
import { DEMO_ZONE_ID, getGameData } from '@mmo/game-data';
import type { ServerMessage } from '@mmo/networking';
import { encodeClientMessage, parseServerMessage } from '@mmo/networking';
import { Metrics, createLogger } from '@mmo/server-kit';
import { uuidv7 } from '@mmo/shared';
import { createRealtimeServer } from '../src/server';

loadDotEnv();
const handle = createDb({ url: process.env.TEST_DATABASE_URL!, max: 5 });
const ctx = createDomainContext({ db: handle.db, gameData: getGameData() });
const sessions = new SessionService(1);
const server = createRealtimeServer({
  ctx,
  sessions,
  logger: createLogger({ service: 'rt-test', level: 'silent' }),
  metrics: new Metrics(),
  zoneIds: [DEMO_ZONE_ID],
  tickHz: 20,
  allowedOrigins: ['http://localhost:5173'],
  lingerMs: 100,
});
let url = '';

beforeAll(async () => {
  await server.start('127.0.0.1', 0);
  url = `ws://127.0.0.1:${(server.http.address() as AddressInfo).port}/ws`;
});
afterAll(async () => {
  await server.stop();
  await handle.close();
});

/** Test client that records every server message. */
class TestClient {
  readonly ws: WebSocket;
  readonly messages: ServerMessage[] = [];
  closed: { code: number } | null = null;
  private seq = 0;
  readonly opened: Promise<void>;
  constructor(origin = 'http://localhost:5173') {
    this.ws = new WebSocket(url, { origin });
    this.opened = new Promise((resolve, reject) => {
      this.ws.on('open', () => resolve());
      this.ws.on('error', reject);
    });
    this.ws.on('message', (data) => {
      const parsed = parseServerMessage(data.toString());
      if (parsed.ok) this.messages.push(parsed.message);
    });
    this.ws.on('close', (code) => (this.closed = { code }));
  }
  send(t: Parameters<typeof encodeClientMessage>[0], d: unknown, seq = ++this.seq): number {
    this.ws.send(encodeClientMessage(t, seq, d as never));
    return seq;
  }
  async waitFor<T extends ServerMessage['t']>(
    t: T,
    pred: (m: Extract<ServerMessage, { t: T }>) => boolean = () => true,
    timeout = 3000,
  ) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const m = this.messages.find((x) => x.t === t && pred(x as Extract<ServerMessage, { t: T }>));
      if (m) return m as Extract<ServerMessage, { t: T }>;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error(`timed out waiting for ${t}; got ${this.messages.map((m) => m.t).join(',')}`);
  }
}

async function newPlayer() {
  const { accountId } = await new DevAuthProvider(new Set()).authenticate(ctx, {
    username: `rt_${uuidv7().replace(/-/g, '').slice(-16)}`,
  });
  const name = `Rt${uuidv7()
    .replace(/[^a-f]/g, '')
    .slice(0, 12)}`;
  const character = await createCharacter(ctx, { accountId, name, classId: 'class.warrior' });
  const { token } = await sessions.create(ctx, accountId, 'game_web');
  return { accountId, character, token };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('realtime gateway', () => {
  it('runs the full pickup loop: browser intent -> server validation -> DB ownership -> inventory push', async () => {
    const p = await newPlayer();
    const c = new TestClient();
    await c.opened;
    const helloSeq = c.send('auth.hello', {
      token: p.token,
      characterId: p.character.id,
      client: 'game_web',
    });
    const ok = await c.waitFor('auth.ok');
    expect(ok.ack).toBe(helloSeq);
    await c.waitFor('inventory.snapshot');
    const snapshot = await c.waitFor('zone.snapshot');
    const sword = snapshot.d.entities.find(
      (e) => e.kind === 'pickup' && e.refId === 'weapon.sword.iron_longsword',
    )!;
    expect(sword).toBeDefined();

    // Too far away: the server refuses.
    const farSeq = c.send('interact.pickup', { entityId: sword.id });
    expect((await c.waitFor('error', (m) => m.ack === farSeq)).d.code).toBe('OUT_OF_RANGE');

    // Walk there at a legal speed (spawn (0,-8) -> sword (8,-14)).
    for (const [x, z] of [
      [2, -9.5],
      [4, -11],
      [6, -12.5],
      [7.5, -13.5],
    ] as const) {
      await sleep(400);
      c.send('move.input', { position: { x, y: 0, z }, rotationY: 0 });
    }
    await sleep(150);
    expect(c.messages.some((m) => m.t === 'move.correction')).toBe(false);

    const pickSeq = c.send('interact.pickup', { entityId: sword.id });
    const update = await c.waitFor('inventory.updated', (m) => m.ack === pickSeq);
    const item = update.d.items[0]!;
    expect(item.template.id).toBe('weapon.sword.iron_longsword');
    expect(item.instance.ownership.ownerCharacterId).toBe(p.character.id);
    await c.waitFor('entity.despawn', (m) => m.d.entityId === sword.id);

    // Ownership is in the database, not just in memory.
    const [row] = await handle.db
      .select()
      .from(schema.itemInstances)
      .where(eq(schema.itemInstances.id, item.instance.id));
    expect(row).toMatchObject({
      ownerCharacterId: p.character.id,
      locationKind: 'container',
      acquisitionMethod: 'world_pickup',
    });

    // Picking up the same entity again fails: it no longer exists.
    const againSeq = c.send('interact.pickup', { entityId: sword.id });
    expect((await c.waitFor('error', (m) => m.ack === againSeq)).d.code).toBe('NOT_FOUND');
    c.ws.close();
  });

  it('corrects teleport attempts and rejects replayed sequence numbers', async () => {
    const p = await newPlayer();
    const c = new TestClient();
    await c.opened;
    c.send('auth.hello', { token: p.token, characterId: p.character.id, client: 'game_web' });
    await c.waitFor('auth.ok');
    c.send('move.input', { position: { x: 60, y: 0, z: 60 }, rotationY: 0 });
    expect((await c.waitFor('move.correction')).d.reason).toBe('too_fast');
    c.send('ping', { clientTime: 1 }, 1); // seq 1 was used by auth.hello
    expect((await c.waitFor('error', (m) => m.d.code === 'CONFLICT')).d.message).toMatch(
      /sequence/,
    );
    c.ws.close();
  });

  it('broadcasts other players spawning and moving', async () => {
    const a = await newPlayer();
    const b = await newPlayer();
    const ca = new TestClient();
    const cb = new TestClient();
    await Promise.all([ca.opened, cb.opened]);
    ca.send('auth.hello', { token: a.token, characterId: a.character.id, client: 'game_web' });
    await ca.waitFor('auth.ok');
    cb.send('auth.hello', { token: b.token, characterId: b.character.id, client: 'game_web' });
    const bOk = await cb.waitFor('auth.ok');
    await ca.waitFor('entity.spawn', (m) => m.d.entity.characterId === b.character.id);
    await ca.waitFor(
      'presence.update',
      (m) => m.d.characterId === b.character.id && m.d.event === 'joined',
    );
    await sleep(200);
    cb.send('move.input', { position: { x: 1, y: 0, z: -8 }, rotationY: 0.5 });
    await ca.waitFor('world.moves', (m) => m.d.moves.some(([id]) => id === bOk.d.entityId));
    cb.send('chat.send', { channel: 'zone', text: 'hello greenvale' });
    expect((await ca.waitFor('chat.message')).d.text).toBe('hello greenvale');
    cb.ws.close();
    await ca.waitFor('entity.despawn', (m) => m.d.entityId === bOk.d.entityId);
    ca.ws.close();
  });

  it('closes unauthenticated, forged and cross-origin connections', async () => {
    const forged = new TestClient();
    await forged.opened;
    forged.send('auth.hello', { token: 'f'.repeat(43), characterId: uuidv7(), client: 'game_web' });
    await forged.waitFor('error', (m) => m.d.code === 'UNAUTHENTICATED');
    await sleep(100);
    expect(forged.closed).not.toBeNull();

    const early = new TestClient();
    await early.opened;
    early.send('ping', { clientTime: 1 });
    await early.waitFor('error', (m) => m.d.code === 'UNAUTHENTICATED');

    // Someone else's character with a valid token.
    const a = await newPlayer();
    const b = await newPlayer();
    const thief = new TestClient();
    await thief.opened;
    thief.send('auth.hello', { token: a.token, characterId: b.character.id, client: 'game_web' });
    await thief.waitFor('error', (m) => m.d.code === 'FORBIDDEN');

    const evil = new TestClient('https://evil.example');
    await expect(evil.opened).rejects.toThrow();
  });
});

describe('pre-alpha connection hardening', () => {
  it('admits at most one controller during simultaneous logins', async () => {
    const p = await newPlayer();
    const a = new TestClient();
    const b = new TestClient();
    try {
      await Promise.all([a.opened, b.opened]);
      for (const c of [a, b])
        c.send('auth.hello', { token: p.token, characterId: p.character.id, client: 'game_web' });
      await vi.waitFor(() =>
        expect([a, b].filter((c) => c.messages.some((m) => m.t === 'auth.ok'))).toHaveLength(1),
      );
      await vi.waitFor(() => expect([a, b].filter((c) => c.closed)).toHaveLength(1));
      const live = [a, b].find((c) => !c.closed)!;
      const seq = live.send('ping', { clientTime: 123 });
      expect((await live.waitFor('pong', (m) => m.ack === seq)).d.clientTime).toBe(123);
    } finally {
      a.ws.close();
      b.ws.close();
    }
  });
  it.each(['logout', 'ban', 'expiry'] as const)(
    'disconnects an idle socket after %s',
    async (kind) => {
      const p = await newPlayer();
      const c = new TestClient();
      try {
        await c.opened;
        c.send('auth.hello', { token: p.token, characterId: p.character.id, client: 'game_web' });
        await c.waitFor('auth.ok');
        if (kind === 'ban')
          await ctx.db
            .update(schema.accounts)
            .set({ status: 'banned' })
            .where(eq(schema.accounts.id, p.accountId));
        else {
          const resolved = (await sessions.resolve(ctx, p.token))!;
          if (kind === 'logout') await sessions.revoke(ctx, resolved.sessionId);
          else
            await ctx.db
              .update(schema.sessions)
              .set({ expiresAt: new Date(0) })
              .where(eq(schema.sessions.id, resolved.sessionId));
        }
        await vi.waitFor(() => expect(c.closed).not.toBeNull(), { timeout: 3000 });
      } finally {
        c.ws.close();
      }
    },
  );
  it('rejects overlapping database actions instead of accumulating promises', async () => {
    const p = await newPlayer();
    const c = new TestClient();
    try {
      await c.opened;
      c.send('auth.hello', { token: p.token, characterId: p.character.id, client: 'game_web' });
      await c.waitFor('zone.snapshot');
      const snap = c.messages.find((m) => m.t === 'zone.snapshot');
      if (snap?.t !== 'zone.snapshot') throw new Error('snapshot absent');
      const npc = snap.d.entities.find((e) => e.kind === 'npc')!;
      for (let i = 0; i < 20; i++) c.send('npc.interact', { entityId: npc.id });
      expect((await c.waitFor('error', (m) => m.d.code === 'RATE_LIMITED')).d.code).toBe(
        'RATE_LIMITED',
      );
    } finally {
      c.ws.close();
    }
  });
});

it('waits for a blocked departure write before restoring position, health and cooldowns', async () => {
  const p = await newPlayer();
  const until = Date.now() + 60_000;
  await ctx.db
    .update(schema.characters)
    .set({ currentHealth: 73, abilityCooldowns: { 'ability.warrior.heavy_strike': until } })
    .where(eq(schema.characters.id, p.character.id));
  const a = new TestClient();
  const b = new TestClient();
  let release!: () => void;
  let locked!: () => void;
  const lockReady = new Promise<void>((r) => {
    locked = r;
  });
  let transaction: Promise<void> | undefined;
  try {
    await Promise.all([a.opened, b.opened]);
    a.send('auth.hello', { token: p.token, characterId: p.character.id, client: 'game_web' });
    await a.waitFor('zone.snapshot');
    const zone = server.zones.get(DEMO_ZONE_ID)!;
    const pos = zone.getPlayer(p.character.id)!.position;
    const next = { ...pos, x: pos.x + 0.5 };
    a.send('move.input', { position: next, rotationY: 0.3 });
    await vi.waitFor(() => expect(zone.getPlayer(p.character.id)!.position).toEqual(next));
    const removed = vi.spyOn(zone, 'removePlayer');
    transaction = ctx.db.transaction(async (tx) => {
      await tx
        .select()
        .from(schema.characters)
        .where(eq(schema.characters.id, p.character.id))
        .for('update');
      locked();
      await new Promise<void>((r) => {
        release = r;
      });
    });
    await lockReady;
    a.ws.close();
    await vi.waitFor(() => expect(zone.getPlayer(p.character.id)).toBeUndefined());
    const expected = removed.mock.results.find((r) => r.type === 'return' && r.value)?.value;
    removed.mockRestore();
    expect(expected).toBeDefined();
    b.send('auth.hello', { token: p.token, characterId: p.character.id, client: 'game_web' });
    await sleep(150);
    expect(b.messages.some((m) => m.t === 'auth.ok')).toBe(false);
    release();
    await transaction;
    await b.waitFor('zone.snapshot');
    expect(zone.persistentState(p.character.id)).toMatchObject(expected);
  } finally {
    release?.();
    await transaction;
    a.ws.close();
    b.ws.close();
  }
});

it('terminates a connection before an outbound frame exceeds its configured queue budget', async () => {
  const bounded = createRealtimeServer({
    ctx,
    sessions,
    logger: createLogger({ service: 'slow-test', level: 'silent' }),
    metrics: new Metrics(),
    zoneIds: [DEMO_ZONE_ID],
    tickHz: 20,
    allowedOrigins: ['http://localhost:5173'],
    maxBufferedBytes: 64,
    lingerMs: 0,
  });
  await bounded.start('127.0.0.1', 0);
  const p = await newPlayer();
  const socket = new WebSocket(
    `ws://127.0.0.1:${(bounded.http.address() as AddressInfo).port}/ws`,
    { origin: 'http://localhost:5173' },
  );
  try {
    await new Promise<void>((resolve) => socket.once('open', resolve));
    const closed = new Promise<number>((resolve) => socket.once('close', resolve));
    socket.send(
      encodeClientMessage('auth.hello', 1, {
        token: p.token,
        characterId: p.character.id,
        client: 'game_web',
      }),
    );
    expect(await closed).toBe(1006);
  } finally {
    socket.terminate();
    await bounded.stop();
  }
});

it('retains a failed departure snapshot and retries it before re-entry', async () => {
  const p = await newPlayer();
  const a = new TestClient();
  const b = new TestClient();
  let save: ReturnType<typeof vi.spyOn> | undefined;
  try {
    await Promise.all([a.opened, b.opened]);
    a.send('auth.hello', { token: p.token, characterId: p.character.id, client: 'game_web' });
    await a.waitFor('zone.snapshot');
    const zone = server.zones.get(DEMO_ZONE_ID)!;
    const pos = zone.getPlayer(p.character.id)!.position;
    const next = { ...pos, x: pos.x + 0.5 };
    a.send('move.input', { position: next, rotationY: 0.7 });
    await vi.waitFor(() => expect(zone.getPlayer(p.character.id)!.position).toEqual(next));
    save = vi
      .spyOn(domain, 'saveCharacterState')
      .mockRejectedValueOnce(new Error('temporary write failure'));
    a.ws.close();
    await vi.waitFor(() => expect(save).toHaveBeenCalled());
    b.send('auth.hello', { token: p.token, characterId: p.character.id, client: 'game_web' });
    const ok = await b.waitFor('auth.ok');
    expect(ok.d.character.position).toEqual(next);
    expect(save).toHaveBeenCalledTimes(2);
  } finally {
    save?.mockRestore();
    a.ws.close();
    b.ws.close();
  }
});

it('fails closed when live-session revalidation cannot query the database', async () => {
  const p = await newPlayer();
  const c = new TestClient();
  let resolve: ReturnType<typeof vi.spyOn> | undefined;
  try {
    await c.opened;
    c.send('auth.hello', { token: p.token, characterId: p.character.id, client: 'game_web' });
    await c.waitFor('zone.snapshot');
    resolve = vi.spyOn(sessions, 'resolve').mockRejectedValue(new Error('database unavailable'));
    await vi.waitFor(() => expect(c.closed).not.toBeNull(), { timeout: 3000 });
  } finally {
    resolve?.mockRestore();
    c.ws.close();
  }
});
