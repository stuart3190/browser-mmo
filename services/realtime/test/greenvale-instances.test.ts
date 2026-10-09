import { afterAll, afterEach, expect, it, vi } from 'vitest';
import type { AddressInfo } from 'node:net';
import { WebSocket } from 'ws';
import { eq } from 'drizzle-orm';
import { createDb, schema } from '@mmo/db';
import {
  DevAuthProvider,
  SessionService,
  createCharacter,
  createDomainContext,
  consumeRemedy,
  grantItemInTx,
  inTransaction,
} from '@mmo/domain';
import { getGameData, brokenVault, GameData } from '@mmo/game-data';
import { encodeClientMessage, parseServerMessage, type ServerMessage } from '@mmo/networking';
import { createLogger, Metrics } from '@mmo/server-kit';
import { uuidv7 } from '@mmo/shared';
import { createRealtimeServer } from '../src/server';
const handle = createDb({ url: process.env.TEST_DATABASE_URL!, max: 8 });
const base = getGameData(),
  gd = GameData.load({
    ...base.raw,
    combatRules: { ...base.raw.combatRules, regenFractionPerSecond: 0 },
  }),
  ctx = createDomainContext({ db: handle.db, gameData: gd }),
  sessions = new SessionService(1);
const march = 'zone.aurelian.greenvale_marches';
const running: ReturnType<typeof createRealtimeServer>[] = [];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(predicate: () => Promise<unknown>) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await sleep(20);
  }
  throw new Error('Durable recovery deadline');
}
async function boot() {
  const server = createRealtimeServer({
    ctx,
    sessions,
    logger: createLogger({ service: 'world-travel-test', level: 'silent' }),
    metrics: new Metrics(),
    zoneIds: [march],
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
        .map((m) => (m.t === 'error' ? JSON.stringify(m) : m.t))
        .join(',')}`,
    );
  }
}
async function player(zoneId = march, pos = { x: 1536, z: 1024 }, health = 70) {
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
      level: 4,
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
  await c.wait('character.progress');
  return c;
}

it('private solo routing isolates entities/deaths, rejects stale targets and restores the same child after a host crash', async () => {
  const h = await boot(),
    p = await player(),
    q = await player(),
    a = await join(h.url, p),
    b = await join(h.url, q);
  a.send('dungeon.command', { action: 'enter' });
  const run = await a.wait('systems.state', (m) => m.d.instance?.inside === true);
  const id = run.d.instance!.id;
  b.send('dungeon.command', { action: 'enter' });
  const other = await b.wait('systems.state', (m) => m.d.instance?.inside === true);
  expect(other.d.instance!.id).not.toBe(id);
  const first = await a.wait('zone.snapshot', (m) => m.d.zoneId === brokenVault.zoneId);
  const second = await b.wait('zone.snapshot', (m) => m.d.zoneId === brokenVault.zoneId);
  expect(first.d.entities.every((e) => e.id.startsWith(`instance:${id}:`))).toBe(true);
  const seq = a.send('target.set', {
    entityId: second.d.entities.find((e) => e.kind === 'enemy')!.id,
  });
  await a.wait('error', (m) => m.ack === seq);
  const [row] = await handle.db
    .select()
    .from(schema.characters)
    .where(eq(schema.characters.id, p.id));
  expect(row!.instanceId).toBe(id);
  await h.server.simulateCrash();
  running.splice(running.indexOf(h.server), 1);
  await sleep(100);
  const restarted = await boot(),
    again = await join(restarted.url, p);
  expect((await again.wait('systems.state')).d.instance!.id).toBe(id);
  expect((await again.wait('auth.ok')).d.zoneId).toBe(brokenVault.zoneId);
  a.ws.terminate();
  b.ws.terminate();
  again.ws.close();
});
it('party leader freezes nearby cohort, each joins the same private run, outsider cannot enter it and reset requires all to exit', async () => {
  const h = await boot(),
    p = await player(),
    q = await player(),
    r = await player(),
    a = await join(h.url, p),
    b = await join(h.url, q),
    c = await join(h.url, r);
  a.send('party.invite', { characterId: q.id });
  const invite = await b.wait('party.update', (m) => m.d.invitation !== null);
  b.send('party.respond', { invitationId: invite.d.invitation!.id, accept: true });
  await a.wait('party.update', (m) => m.d.members.length === 2);
  const rejected = b.send('dungeon.command', { action: 'enter' });
  await b.wait('error', (m) => m.ack === rejected && m.d.code === 'FORBIDDEN');
  a.send('dungeon.command', { action: 'enter' });
  const run = await a.wait('systems.state', (m) => m.d.instance?.inside === true);
  b.send('dungeon.command', { action: 'enter' });
  await b.wait(
    'systems.state',
    (m) => m.d.instance?.id === run.d.instance!.id && m.d.instance.inside,
  );
  c.send('dungeon.command', { action: 'enter' });
  const outsider = await c.wait('systems.state', (m) => m.d.instance?.inside === true);
  expect(outsider.d.instance!.id).not.toBe(run.d.instance!.id);
  const disband = a.send('party.disband', { partyId: run.d.instance!.id });
  await a.wait('error', (m) => m.ack === disband);
  const exit = a.send('dungeon.command', { action: 'exit' });
  await a.wait('systems.state', (m) => m.ack === exit);
  const reset = a.send('dungeon.command', { action: 'reset' });
  await a.wait('error', (m) => m.ack === reset && m.d.code === 'CONFLICT');
  const exitB = b.send('dungeon.command', { action: 'exit' });
  await b.wait('systems.state', (m) => m.ack === exitB);
  // Await final system reconciliation before the next expensive command.
  await b.wait('systems.state', (m) => m.d.instance?.inside === false);
  a.messages = [];
  a.send('dungeon.command', { action: 'reset' });
  await a.wait('systems.state', (m) => m.d.instance === null);
  a.send('dungeon.command', { action: 'enter' });
  const next = await a.wait('systems.state', (m) => m.d.instance?.inside === true);
  expect(next.d.instance!.id).not.toBe(run.d.instance!.id);
  a.ws.close();
  b.ws.close();
  c.ws.close();
});
it('expired instances evacuate connected and reconnected players without retaining stale routes', async () => {
  const h = await boot(),
    p = await player(),
    a = await join(h.url, p);
  a.send('dungeon.command', { action: 'enter' });
  const run = await a.wait('systems.state', (m) => m.d.instance?.inside === true);
  await handle.db
    .update(schema.dungeonInstances)
    .set({ expiresAt: new Date(0) })
    .where(eq(schema.dungeonInstances.id, run.d.instance!.id));
  await a.wait('auth.ok', (m) => m.d.zoneId === march && m.ack === 0);
  const [row] = await handle.db
    .select()
    .from(schema.characters)
    .where(eq(schema.characters.id, p.id));
  expect(row!.instanceId).toBeNull();
  expect(row!.zoneId).toBe(march);
  a.ws.close();
});
it('a consumed pending remedy survives process loss and is applied once with health and effect receipt in the same checkpoint', async () => {
  const p = await player(march, { x: 264, z: 403 }, 10);
  const grant = await inTransaction(ctx, (tx) =>
    grantItemInTx(tx, ctx, {
      accountId: p.accountId,
      characterId: p.id,
      templateId: 'consumable.greenvale.remedy',
      quantity: 2,
      method: 'system',
      actor: { accountId: p.accountId, characterId: p.id },
    }),
  );
  const requestId = uuidv7();
  await consumeRemedy(ctx, {
    accountId: p.accountId,
    characterId: p.id,
    itemId: grant.created.id,
    requestId,
  });
  const h = await boot(),
    a = await join(h.url, p);
  await a.wait('player.vitals', (m) => m.d.health >= 70);
  await sleep(200);
  const before = h.server.zones.get(march)!.getPlayer(p.id)!.health;
  await h.server.simulateCrash();
  running.splice(running.indexOf(h.server), 1);
  await sleep(100);
  const restarted = await boot(),
    again = await join(restarted.url, p);
  await until(async () => {
    const [receipt] = await handle.db
      .select()
      .from(schema.consumableUses)
      .where(eq(schema.consumableUses.id, requestId));
    return receipt?.appliedAt;
  });
  const after = restarted.server.zones.get(march)!.getPlayer(p.id)!.health;
  expect(before).toBe(70);
  expect(after).toBe(before);
  const [use] = await handle.db
    .select()
    .from(schema.consumableUses)
    .where(eq(schema.consumableUses.id, requestId));
  expect(use!.appliedAt).not.toBeNull();
  const [item] = await handle.db
    .select()
    .from(schema.itemInstances)
    .where(eq(schema.itemInstances.id, grant.created.id));
  expect(item!.quantity).toBe(1);
  a.ws.terminate();
  again.ws.close();
});

it('reset drains child checkpoint writes and restart reclaims an expired orphan image', async () => {
  const h = await boot(),
    p = await player(),
    a = await join(h.url, p);
  a.send('dungeon.command', { action: 'enter' });
  const run = await a.wait('systems.state', (m) => m.d.instance?.inside === true);
  const key = `instance:${run.d.instance!.id}`;
  const exit = a.send('dungeon.command', { action: 'exit' });
  await a.wait('systems.state', (m) => m.ack === exit);
  const [image] = await handle.db
    .select()
    .from(schema.zoneCheckpoints)
    .where(eq(schema.zoneCheckpoints.zoneId, key));
  expect(image).toBeDefined();
  const reset = a.send('dungeon.command', { action: 'reset' });
  await a.wait('systems.state', (m) => m.ack === reset && m.d.instance === null);
  await sleep(150);
  expect(
    await handle.db
      .select()
      .from(schema.zoneCheckpoints)
      .where(eq(schema.zoneCheckpoints.zoneId, key)),
  ).toHaveLength(0);
  await h.server.simulateCrash();
  running.splice(running.indexOf(h.server), 1);
  a.ws.terminate();
  // Model a checkpoint captured before reset but committed after its deletion.
  await handle.db.insert(schema.zoneCheckpoints).values(image!);
  const restarted = await boot();
  await until(
    async () =>
      !(
        await handle.db
          .select()
          .from(schema.zoneCheckpoints)
          .where(eq(schema.zoneCheckpoints.zoneId, key))
      ).length,
  );
  expect(restarted.server.zones.has(key)).toBe(false);
  const [row] = await handle.db
    .select()
    .from(schema.characters)
    .where(eq(schema.characters.id, p.id));
  expect(row!.instanceId).toBeNull();
  expect(row!.zoneId).toBe(march);
});
