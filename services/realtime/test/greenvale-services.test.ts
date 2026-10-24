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
const march = 'zone.aurelian.greenvale_marches';
const running: ReturnType<typeof createRealtimeServer>[] = [];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function boot(zoneId = march) {
  const server = createRealtimeServer({
    ctx,
    sessions,
    logger: createLogger({ service: 'world-travel-test', level: 'silent' }),
    metrics: new Metrics(),
    zoneIds: [zoneId],
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
async function player(zoneId = march, pos = { x: 264, z: 403 }, health = 70) {
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

it('service validates NPC range and persists one paid item across replay/restart with discoveries', async () => {
  const h = await boot(),
    p = await player(),
    c = await join(h.url, p);
  const snapshot = await c.wait('zone.snapshot');
  const npc = snapshot.d.entities.find((e) => e.refId === 'npc.world.greenvale_marches.merchant')!;
  const request = { entityId: npc.id, offerId: 'service.greenvale.buy_cap', requestId: uuidv7() };
  const seq = c.send('npc.service', request);
  await c.wait('inventory.updated', (m) => m.ack === seq);
  const inv = await getCharacterItems(ctx.db, ctx, p.accountId, p.id);
  const cap = inv.containers
    .flatMap((c) => c.items)
    .find((i) => i.template.id === 'armor.leather.trapper_cap')!;
  expect(cap).toBeDefined();
  c.send('npc.service', request, seq);
  expect((await c.wait('error', (m) => m.ack === seq && m.d.code === 'CONFLICT')).d.code).toBe(
    'CONFLICT',
  );
  // New sequence, same durable operation: no second debit or instance.
  const repeat = c.send('npc.service', request);
  await c.wait('inventory.updated', (m) => m.ack === repeat);
  await c.wait('world.discoveries', (m) =>
    m.d.locationIds.includes('location.greenvale_marches.town'),
  );
  c.ws.close();
  await sleep(300);
  await h.server.stop();
  running.splice(running.indexOf(h.server), 1);
  const recovered = await boot(),
    again = await join(recovered.url, p);
  expect((await again.wait('world.discoveries')).d.locationIds).toContain(
    'location.greenvale_marches.town',
  );
  const items = await getCharacterItems(ctx.db, ctx, p.accountId, p.id);
  expect(
    items.containers
      .flatMap((c) => c.items)
      .filter((i) => i.template.id === cap.template.id)
      .map((i) => i.instance.id),
  ).toEqual([cap.instance.id]);
  const balance = await handle.db.execute(
    sql`select amount from currency_balances where owner_character_id=${p.id} and currency_id='gold'`,
  );
  expect(Number((balance.rows[0] as { amount: string }).amount)).toBe(880);
  again.ws.close();
});
it('cannot exchange against missing/distant NPCs or while dead', async () => {
  const h = await boot(),
    p = await player(march, { x: 256, z: 430 }),
    c = await join(h.url, p);
  const snapshot = await c.wait('zone.snapshot');
  const npc = snapshot.d.entities.find((e) => e.refId === 'npc.world.greenvale_marches.merchant')!;
  const seq = c.send('npc.service', {
    entityId: npc.id,
    offerId: 'service.greenvale.buy_cap',
    requestId: uuidv7(),
  });
  await c.wait('error', (m) => m.ack === seq);
  expect(
    await handle.db
      .select()
      .from(schema.serviceReceipts)
      .where(eq(schema.serviceReceipts.characterId, p.id)),
  ).toHaveLength(0);
  c.ws.close();
  const dead = await player(march, { x: 264, z: 403 }, 0),
    d = await join(h.url, dead);
  const snapshot2 = await d.wait('zone.snapshot');
  const entity = snapshot2.d.entities.find(
    (e) => e.refId === 'npc.world.greenvale_marches.merchant',
  )!;
  const n = d.send('npc.service', {
    entityId: entity.id,
    offerId: 'service.greenvale.buy_cap',
    requestId: uuidv7(),
  });
  await d.wait('error', (m) => m.ack === n);
  expect(
    await handle.db
      .select()
      .from(schema.serviceReceipts)
      .where(eq(schema.serviceReceipts.characterId, dead.id)),
  ).toHaveLength(0);
  d.ws.close();
});
it('specific backpack sale is authoritative and replay-safe across controller restart', async () => {
  const h = await boot(),
    p = await player(),
    c = await join(h.url, p);
  const npc = (await c.wait('zone.snapshot')).d.entities.find(
    (e) => e.refId === 'npc.world.greenvale_marches.merchant',
  )!;
  const buy = c.send('npc.service', {
    entityId: npc.id,
    offerId: 'service.greenvale.buy_cap',
    requestId: uuidv7(),
  });
  await c.wait('inventory.updated', (m) => m.ack === buy);
  const cap = (await getCharacterItems(ctx.db, ctx, p.accountId, p.id)).containers
    .flatMap((c) => c.items)
    .find((i) => i.template.id === 'armor.leather.trapper_cap')!;
  const request = {
    entityId: npc.id,
    itemId: cap.instance.id,
    expectedVersion: cap.instance.version,
    requestId: uuidv7(),
  };
  const seq = c.send('npc.sell', request);
  await c.wait('inventory.updated', (m) => m.ack === seq);
  const duplicate = c.send('npc.sell', request);
  await c.wait('inventory.updated', (m) => m.ack === duplicate);
  const stale = c.send('npc.sell', { ...request, requestId: uuidv7() });
  await c.wait('error', (m) => m.ack === stale && m.d.code === 'CONFLICT');
  c.ws.close();
  await sleep(300);
  await h.server.stop();
  running.splice(running.indexOf(h.server), 1);
  const recovered = await boot(),
    again = await join(recovered.url, p);
  expect(
    (await getCharacterItems(ctx.db, ctx, p.accountId, p.id)).containers
      .flatMap((c) => c.items)
      .some((i) => i.instance.id === cap.instance.id),
  ).toBe(false);
  const balance = await handle.db.execute(
    sql`select amount from currency_balances where owner_character_id=${p.id} and currency_id='gold'`,
  );
  expect(Number((balance.rows[0] as { amount: string }).amount)).toBe(
    880 + cap.template.vendorValue,
  );
  again.ws.close();
});

it('repairs equipped gear through the real protocol and rejects distant/dead requests', async () => {
  const h = await boot(),
    p = await player();
  const { grantItemInTx, inTransaction, moveItem, getCombatProfile } = await import('@mmo/domain');
  const actor = { accountId: p.accountId, characterId: p.id };
  const grant = await inTransaction(ctx, (tx) =>
    grantItemInTx(tx, ctx, {
      ...actor,
      templateId: 'weapon.sword.iron_longsword',
      quantity: 1,
      method: 'system',
      actor,
    }),
  );
  await moveItem(ctx, {
    ...actor,
    request: {
      itemInstanceId: grant.created.id,
      expectedVersion: grant.created.version,
      to: { kind: 'equipped', slotId: 'main_hand' },
    },
  });
  await handle.db
    .update(schema.itemInstances)
    .set({ durabilityCurrent: 0 })
    .where(eq(schema.itemInstances.id, grant.created.id));
  const c = await join(h.url, p);
  expect(h.server.zones.get(march)!.getPlayer(p.id)!.weapon.min).toBe(
    gd.raw.combatRules.unarmed.damage.min,
  );
  const npc = (await c.wait('zone.snapshot')).d.entities.find(
    (e) => e.refId === 'npc.world.greenvale_marches.merchant',
  )!;
  const request = { entityId: npc.id, requestId: uuidv7(), maxCopper: 8 };
  const seq = c.send('npc.repair', request);
  await c.wait('inventory.updated', (m) => m.ack === seq);
  const repaired = (await getCharacterItems(ctx.db, ctx, p.accountId, p.id)).equipment.slots
    .main_hand!;
  expect(repaired.instance.durability?.current).toBe(80);
  expect((await getCombatProfile(ctx.db, ctx, p.id)).weapon.templateId).toBe(
    'weapon.sword.iron_longsword',
  );
  expect(h.server.zones.get(march)!.getPlayer(p.id)!.weapon.min).toBe(7);
  const repeat = c.send('npc.repair', request);
  await c.wait('inventory.updated', (m) => m.ack === repeat);
  c.ws.close();
  for (const [pos, health] of [
    [{ x: 256, z: 430 }, 70],
    [{ x: 264, z: 403 }, 0],
  ] as const) {
    const q = await player(march, pos, health),
      other = await join(h.url, q);
    const entity = (await other.wait('zone.snapshot')).d.entities.find(
      (e) => e.refId === 'npc.world.greenvale_marches.merchant',
    )!;
    const ack = other.send('npc.repair', {
      entityId: entity.id,
      requestId: uuidv7(),
      maxCopper: 100,
    });
    await other.wait('error', (m) => m.ack === ack);
    expect(
      await handle.db
        .select()
        .from(schema.serviceReceipts)
        .where(eq(schema.serviceReceipts.characterId, q.id)),
    ).toHaveLength(0);
    other.ws.close();
  }
});

it('mentor training is server-owned, persists on reconnect and refuses remote/dead/combat requests', async () => {
  const zoneId = 'zone.greenvale.meadows';
  const h = await boot(zoneId);
  const make = async (pos = { x: -6, z: 5 }, health = 70) => {
    const p = await player(zoneId, pos, health);
    await handle.db
      .update(schema.characters)
      .set({ level: 5 })
      .where(eq(schema.characters.id, p.id));
    return p;
  };
  const p = await make(),
    c = await join(h.url, p);
  const npc = (await c.wait('zone.snapshot')).d.entities.find(
    (e) => e.refId === 'npc.greenvale.elder_maren',
  )!;
  const request = {
    entityId: npc.id,
    specialisationId: 'spec.warrior.guardian',
    requestId: uuidv7(),
  };
  const seq = c.send('npc.specialise', request);
  await c.wait('npc.dialogue', (m) => m.ack === seq);
  await c.wait('ability.state', (m) => m.d.specialisationId === 'spec.warrior.guardian');
  const duplicate = c.send('npc.specialise', request);
  await c.wait('npc.dialogue', (m) => m.ack === duplicate);
  c.ws.close();
  await sleep(250);
  const again = await join(h.url, p);
  expect((await again.wait('ability.state')).d.specialisationId).toBe('spec.warrior.guardian');
  const zone = h.server.zones.get(zoneId)!;
  const threat = vi.spyOn(zone, 'isThreatened').mockReturnValue(true);
  const blocked = again.send('npc.specialise', {
    ...request,
    requestId: uuidv7(),
    specialisationId: 'spec.warrior.berserker',
  });
  await again.wait('error', (m) => m.ack === blocked && m.d.code === 'CONFLICT');
  threat.mockRestore();
  again.ws.close();
  for (const [pos, health] of [
    [{ x: 12, z: 6 }, 70],
    [{ x: -6, z: 5 }, 0],
  ] as const) {
    const q = await make(pos, health),
      client = await join(h.url, q);
    const entity = (await client.wait('zone.snapshot')).d.entities.find(
      (e) => e.refId === 'npc.greenvale.elder_maren',
    )!;
    const ack = client.send('npc.specialise', {
      ...request,
      entityId: entity.id,
      requestId: uuidv7(),
    });
    await client.wait('error', (m) => m.ack === ack);
    expect(
      (await handle.db.select().from(schema.characters).where(eq(schema.characters.id, q.id)))[0]!
        .specialisationId,
    ).toBeNull();
    client.ws.close();
  }
});
