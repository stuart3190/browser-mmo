import { afterAll, afterEach, expect, it, vi } from 'vitest';
import type { AddressInfo } from 'node:net';
import { WebSocket } from 'ws';
import { sql, eq } from 'drizzle-orm';
import { createDb, schema } from '@mmo/db';
import { createDomainContext, createCharacter, DevAuthProvider, SessionService } from '@mmo/domain';
import { DEMO_ZONE_ID, getGameData } from '@mmo/game-data';
import { encodeClientMessage, parseServerMessage } from '@mmo/networking';
import type { ServerMessage } from '@mmo/networking';
import { createLogger, Metrics } from '@mmo/server-kit';
import { uuidv7 } from '@mmo/shared';
import { createRealtimeServer } from '../src/server';
const handle = createDb({ url: process.env.TEST_DATABASE_URL!, max: 8 });
const ctx = createDomainContext({ db: handle.db, gameData: getGameData() });
const sessions = new SessionService(1);
const running: ReturnType<typeof createRealtimeServer>[] = [];
function server() {
  return createRealtimeServer({
    ctx,
    sessions,
    logger: createLogger({ service: 'fence-test', level: 'silent' }),
    metrics: new Metrics(),
    zoneIds: [DEMO_ZONE_ID],
    tickHz: 20,
    allowedOrigins: ['http://localhost:5173'],
    lingerMs: 10000,
  });
}
async function boot() {
  const s = server();
  await s.start('127.0.0.1', 0);
  running.push(s);
  return s;
}
async function crash(s: ReturnType<typeof server>) {
  await s.simulateCrash();
  running.splice(running.indexOf(s), 1);
}
afterEach(async () => {
  for (const s of running.splice(0)) await s.stop();
  await ctx.db.delete(schema.zoneCheckpoints);
});
afterAll(() => handle.close());
async function player() {
  const id = uuidv7().replaceAll('-', '');
  const { accountId } = await new DevAuthProvider(new Set()).authenticate(ctx, {
    username: `own_${id.slice(-16)}`,
  });
  const c = await createCharacter(ctx, {
    accountId,
    name: `Fence${id.replace(/[^a-f]/g, '').slice(-10)}`,
    classId: 'class.warrior',
  });
  const session = await sessions.create(ctx, accountId, 'game_web');
  return { id: c.id, token: session.token };
}
async function join(s: ReturnType<typeof server>, p: Awaited<ReturnType<typeof player>>) {
  const ws = new WebSocket(`ws://127.0.0.1:${(s.http.address() as AddressInfo).port}/ws`, {
    origin: 'http://localhost:5173',
  });
  const messages: ServerMessage[] = [];
  ws.on('message', (raw) => {
    const m = parseServerMessage(raw.toString());
    if (m.ok) messages.push(m.message);
  });
  await new Promise<void>((r) => ws.once('open', r));
  let seq = 0;
  const send = (t: Parameters<typeof encodeClientMessage>[0], d: unknown) =>
    ws.send(encodeClientMessage(t, ++seq, d as never));
  const wait = async (predicate: (m: ServerMessage) => boolean) => {
    const until = Date.now() + 4000;
    while (Date.now() < until) {
      const m = messages.find(predicate);
      if (m) return m;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error('Timed out waiting for durable publication');
  };
  send('auth.hello', { token: p.token, characterId: p.id, client: 'game_web' });
  await wait((m) => m.t === 'zone.snapshot');
  return { ws, send, wait, messages };
}
it('rejects duplicate hosts, then recovers after the owner crashes', async () => {
  const a = await boot();
  const duplicate = server();
  await expect(duplicate.start('127.0.0.1', 0)).rejects.toThrow('already owned');
  const p = await player();
  const cd = Date.now() + 60_000;
  await ctx.db
    .update(schema.characters)
    .set({ currentHealth: 72, abilityCooldowns: { 'ability.warrior.heavy_strike': cd } })
    .where(eq(schema.characters.id, p.id));
  const c = await join(a, p);
  c.send('move.input', { position: { x: 0.5, y: 0, z: -8 }, rotationY: 0.9 });
  c.send('ping', { clientTime: 42 });
  await c.wait((m) => m.t === 'pong' && m.d.clientTime === 42);
  const before = a.zones.get(DEMO_ZONE_ID)!.persistentState(p.id)!;
  await crash(a); // no graceful save
  const b = await boot();
  const recovered = await join(b, p);
  const after = b.zones.get(DEMO_ZONE_ID)!.persistentState(p.id)!;
  expect(after.position).toEqual(before.position);
  expect(after.rotationY).toBe(0.9);
  expect(after.health).toBeGreaterThanOrEqual(before.health);
  expect(after.health).toBeLessThan(80);
  expect((after.abilityCooldowns as Record<string, number>)['ability.warrior.heavy_strike']).toBe(
    cd,
  );
  recovered.ws.close();
});
it('fences the old host on database session loss and lets a new host acquire ownership', async () => {
  const a = await boot();
  const p = await player();
  const c = await join(a, p);
  const closed = new Promise<void>((r) => c.ws.once('close', () => r()));
  await ctx.db.execute(
    sql`select pg_terminate_backend(pid) from pg_stat_activity where application_name='mmo-zone-owner' and datname=current_database()`,
  );
  await closed;
  const res = await fetch(
    `http://127.0.0.1:${(a.http.address() as AddressInfo).port}/health/ready`,
  );
  expect(res.status).toBe(503);
  const tick = a.zones.get(DEMO_ZONE_ID)!.tick;
  await new Promise((r) => setTimeout(r, 150));
  expect(a.zones.get(DEMO_ZONE_ID)!.tick).toBe(tick);
  const b = await boot();
  const next = await join(b, p);
  next.ws.close();
});

it('does not publish a state change when its checkpoint is blocked then fails', async () => {
  const a = await boot();
  const p = await player();
  const c = await join(a, p);
  const before = a.zones.get(DEMO_ZONE_ID)!.persistentState(p.id)!;
  const lock = await handle.pool.connect();
  try {
    await lock.query('begin');
    await lock.query('select id from characters where id=$1 for update', [p.id]);
    const closed = new Promise<void>((resolve) => c.ws.once('close', () => resolve()));
    c.send('move.input', { position: { x: 0.5, y: 0, z: -8 }, rotationY: 0.4 });
    c.send('ping', { clientTime: 999 });
    await closed; // lock timeout fences the owner; no pong from this uncommitted batch
    expect(c.messages.some((m) => m.t === 'pong' && m.d.clientTime === 999)).toBe(false);
    await lock.query('rollback');
    // Socket fencing precedes asynchronous DB-session cleanup. A replacement must wait
    // for PostgreSQL's confirmed lock release, not infer ownership from a closed socket.
    await vi.waitFor(
      async () => {
        const rows = await handle.pool.query(
          "select count(*)::int n from pg_locks where locktype='advisory' and classid=717723 and granted and database=(select oid from pg_database where datname=current_database())",
        );
        expect(rows.rows[0].n).toBe(0);
      },
      { timeout: 4_000 },
    );
    const b = await boot();
    const recovered = await join(b, p);
    expect(b.zones.get(DEMO_ZONE_ID)!.persistentState(p.id)!.position).toEqual(before.position);
    recovered.ws.close();
  } finally {
    await lock.query('rollback');
    lock.release();
  }
});

it('refuses startup while a migration runner owns the deployment lock', async () => {
  const client = await handle.pool.connect();
  try {
    await client.query('select pg_advisory_lock(717724, 1)');
    await expect(server().start('127.0.0.1', 0)).rejects.toThrow('Migration in progress');
  } finally {
    await client.query('select pg_advisory_unlock_all()');
    client.release(true);
  }
  await boot();
});

it('fails closed on a corrupt checkpoint without leaking zone ownership', async () => {
  await ctx.db
    .insert(schema.zoneCheckpoints)
    .values({ zoneId: DEMO_ZONE_ID, version: 1, payload: '{broken' });
  await expect(server().start('127.0.0.1', 0)).rejects.toThrow();
  await ctx.db.delete(schema.zoneCheckpoints);
  await boot();
});
