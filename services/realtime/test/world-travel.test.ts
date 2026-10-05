import { afterAll, afterEach, expect, it, vi } from 'vitest';
import type { AddressInfo } from 'node:net';
import { WebSocket } from 'ws';
import { eq, sql } from 'drizzle-orm';
import { createDb, schema } from '@mmo/db';
import {
  DevAuthProvider,
  SessionService,
  createCharacter,
  createDomainContext,
  getCharacterItems,
} from '@mmo/domain';
import { getGameData } from '@mmo/game-data';
import { encodeClientMessage, parseServerMessage, type ServerMessage } from '@mmo/networking';
import { createLogger, Metrics } from '@mmo/server-kit';
import { uuidv7 } from '@mmo/shared';
import { createRealtimeServer } from '../src/server';
const handle = createDb({ url: process.env.TEST_DATABASE_URL!, max: 8 });
const gd = getGameData(),
  ctx = createDomainContext({ db: handle.db, gameData: gd }),
  sessions = new SessionService(1);
const old = 'zone.greenvale.meadows',
  march = 'zone.aurelian.greenvale_marches',
  brine = 'zone.frostmere.brinebreak';
const routes = gd.raw.worldCatalog!.travel;
const north = routes.find((t) => t.fromLocationId === 'location.greenvale.north_gate')!;
const ship = routes.find(
  (t) =>
    t.fromLocationId === 'location.greenvale_marches.port' &&
    t.toLocationId === 'location.brinebreak.port',
)!;
const running: ReturnType<typeof createRealtimeServer>[] = [];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function boot() {
  const server = createRealtimeServer({
    ctx,
    sessions,
    logger: createLogger({ service: 'world-travel-test', level: 'silent' }),
    metrics: new Metrics(),
    zoneIds: [old, march, brine],
    tickHz: 20,
    allowedOrigins: ['http://localhost:5173'],
    lingerMs: 0,
  });
  await server.start('127.0.0.1', 0);
  running.push(server);
  return { server, url: `ws://127.0.0.1:${(server.http.address() as AddressInfo).port}/ws` };
}
afterEach(async () => {
  vi.restoreAllMocks();
  for (const s of running.splice(0)) await s.stop();
  await handle.db.delete(schema.zoneCheckpoints);
});
afterAll(() => handle.close());
class Client {
  ws: WebSocket;
  messages: ServerMessage[] = [];
  seq = 0;
  opened: Promise<void>;
  constructor(url: string) {
    this.ws = new WebSocket(url, { origin: 'http://localhost:5173' });
    this.opened = new Promise((r, j) => {
      this.ws.once('open', r);
      this.ws.once('error', j);
    });
    this.ws.on('message', (raw) => {
      const p = parseServerMessage(raw.toString());
      if (p.ok) this.messages.push(p.message);
    });
  }
  send(t: Parameters<typeof encodeClientMessage>[0], d: unknown, seq = ++this.seq) {
    this.ws.send(encodeClientMessage(t, seq, d as never));
    return seq;
  }
  async wait<T extends ServerMessage['t']>(
    t: T,
    predicate: (m: Extract<ServerMessage, { t: T }>) => boolean = () => true,
  ) {
    const until = Date.now() + 10000;
    while (Date.now() < until) {
      const m = this.messages.find(
        (m) => m.t === t && predicate(m as Extract<ServerMessage, { t: T }>),
      );
      if (m) return m as Extract<ServerMessage, { t: T }>;
      await sleep(15);
    }
    throw Error(
      `Missing ${t}: ${this.messages
        .slice(-10)
        .map((m) => m.t)
        .join(',')}`,
    );
  }
}
async function player(zoneId = old, pos = { x: 0, z: 116 }, health = 70) {
  const { accountId } = await new DevAuthProvider(new Set()).authenticate(ctx, {
    username: 'wr_' + uuidv7().replaceAll('-', '').slice(-16),
  });
  const ch = await createCharacter(ctx, {
    accountId,
    classId: 'class.warrior',
    name:
      'Wr' +
      uuidv7()
        .replace(/[^a-f]/g, '')
        .slice(0, 12),
  });
  const cooldown = Date.now() + 60000;
  await handle.db
    .update(schema.characters)
    .set({
      zoneId,
      posX: pos.x,
      posZ: pos.z,
      currentHealth: health,
      abilityCooldowns: { 'ability.warrior.power_strike': cooldown, '*': cooldown },
    })
    .where(eq(schema.characters.id, ch.id));
  const { token } = await sessions.create(ctx, accountId, 'game_web');
  return { accountId, id: ch.id, token, cooldown };
}
async function join(url: string, p: Awaited<ReturnType<typeof player>>) {
  const c = new Client(url);
  await c.opened;
  c.send('auth.hello', { token: p.token, characterId: p.id, client: 'game_web' });
  await c.wait('auth.ok');
  await c.wait('zone.snapshot');
  await c.wait('ability.state');
  return c;
}
it('rejects distant/missing/unhosted travel, dead players, and protocol replays', async () => {
  const h = await boot(),
    p = await player(old, { x: 0, z: 0 }),
    c = await join(h.url, p);
  for (const travelId of [north.id, ship.id, 'travel.missing']) {
    const seq = c.send('world.travel', { travelId });
    expect((await c.wait('error', (m) => m.ack === seq)).d.code).toBe('FORBIDDEN');
  }
  const seq = c.send('world.travel', { travelId: north.id });
  await c.wait('error', (m) => m.ack === seq);
  c.send('world.travel', { travelId: north.id }, seq);
  expect((await c.wait('error', (m) => m.ack === seq && m.d.code === 'CONFLICT')).d.code).toBe(
    'CONFLICT',
  );
  expect(
    (await handle.db.query.characters.findFirst({ where: eq(schema.characters.id, p.id) }))!.zoneId,
  ).toBe(old);
  c.ws.close();
  const dead = await player(old, { x: 0, z: 116 }, 0),
    d = await join(h.url, dead);
  const n = d.send('world.travel', { travelId: north.id });
  expect((await d.wait('error', (m) => m.ack === n)).d.code).toBe('CONFLICT');
  d.ws.close();
  const port = await player(march, { x: 256, z: 96 }),
    atPort = await join(h.url, port);
  const unavailable = routes.find(
    (t) =>
      t.fromLocationId === 'location.greenvale_marches.port' &&
      t.toLocationId === 'location.amber_coast.port',
  )!;
  const unhosted = atPort.send('world.travel', { travelId: unavailable.id });
  expect((await atPort.wait('error', (m) => m.ack === unhosted)).d.code).toBe('FORBIDDEN');
  expect(h.server.zones.get(march)!.getPlayer(port.id)).toBeDefined();
  expect(atPort.messages.filter((m) => m.t === 'auth.ok')).toHaveLength(1);
  atPort.ws.close();
});
it('atomically transfers ownership/position/health/cooldowns, clears zone party and preserves inventory', async () => {
  const h = await boot(),
    a = await player(),
    b = await player(),
    ca = await join(h.url, a),
    cb = await join(h.url, b);
  ca.send('party.invite', { characterId: b.id });
  const invitation = (await cb.wait('party.update', (m) => !!m.d.invitation)).d.invitation!;
  cb.send('party.respond', { invitationId: invitation.id, accept: true });
  await ca.wait('party.update', (m) => m.d.members.length === 2);
  const items = await getCharacterItems(ctx.db, ctx, a.accountId, a.id);
  const health = h.server.zones.get(old)!.getPlayer(a.id)!.health;
  const seq = ca.send('world.travel', { travelId: north.id });
  await ca.wait('auth.ok', (m) => m.ack === seq && m.d.zoneId === march);
  const row = (await handle.db.query.characters.findFirst({
    where: eq(schema.characters.id, a.id),
  }))!;
  expect(row.zoneId).toBe(march);
  expect(row.posX).toBe(256);
  expect(row.posZ).toBe(376);
  expect(row.currentHealth).toBeGreaterThanOrEqual(Math.floor(health));
  expect(row.currentHealth!).toBeLessThan(80);
  expect(row.abilityCooldowns['ability.warrior.power_strike']).toBe(a.cooldown);
  expect(h.server.zones.get(old)!.getPlayer(a.id)).toBeUndefined();
  expect(h.server.zones.get(march)!.getPlayer(a.id)).toBeDefined();
  expect(
    h.server.zones
      .get(old)!
      .parties.view(b.id)
      .members.some((m) => m.characterId === a.id),
  ).toBe(false);
  expect(await getCharacterItems(ctx.db, ctx, a.accountId, a.id)).toEqual(items);
  ca.ws.close();
  cb.ws.close();
});
it('supports players on separate continents and restores a committed boat transfer after crash', async () => {
  const h = await boot(),
    a = await player(march, { x: 256, z: 96 }),
    b = await player(old, { x: 0, z: 0 }),
    ca = await join(h.url, a),
    cb = await join(h.url, b);
  const seq = ca.send('world.travel', { travelId: ship.id });
  await ca.wait('auth.ok', (m) => m.ack === seq && m.d.zoneId === brine);
  expect(h.server.zones.get(old)!.getPlayer(b.id)).toBeDefined();
  expect(h.server.zones.get(brine)!.getPlayer(a.id)).toBeDefined();
  await h.server.simulateCrash();
  running.splice(running.indexOf(h.server), 1);
  const restarted = await boot(),
    reconnected = await join(restarted.url, a);
  expect((await reconnected.wait('auth.ok')).d.zoneId).toBe(brine);
  expect(restarted.server.zones.get(march)!.getPlayer(a.id)).toBeUndefined();
  expect(restarted.server.zones.get(brine)!.getPlayer(a.id)).toBeDefined();
  const row = (await handle.db.query.characters.findFirst({
    where: eq(schema.characters.id, a.id),
  }))!;
  expect(row.abilityCooldowns['ability.warrior.power_strike']).toBe(a.cooldown);
  expect(row.currentHealth!).toBeLessThan(80);
  reconnected.ws.close();
  cb.ws.close();
});
it('refuses travel during an active threat even before the first enemy hit', async () => {
  const h = await boot(),
    p = await player(),
    c = await join(h.url, p);
  vi.spyOn(h.server.zones.get(old)!, 'isThreatened').mockReturnValue(true);
  const seq = c.send('world.travel', { travelId: north.id });
  expect((await c.wait('error', (m) => m.ack === seq)).d.code).toBe('CONFLICT');
  expect(h.server.zones.get(march)!.getPlayer(p.id)).toBeUndefined();
  c.ws.close();
});
it('keeps a character in its original zone if the durable transfer write fails', async () => {
  const h = await boot(),
    p = await player(),
    c = await join(h.url, p);
  await handle.db.execute(
    sql`CREATE FUNCTION reject_zone_transfer() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.zone_id <> OLD.zone_id THEN RAISE EXCEPTION 'test transfer crash'; END IF; RETURN NEW; END $$`,
  );
  await handle.db.execute(
    sql`CREATE TRIGGER reject_zone_transfer BEFORE UPDATE ON characters FOR EACH ROW EXECUTE FUNCTION reject_zone_transfer()`,
  );
  try {
    c.send('world.travel', { travelId: north.id });
    await new Promise<void>((r) => {
      if (c.ws.readyState === c.ws.CLOSED) r();
      else c.ws.once('close', () => r());
    });
    expect(c.messages.filter((m) => m.t === 'auth.ok' && m.d.zoneId === march)).toHaveLength(0);
    expect(
      (await handle.db.query.characters.findFirst({ where: eq(schema.characters.id, p.id) }))!
        .zoneId,
    ).toBe(old);
  } finally {
    await handle.db.execute(
      sql`DROP TRIGGER reject_zone_transfer ON characters; DROP FUNCTION reject_zone_transfer()`,
    );
  }
  await h.server.simulateCrash();
  running.splice(running.indexOf(h.server), 1);
  const restarted = await boot(),
    again = await join(restarted.url, p);
  expect((await again.wait('auth.ok')).d.zoneId).toBe(old);
  again.ws.close();
});
