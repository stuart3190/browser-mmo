import { afterAll, afterEach, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import { WebSocket } from 'ws';
import { and, eq, sql } from 'drizzle-orm';
import { loadDotEnv } from '@mmo/config';
import { createDb, schema } from '@mmo/db';
import {
  DevAuthProvider,
  SessionService,
  createCharacter,
  createDomainContext,
  grantItemInTx,
  inTransaction,
} from '@mmo/domain';
import { seededRng } from '@mmo/game-data';
import type { ServerMessage } from '@mmo/networking';
import { encodeClientMessage, parseServerMessage } from '@mmo/networking';
import { Metrics, createLogger } from '@mmo/server-kit';
import { uuidv7 } from '@mmo/shared';
import { ARENA, arenaGameData } from '@mmo/world/testing';
import type { KillEvent, ZoneSimulation } from '@mmo/world';
import { createRealtimeServer } from '../src/server';
import type { KillFaults } from '../src/server';

/**
 * Crash-boundary tests for the durable kill pipeline (ADR 0017). Each test kills the arena wolf,
 * "crashes" the realtime process at a specific point (a fault hook that never returns, followed by
 * simulateCrash(), which drops all in-memory state without flushing anything), restarts a fresh
 * server against the same database and checks that rewards are granted exactly once and that
 * spawn state is not corrupted.
 */

loadDotEnv();
const TEST_URL = process.env.TEST_DATABASE_URL!;
const handle = createDb({ url: TEST_URL, max: 8 });
const gameData = arenaGameData();
const ctx = createDomainContext({ db: handle.db, gameData, rng: seededRng(99) });
const sessions = new SessionService(1);
const XP = Math.round(45 * 1.1);
const hang = () => new Promise<never>(() => undefined);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Server = ReturnType<typeof createRealtimeServer>;
const running: Server[] = [];

async function boot(faults: KillFaults = {}) {
  const server = createRealtimeServer({
    ctx,
    sessions,
    logger: createLogger({ service: 'rt-durable-test', level: process.env.RT_LOG ?? 'silent' }),
    metrics: new Metrics(),
    zoneIds: [ARENA],
    tickHz: 20,
    allowedOrigins: ['http://localhost:5173'],
    lingerMs: 0,
    killRecoveryIntervalMs: 250,
    changeFeedUrl: TEST_URL,
    rng: seededRng(5),
    faults,
  });
  await server.start('127.0.0.1', 0);
  running.push(server);
  return {
    server,
    url: `ws://127.0.0.1:${(server.http.address() as AddressInfo).port}/ws`,
    zone: () => server.zones.get(ARENA)!,
  };
}

async function crash(s: Server) {
  await s.simulateCrash();
  running.splice(running.indexOf(s), 1);
}

afterEach(async () => {
  for (const s of running.splice(0)) await s.stop();
  await handle.db.delete(schema.zoneCheckpoints);
});
afterAll(() => handle.close());

class Client {
  readonly ws: WebSocket;
  messages: ServerMessage[] = [];
  seq = 0;
  readonly opened: Promise<void>;
  constructor(url: string) {
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
  async waitFor<T extends ServerMessage['t']>(
    t: T,
    pred: (m: Extract<ServerMessage, { t: T }>) => boolean = () => true,
    timeout = 15_000,
  ) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const m = (this.messages.filter((x) => x.t === t) as Extract<ServerMessage, { t: T }>[]).find(
        pred,
      );
      if (m) return m;
      await sleep(20);
    }
    throw new Error(`timed out waiting for ${t}`);
  }
}

async function player() {
  const { accountId } = await new DevAuthProvider(new Set()).authenticate(ctx, {
    username: `dk_${uuidv7().replace(/-/g, '').slice(-16)}`,
  });
  const name = `Dk${uuidv7()
    .replace(/[^a-f]/g, '')
    .slice(0, 12)}`;
  const ch = await createCharacter(ctx, { accountId, name, classId: 'class.warrior' });
  await handle.db
    .update(schema.characters)
    .set({ zoneId: ARENA, posX: 2, posZ: 11.5 })
    .where(eq(schema.characters.id, ch.id));
  const { token } = await sessions.create(ctx, accountId, 'game_web');
  return { accountId, characterId: ch.id, token };
}

async function join(url: string, p: { token: string; characterId: string }) {
  const c = new Client(url);
  await c.opened;
  c.send('auth.hello', { token: p.token, characterId: p.characterId, client: 'game_web' });
  await c.waitFor('auth.ok');
  await c.waitFor('zone.snapshot');
  return c;
}

/** Waits for a live, idle, full-health wolf in the arena (it may still be on a respawn timer). */
async function liveWolf(zone: () => ZoneSimulation) {
  const start = Date.now();
  while (Date.now() - start < 20_000) {
    for (const id of zone().enemyIds()) {
      const e = zone().getEnemy(id)!;
      if (e.mode === 'idle' && e.health === e.maxHealth) return id;
    }
    await sleep(50);
  }
  throw new Error('no live wolf');
}

/** Joins, gives the character a one-shot weapon in the simulation and starts attacking the wolf. */
async function killWolf(
  b: Awaited<ReturnType<typeof boot>>,
  p: Awaited<ReturnType<typeof player>>,
) {
  const wolfId = await liveWolf(b.zone);
  const c = await join(b.url, p);
  const me = b.zone().getPlayer(p.characterId)!;
  b.zone().updateCombatProfile(
    p.characterId,
    {
      level: 1,
      stats: {},
      maxHealth: me.maxHealth,
      weapon: { min: 500, max: 500, attackSpeedMs: 1000 },
    },
    Date.now(),
  );
  c.send('target.set', { entityId: wolfId });
  c.send('combat.attack', { start: true });
  return { c, wolfId };
}

async function until(pred: () => boolean | Promise<boolean>, timeout = 10_000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await pred()) return;
    await sleep(20);
  }
  throw new Error('condition not reached');
}

const killEventsOf = (characterId: string) =>
  handle.db.select().from(schema.killEvents).where(eq(schema.killEvents.characterId, characterId));
const rewardsOf = (characterId: string) =>
  handle.db
    .select()
    .from(schema.killRewards)
    .where(eq(schema.killRewards.characterId, characterId));
const xpOf = async (characterId: string) =>
  (
    await handle.db.select().from(schema.characters).where(eq(schema.characters.id, characterId))
  )[0]!.xp;
const lootCount = async (killId: string) =>
  (
    (await handle.db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.itemInstances)
      .where(sql`${schema.itemInstances.sourceRef} like ${`kill:${killId}:%`}`)) as [{ n: number }]
  )[0].n;

describe('durable kill rewards across crashes', { timeout: 60_000 }, () => {
  it('normal path: the kill is recorded before the death is announced and rewarded once', async () => {
    const order: string[] = [];
    const b = await boot({
      beforeRecord: () => void order.push('record'),
      afterReward: () => void order.push('rewarded'),
    });
    const p = await player();
    const { c, wolfId } = await killWolf(b, p);
    await c.waitFor('combat.death', (m) => m.d.entityId === wolfId);
    order.push('announced');
    const loot = await c.waitFor('combat.loot');
    expect(loot.d.recovered).toBe(false);
    await b.server.rewardsIdle();
    expect(order.indexOf('record')).toBeLessThan(order.indexOf('announced'));
    const [ev] = await killEventsOf(p.characterId);
    expect(ev).toMatchObject({ status: 'rewarded', spawnPointId: 'spawn.test.wolf' });
    expect(await rewardsOf(p.characterId)).toHaveLength(1);
    expect(await xpOf(p.characterId)).toBe(XP);
    c.ws.close();
  });

  it('crash after checkpoint but BEFORE the kill record: recovery finishes the pending death once)', async () => {
    let reached: KillEvent | undefined;
    const b1 = await boot({
      beforeRecord: (k) => {
        reached = k;
        return hang();
      },
    });
    const p = await player();
    const { wolfId } = await killWolf(b1, p);
    await until(() => reached !== undefined);
    expect(b1.zone().getEnemy(wolfId)!.mode).toBe('dying'); // not announced, not respawning
    await crash(b1.server);

    const b2 = await boot();
    await b2.server.rewardsIdle();
    expect(await killEventsOf(p.characterId)).toHaveLength(1);
    expect(await rewardsOf(p.characterId)).toHaveLength(1);
    expect(await xpOf(p.characterId)).toBe(XP);
  });

  it('crash AFTER recording but before reward: startup recovery rewards exactly once and keeps the respawn timer', async () => {
    let reached: KillEvent | undefined;
    const b1 = await boot({
      afterRecord: (k) => {
        reached = k;
        return hang();
      },
    });
    const p = await player();
    await killWolf(b1, p);
    await until(() => reached !== undefined);
    const [pending] = await killEventsOf(p.characterId);
    expect(pending).toMatchObject({ status: 'pending' });
    expect(await rewardsOf(p.characterId)).toHaveLength(0);
    await crash(b1.server);

    const b2 = await boot();
    // A crashed worker can still hold its durable lease briefly; idle queues do not mean
    // lease-backed recovery has finished. Await the persisted outcome, then assert exact counts.
    await until(async () => (await killEventsOf(p.characterId))[0]?.status === 'rewarded');
    await b2.server.rewardsIdle();
    expect(await killEventsOf(p.characterId)).toMatchObject([{ status: 'rewarded' }]);
    const rewards = await rewardsOf(p.characterId);
    expect(rewards).toHaveLength(1);
    expect(await xpOf(p.characterId)).toBe(XP);
    expect(await lootCount(reached!.killId)).toBe(2);
    // the recorded death is not resurrected early: the slot waits for its persisted respawn time
    if (Date.now() < reached!.respawnAtMs - 500)
      expect(
        b2
          .zone()
          .enemyIds()
          .every((id) => b2.zone().getEnemy(id)!.mode === 'dead'),
      ).toBe(true);
    await until(
      () =>
        b2
          .zone()
          .enemyIds()
          .some((id) => b2.zone().getEnemy(id)!.mode === 'idle'),
      reached!.respawnAtMs - Date.now() + 3_000,
    );
    expect(Date.now()).toBeGreaterThanOrEqual(reached!.respawnAtMs);

    // another restart (or a second node) changes nothing
    await b2.server.stop();
    running.splice(running.indexOf(b2.server), 1);
    const b3 = await boot();
    await b3.server.sweepKills();
    await b3.server.rewardsIdle();
    expect(await rewardsOf(p.characterId)).toHaveLength(1);
    expect(await xpOf(p.characterId)).toBe(XP);
    expect(await lootCount(reached!.killId)).toBe(2);
  });

  it('crash AFTER the reward committed (before notifying): restart does not award again', async () => {
    let rewardedKill: string | undefined;
    const b1 = await boot({
      afterReward: (killId) => {
        rewardedKill = killId;
        return hang();
      },
    });
    const p = await player();
    await killWolf(b1, p);
    await until(() => rewardedKill !== undefined);
    await crash(b1.server);
    expect(await xpOf(p.characterId)).toBe(XP);

    const b2 = await boot();
    await b2.server.sweepKills();
    await b2.server.rewardsIdle();
    expect(await rewardsOf(p.characterId)).toHaveLength(1);
    expect(await xpOf(p.characterId)).toBe(XP);
    expect(await lootCount(rewardedKill!)).toBe(2);
  });

  it('a duplicate recovery host is refused; the owner rewards each kill exactly once', async () => {
    const reached: KillEvent[] = [];
    const b1 = await boot({
      afterRecord: (k) => {
        reached.push(k);
        return hang();
      },
    });
    const p = await player();
    await killWolf(b1, p);
    await until(() => reached.length === 1);
    await crash(b1.server);

    const b2 = await boot();
    await expect(boot()).rejects.toThrow('already owned');
    await b2.server.sweepKills();
    await b2.server.rewardsIdle();
    // Replayed checkpoint records may finish after the startup sweep; wait for durable completion.
    await until(async () => (await rewardsOf(p.characterId)).length === 1);
    await b2.server.sweepKills();
    await b2.server.rewardsIdle();
    expect(await rewardsOf(p.characterId)).toHaveLength(1);
    expect(await xpOf(p.characterId)).toBe(XP);
    expect(await lootCount(reached[0]!.killId)).toBe(2);
  });

  it('transient failures while recording are retried; the duplicate write is harmless', async () => {
    let failures = 0;
    const b = await boot({
      afterRecord: () => {
        // The row IS written but the acknowledgement is "lost" twice: the retry re-inserts it.
        if (failures++ < 2) throw new Error('connection reset');
      },
    });
    const p = await player();
    const { c, wolfId } = await killWolf(b, p);
    await c.waitFor('combat.death', (m) => m.d.entityId === wolfId);
    await c.waitFor('combat.loot');
    await b.server.rewardsIdle();
    expect(failures).toBe(3);
    expect(await killEventsOf(p.characterId)).toHaveLength(1);
    expect(await rewardsOf(p.characterId)).toHaveLength(1);
    expect(await xpOf(p.characterId)).toBe(XP);
    c.ws.close();
  });

  it('a full bag never loses the drop: loot goes to the mailbox and the player is told', async () => {
    const b = await boot();
    const p = await player();
    const grant = (templateId: string, quantity: number) =>
      inTransaction(ctx, (tx) =>
        grantItemInTx(tx, ctx, {
          ...p,
          templateId,
          quantity,
          method: 'system',
          actor: { accountId: null, characterId: null },
        }),
      );
    for (let i = 0; i < 24; i++) await grant('weapon.sword.iron_longsword', 1);
    for (let i = 0; i < 40; i++) await grant('material.hide.wolf_pelt', 200);
    const { c } = await killWolf(b, p);
    const loot = await c.waitFor('combat.loot');
    expect(loot.d.mailedItems.length).toBe(2);
    expect(
      loot.d.items.every(
        (i) =>
          i.instance.location.kind === 'container' &&
          i.instance.location.containerKind === 'mailbox',
      ),
    ).toBe(true);
    // the mailbox is part of the client's live view
    await c.waitFor('inventory.updated', (m) =>
      m.d.items.some(
        (i) =>
          i.instance.location.kind === 'container' &&
          i.instance.location.containerKind === 'mailbox',
      ),
    );
    const mailbox = await handle.db
      .select()
      .from(schema.containers)
      .where(
        and(
          eq(schema.containers.ownerCharacterId, p.characterId),
          eq(schema.containers.kind, 'mailbox'),
        ),
      );
    expect(mailbox).toHaveLength(1);
    c.ws.close();
    expect(loot.d.enemyName).toBe('Grey Wolf');
  });
});
