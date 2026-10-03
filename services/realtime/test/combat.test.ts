import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import { WebSocket } from 'ws';
import { eq, sql } from 'drizzle-orm';
import { loadDotEnv } from '@mmo/config';
import { createDb, schema } from '@mmo/db';
import {
  DevAuthProvider,
  SessionService,
  adminGrantItem,
  awardKill,
  createCharacter,
  createDomainContext,
  moveItem,
} from '@mmo/domain';
import { DEMO_ZONE_ID, getGameData, seededRng, xpToNextLevel } from '@mmo/game-data';
import type { ServerMessage } from '@mmo/networking';
import { encodeClientMessage, parseServerMessage } from '@mmo/networking';
import { Metrics, createLogger } from '@mmo/server-kit';
import { uuidv7 } from '@mmo/shared';
import { createRealtimeServer } from '../src/server';

loadDotEnv();
const TEST_URL = process.env.TEST_DATABASE_URL!;
const handle = createDb({ url: TEST_URL, max: 5 });
const ctx = createDomainContext({ db: handle.db, gameData: getGameData(), rng: seededRng(42) });
const sessions = new SessionService(1);
const server = createRealtimeServer({
  ctx,
  sessions,
  logger: createLogger({ service: 'rt-combat-test', level: process.env.RT_LOG ?? 'silent' }),
  metrics: new Metrics(),
  zoneIds: [DEMO_ZONE_ID],
  tickHz: 20,
  allowedOrigins: ['http://localhost:5173'],
  changeFeedUrl: TEST_URL,
  lingerMs: 5_000,
  rng: seededRng(7),
});
let url = '';
const zone = () => server.zones.get(DEMO_ZONE_ID)!;
const ADMIN = { accountId: null, characterId: null };

beforeAll(async () => {
  await server.start('127.0.0.1', 0);
  url = `ws://127.0.0.1:${(server.http.address() as AddressInfo).port}/ws`;
});
afterAll(async () => {
  await server.stop();
  await handle.close();
});

class Client {
  readonly ws: WebSocket;
  messages: ServerMessage[] = [];
  seq = 0;
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
  send(t: Parameters<typeof encodeClientMessage>[0], d: unknown, seq = ++this.seq) {
    this.ws.send(encodeClientMessage(t, seq, d as never));
    return seq;
  }
  all<T extends ServerMessage['t']>(t: T) {
    return this.messages.filter((m) => m.t === t) as Extract<ServerMessage, { t: T }>[];
  }
  async waitFor<T extends ServerMessage['t']>(
    t: T,
    pred: (m: Extract<ServerMessage, { t: T }>) => boolean = () => true,
    timeout = 20_000,
  ) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const m = this.all(t).find(pred);
      if (m) return m;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error(
      `timed out waiting for ${t}; last: ${this.messages
        .slice(-8)
        .map((m) => m.t)
        .join(',')}`,
    );
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const name = (p: string) =>
  `${p}${uuidv7()
    .replace(/[^a-f]/g, '')
    .slice(0, 12)}`;
const wolfEntity = () =>
  zone()
    .listEntities()
    .find((e) => e.kind === 'enemy' && !e.dead);

/** Fresh warrior positioned next to the wolf, optionally with a (mythic) sword equipped. */
async function fighter(
  opts: { sword?: boolean; health?: number; xp?: number; pos?: { x: number; z: number } } = {},
) {
  const { accountId } = await new DevAuthProvider(new Set()).authenticate(ctx, {
    username: `cb_${uuidv7().replace(/-/g, '').slice(-16)}`,
  });
  const ch = await createCharacter(ctx, { accountId, name: name('Cb'), classId: 'class.warrior' });
  if (opts.sword) {
    const sword = await adminGrantItem(ctx, {
      actor: ADMIN,
      characterId: ch.id,
      templateId: 'weapon.sword.iron_longsword',
      quantity: 1,
      rarityId: 'mythic',
      reason: 'test',
    });
    await moveItem(ctx, {
      accountId,
      characterId: ch.id,
      request: {
        itemInstanceId: sword.instance.id,
        expectedVersion: sword.instance.version,
        to: { kind: 'equipped', slotId: 'main_hand' },
      },
    });
  }
  const pos = opts.pos ?? { x: 2, z: 11.5 };
  await handle.db
    .update(schema.characters)
    .set({
      posX: pos.x,
      posZ: pos.z,
      ...(opts.health !== undefined ? { currentHealth: opts.health } : {}),
      ...(opts.xp !== undefined ? { xp: opts.xp } : {}),
    })
    .where(eq(schema.characters.id, ch.id));
  const { token } = await sessions.create(ctx, accountId, 'game_web');
  return { accountId, characterId: ch.id, token };
}

async function join(token: string, characterId: string) {
  const c = new Client();
  await c.opened;
  c.send('auth.hello', { token, characterId, client: 'game_web' });
  const ok = await c.waitFor('auth.ok');
  await c.waitFor('zone.snapshot');
  return { c, entityId: ok.d.entityId };
}

/** Waits until no wolf is alive or engaged with anyone (each test gets a clean wolf). */
async function freshWolf() {
  const start = Date.now();
  while (Date.now() - start < 20_000) {
    const w = wolfEntity();
    const st = w && zone().getEnemy(w.id);
    if (st && st.mode === 'idle' && st.health === st.maxHealth) return w!;
    await sleep(100);
  }
  throw new Error('no fresh wolf');
}

describe('server-authoritative combat over the realtime protocol', () => {
  it('rejects invalid combat requests and replays without changing state', async () => {
    await freshWolf();
    const p = await fighter({ pos: { x: -40, z: 40 } });
    const { c } = await join(p.token, p.characterId);
    const s1 = c.send('combat.attack', { start: true });
    expect((await c.waitFor('error', (m) => m.ack === s1)).d.code).toBe('NO_TARGET');
    const s2 = c.send('target.set', { entityId: 'e:999999' });
    expect((await c.waitFor('error', (m) => m.ack === s2)).d.code).toBe('INVALID_TARGET');
    const wolf = wolfEntity()!;
    c.send('target.set', { entityId: wolf.id });
    await c.waitFor('combat.state', (m) => m.d.targetId === wolf.id);
    const s3 = c.send('combat.attack', { start: true });
    expect((await c.waitFor('error', (m) => m.ack === s3)).d.code).toBe('OUT_OF_RANGE');
    c.send('ping', { clientTime: 1 }, s3); // replayed sequence number
    expect((await c.waitFor('error', (m) => m.d.code === 'CONFLICT')).d.message).toMatch(
      /sequence/,
    );
    expect(zone().getEnemy(wolf.id)!.health).toBe(80);
    c.ws.close();
  });

  it(
    'full loop: target, auto-attack, wolf fights back, dies once, XP + loot persisted once and pushed',
    { timeout: 60_000 },
    async () => {
      const wolf = await freshWolf();
      const need = xpToNextLevel(getGameData().raw.experienceCurve, 1);
      const p = await fighter({ sword: true, xp: need - 5 });
      const { c, entityId } = await join(p.token, p.characterId);
      const initialMax = (await c.waitFor('player.vitals')).d.maxHealth;
      c.send('target.set', { entityId: wolf.id });
      c.send('combat.attack', { start: true });
      // Spam start requests: they must not speed up swings.
      for (let i = 0; i < 20; i++) c.send('combat.attack', { start: true });
      await c.waitFor('combat.state', (m) => m.d.attacking && m.d.reason === 'started');
      const death = await c.waitFor('combat.death', (m) => m.d.entityId === wolf.id, 40_000);
      expect(death.d.killerId).toBe(entityId);
      const swings = c.all('combat.damage').filter((m) => m.d.sourceId === entityId);
      expect(swings.length).toBeGreaterThanOrEqual(2);
      expect(
        c
          .all('combat.damage')
          .filter((m) => m.d.targetId === wolf.id)
          .every((m, i, arr) => i === 0 || m.d.targetHealth <= arr[i - 1]!.d.targetHealth),
      ).toBe(true);
      expect(c.all('combat.damage').some((m) => m.d.targetId === entityId)).toBe(true); // wolf fought back
      expect(c.all('player.vitals').some((m) => m.d.health < m.d.maxHealth)).toBe(true);
      await c.waitFor('combat.state', (m) => !m.d.attacking && m.d.reason === 'target_dead');

      const progress = await c.waitFor('character.progress', (m) => m.d.xpGained > 0);
      expect(progress.d.xpGained).toBe(Math.round(45 * 1.1));
      // This kill crosses the level threshold: level-up persisted and pushed, max health raised live.
      expect(progress.d).toMatchObject({
        level: 2,
        levelsGained: 1,
        xp: need - 5 + progress.d.xpGained - need,
      });
      const raised = await c.waitFor('player.vitals', (m) => m.d.maxHealth > initialMax);
      expect(zone().getPlayer(p.characterId)!.maxHealth).toBe(raised.d.maxHealth);
      const loot = await c.waitFor('combat.loot');
      expect(loot.d.enemyName).toBe('Grey Wolf');
      expect(loot.d.items.length + loot.d.lostItems.length).toBeGreaterThan(0);
      // loot also arrives through the inventory pipeline (change feed)
      const lootIds = new Set(loot.d.items.map((i) => i.instance.id));
      await c.waitFor('inventory.updated', (m) =>
        m.d.items.some((i) => lootIds.has(i.instance.id)),
      );

      await server.rewardsIdle();
      const rewards = await handle.db
        .select()
        .from(schema.killRewards)
        .where(eq(schema.killRewards.characterId, p.characterId));
      expect(rewards).toHaveLength(1);
      const killId = rewards[0]!.killId;
      const [ch] = await handle.db
        .select()
        .from(schema.characters)
        .where(eq(schema.characters.id, p.characterId));
      expect(ch!.xp).toBe(progress.d.xp);
      // A duplicate reward attempt for the same death changes nothing.
      await expect(
        awardKill(ctx, {
          killId,
          characterId: p.characterId,
          enemyId: 'enemy.greenvale.grey_wolf',
          zoneId: DEMO_ZONE_ID,
        }),
      ).rejects.toMatchObject({ code: 'ALREADY_CLAIMED' });
      const [after] = await handle.db
        .select()
        .from(schema.characters)
        .where(eq(schema.characters.id, p.characterId));
      expect(after!.xp).toBe(ch!.xp);
      const [{ n }] = (await handle.db
        .select({ n: sql<number>`count(*)::int` })
        .from(schema.itemInstances)
        .where(sql`${schema.itemInstances.sourceRef} like ${`kill:${killId}:%`}`)) as [
        { n: number },
      ];
      expect(n).toBe(2);
      // Attacking the corpse is rejected.
      const s = c.send('combat.attack', { start: true });
      expect((await c.waitFor('error', (m) => m.ack === s)).d.code).toBe('TARGET_DEAD');
      c.ws.close();
    },
  );

  it(
    'player death: actions blocked, early respawn rejected, respawn restores health; health persisted',
    { timeout: 60_000 },
    async () => {
      await freshWolf();
      const p = await fighter({ health: 6 });
      const { c, entityId } = await join(p.token, p.characterId);
      await c.waitFor('combat.death', (m) => m.d.entityId === entityId, 30_000);
      await c.waitFor('player.vitals', (m) => m.d.dead && m.d.respawnAvailableAt !== null);
      const wolf = wolfEntity()!;
      c.send('target.set', { entityId: wolf.id });
      const a = c.send('combat.attack', { start: true });
      expect((await c.waitFor('error', (m) => m.ack === a)).d.code).toBe('YOU_ARE_DEAD');
      c.send('move.input', { position: { x: 2.3, y: 0, z: 11.5 }, rotationY: 0 });
      await c.waitFor('move.correction', (m) => m.d.reason === 'dead');
      const r1 = c.send('combat.respawn', {});
      const early = await c.waitFor('error', (m) => m.ack === r1);
      expect(['RESPAWN_NOT_READY']).toContain(early.d.code);
      await sleep(getGameData().raw.combatRules.playerRespawnDelayMs);
      c.send('combat.respawn', {});
      await c.waitFor('combat.state', (m) => m.d.reason === 'respawned');
      const alive = await c.waitFor(
        'player.vitals',
        (m) => !m.d.dead && m.d.health === m.d.maxHealth,
      );
      expect(alive.d.health).toBeGreaterThan(100);
      c.ws.close();
      await sleep(5_500); // linger expires -> state persisted
      const [row] = await handle.db
        .select()
        .from(schema.characters)
        .where(eq(schema.characters.id, p.characterId));
      expect(row!.currentHealth).toBeGreaterThan(100);
    },
  );

  it(
    'reconnect during combat re-attaches to the same fight with server-side health intact',
    { timeout: 60_000 },
    async () => {
      const wolf = await freshWolf();
      const p = await fighter({ sword: true });
      const first = await join(p.token, p.characterId);
      first.c.send('target.set', { entityId: wolf.id });
      first.c.send('combat.attack', { start: true });
      await first.c.waitFor('combat.damage', (m) => m.d.targetId === first.entityId);
      first.c.ws.terminate(); // network drop
      await sleep(300);
      expect(server.inWorldCount()).toBeGreaterThanOrEqual(1);
      const simHealth = zone().getPlayer(p.characterId)!.health;
      const second = await join(p.token, p.characterId);
      expect(second.entityId).toBe(first.entityId); // same in-world character
      const vitals = await second.c.waitFor('player.vitals');
      expect(vitals.d.health).toBeLessThanOrEqual(simHealth);
      expect(vitals.d.health).toBeLessThan(vitals.d.maxHealth);
      const snap = second.c.all('zone.snapshot').at(-1)!;
      const w = snap.d.entities.find((e) => e.id === wolf.id);
      expect(w?.health).toBe(zone().getEnemy(wolf.id)?.health ?? 0);
      expect(server.inWorldCount()).toBe(zone().playerCount());
      // finish the fight so later tests get a fresh wolf
      second.c.send('target.set', { entityId: wolf.id });
      second.c.send('combat.attack', { start: true });
      await second.c
        .waitFor('combat.death', (m) => m.d.entityId === wolf.id, 40_000)
        .catch(() => undefined);
      second.c.ws.close();
    },
  );

  it(
    'equipping a weapon (via the API path, another process) changes the simulation combat profile',
    { timeout: 60_000 },
    async () => {
      const p = await fighter({ pos: { x: -40, z: 40 } });
      const { c } = await join(p.token, p.characterId);
      expect(zone().getPlayer(p.characterId)!.weapon).toMatchObject({ min: 1, max: 3 });
      const sword = await adminGrantItem(ctx, {
        actor: ADMIN,
        characterId: p.characterId,
        templateId: 'weapon.sword.iron_longsword',
        quantity: 1,
        reason: 'test',
      });
      await moveItem(ctx, {
        accountId: p.accountId,
        characterId: p.characterId,
        request: {
          itemInstanceId: sword.instance.id,
          expectedVersion: sword.instance.version,
          to: { kind: 'equipped', slotId: 'main_hand' },
        },
      });
      const start = Date.now();
      while (zone().getPlayer(p.characterId)!.weapon.min !== 7 && Date.now() - start < 5000)
        await sleep(50);
      expect(zone().getPlayer(p.characterId)!.weapon).toMatchObject({
        min: 7,
        max: 13,
        attackSpeedMs: 2400,
      });

      c.ws.close();
    },
  );
});
