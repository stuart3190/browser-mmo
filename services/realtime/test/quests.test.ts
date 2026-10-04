import { afterAll, afterEach, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import { WebSocket } from 'ws';
import { and, eq } from 'drizzle-orm';
import { loadDotEnv } from '@mmo/config';
import { createDb, schema } from '@mmo/db';
import {
  DevAuthProvider,
  SessionService,
  adminGrantItem,
  createCharacter,
  createDomainContext,
  getBalances,
  recordKill,
} from '@mmo/domain';
import { seededRng } from '@mmo/game-data';
import type { ServerMessage } from '@mmo/networking';
import { PROTOCOL_VERSION, encodeClientMessage, parseServerMessage } from '@mmo/networking';
import { Metrics, createLogger } from '@mmo/server-kit';
import { uuidv7 } from '@mmo/shared';
import { ARENA, arenaGameData } from '@mmo/world/testing';
import { createRealtimeServer } from '../src/server';

/**
 * The quest loop over the real protocol: NPC interaction validated against the zone simulation,
 * accept, kill progress from the durable kill pipeline, pelt progress from the change feed,
 * reconnect and restart, turn-in with rewards exactly once.
 */

loadDotEnv();
const TEST_URL = process.env.TEST_DATABASE_URL!;
const handle = createDb({ url: TEST_URL, max: 8 });
const gameData = arenaGameData();
const ctx = createDomainContext({ db: handle.db, gameData, rng: seededRng(11) });
const sessions = new SessionService(1);
const Q = 'quest.greenvale.wolves_at_the_edge';
const WOLF = 'enemy.greenvale.grey_wolf';
const PELT = 'material.hide.wolf_pelt';
const ADMIN = { accountId: null, characterId: null };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Server = ReturnType<typeof createRealtimeServer>;
const running: Server[] = [];
async function boot() {
  const server = createRealtimeServer({
    ctx,
    sessions,
    logger: createLogger({ service: 'rt-quest-test', level: process.env.RT_LOG ?? 'silent' }),
    metrics: new Metrics(),
    zoneIds: [ARENA],
    tickHz: 20,
    allowedOrigins: ['http://localhost:5173'],
    lingerMs: 0,
    killRecoveryIntervalMs: 250,
    changeFeedUrl: TEST_URL,
    rng: seededRng(3),
  });
  await server.start('127.0.0.1', 0);
  running.push(server);
  return {
    server,
    url: `ws://127.0.0.1:${(server.http.address() as AddressInfo).port}/ws`,
    zone: () => server.zones.get(ARENA)!,
  };
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
    const seq = ++this.seq;
    this.ws.send(encodeClientMessage(t, seq, d as never));
    return seq;
  }
  all<T extends ServerMessage['t']>(t: T) {
    return this.messages.filter((m) => m.t === t) as Extract<ServerMessage, { t: T }>[];
  }
  async waitFor<T extends ServerMessage['t']>(
    t: T,
    pred: (m: Extract<ServerMessage, { t: T }>) => boolean = () => true,
    timeout = 10_000,
  ) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const m = this.all(t).find(pred);
      if (m) return m;
      await sleep(20);
    }
    throw new Error(`timed out waiting for ${t}`);
  }
  error(ack: number) {
    return this.waitFor('error', (m) => m.ack === ack).then((m) => m.d.code);
  }
}

async function player(pos = { x: -6, z: 8.5 }) {
  const { accountId } = await new DevAuthProvider(new Set()).authenticate(ctx, {
    username: `qt_${uuidv7().replace(/-/g, '').slice(-16)}`,
  });
  const name = `Qt${uuidv7()
    .replace(/[^a-f]/g, '')
    .slice(0, 12)}`;
  const ch = await createCharacter(ctx, { accountId, name, classId: 'class.warrior' });
  await handle.db
    .update(schema.characters)
    .set({ zoneId: ARENA, posX: pos.x, posZ: pos.z })
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
  await c.waitFor('quest.log');
  return c;
}

const questOf = (c: Client) =>
  c
    .all('quest.log')
    .at(-1)!
    .d.quests.find((q) => q.questId === Q)!;
const elderId = (b: Awaited<ReturnType<typeof boot>>) =>
  b
    .zone()
    .listEntities()
    .find((e) => e.kind === 'npc')!.id;
const row = async (characterId: string) =>
  (
    await handle.db
      .select()
      .from(schema.characterQuests)
      .where(
        and(
          eq(schema.characterQuests.characterId, characterId),
          eq(schema.characterQuests.questId, Q),
        ),
      )
  )[0];
/** A wolf kill credited to the character, through the server's durable kill pipeline. */
async function recordedKill(characterId: string) {
  await recordKill(handle.db, {
    killId: uuidv7(),
    zoneId: ARENA,
    enemyId: WOLF,
    spawnPointId: 'spawn.test.wolf',
    groupId: null,
    characterId,
    diedAt: new Date(),
    respawnAt: new Date(Date.now() - 1),
  });
}

describe('quest loop over the realtime protocol', { timeout: 60_000 }, () => {
  it('interaction is validated server-side (range, entity kind, existence)', async () => {
    const b = await boot();
    const far = await player({ x: 30, z: -30 });
    const c = await join(b.url, far);
    expect(await c.error(c.send('npc.interact', { entityId: elderId(b) }))).toBe('OUT_OF_RANGE');
    expect(await c.error(c.send('npc.interact', { entityId: 'e:99999' }))).toBe('INVALID_TARGET');
    const pickup = b
      .zone()
      .listEntities()
      .find((e) => e.kind === 'pickup')!.id;
    expect(await c.error(c.send('npc.interact', { entityId: pickup }))).toBe('INVALID_TARGET');
    expect(await c.error(c.send('quest.accept', { entityId: elderId(b), questId: Q }))).toBe(
      'OUT_OF_RANGE',
    );
    expect(await row(far.characterId)).toBeUndefined();
    // there is no message a client could use to report progress; unknown types are rejected
    c.ws.send(
      JSON.stringify({
        v: PROTOCOL_VERSION,
        t: 'quest.progress',
        seq: ++c.seq,
        d: { questId: Q, objectiveId: 'kill_wolves', current: 5 },
      }),
    );
    await c.waitFor('error', (m) => m.d.code === 'VALIDATION_FAILED');
    expect(await row(far.characterId)).toBeUndefined();
    c.ws.close();
  });

  it('accept -> kills + pelts progress (pushed) -> survives reconnect and restart -> turn in once', async () => {
    let b = await boot();
    const p = await player();
    let c = await join(b.url, p);
    expect(questOf(c).state).toBe('available');
    const elder = elderId(b);

    // dialogue offers the quest
    const s1 = c.send('npc.interact', { entityId: elder });
    const d1 = await c.waitFor('npc.dialogue', (m) => m.ack === s1);
    expect(d1.d).toMatchObject({ npcId: 'npc.greenvale.elder_maren', name: 'Elder Maren' });
    expect(d1.d.quests[0]).toMatchObject({ action: 'accept', quest: { questId: Q } });

    // turning in before accepting is rejected
    expect(await c.error(c.send('quest.turn_in', { entityId: elder, questId: Q }))).toBe(
      'QUEST_NOT_ACTIVE',
    );

    // accept
    const s2 = c.send('quest.accept', { entityId: elder, questId: Q });
    await c.waitFor('npc.dialogue', (m) => m.ack === s2);
    const accepted = await c.waitFor('quest.log', (m) =>
      m.d.events.some((e) => e.kind === 'accepted' && e.questId === Q),
    );
    expect(accepted.d.quests.find((q) => q.questId === Q)!.state).toBe('active');
    expect(await row(p.characterId)).toMatchObject({ status: 'active' });
    expect(await c.error(c.send('quest.accept', { entityId: elder, questId: Q }))).toBe(
      'QUEST_NOT_AVAILABLE',
    );

    // kill progress arrives from the durable kill pipeline (sweep path)
    await recordedKill(p.characterId);
    await recordedKill(p.characterId);
    await b.server.sweepKills();
    await b.server.rewardsIdle();
    await c.waitFor('quest.log', () => questOf(c).objectives[0]!.current === 2);
    expect(c.all('quest.log').some((m) => m.d.events.some((e) => e.kind === 'progress'))).toBe(
      true,
    );
    // a premature turn-in changes nothing
    expect(await c.error(c.send('quest.turn_in', { entityId: elder, questId: Q }))).toBe(
      'QUEST_INCOMPLETE',
    );

    // reconnect: state rebuilt from the database
    c.ws.close();
    await sleep(200);
    c = await join(b.url, p);
    expect(questOf(c).objectives[0]!.current).toBe(2);

    // restart: a brand-new server process sees the same state
    await b.server.stop();
    running.splice(running.indexOf(b.server), 1);
    b = await boot();
    for (let i = 0; i < 3; i++) await recordedKill(p.characterId);
    await b.server.rewardsIdle();
    c = await join(b.url, p);
    await c.waitFor('quest.log', () => questOf(c).objectives[0]!.current === 5);

    // pelts: granted by another process (admin), progress via the change feed; derived from inventory
    const peltsBefore = questOf(c).objectives[1]!.current;
    const need = 3 - peltsBefore;
    if (need > 0)
      await adminGrantItem(ctx, {
        actor: ADMIN,
        characterId: p.characterId,
        templateId: PELT,
        quantity: need,
        reason: 'quest test',
      });
    await c.waitFor('quest.log', () => questOf(c).state === 'ready_to_turn_in');
    if (need > 0)
      expect(c.all('quest.log').some((m) => m.d.events.some((e) => e.kind === 'ready'))).toBe(true);

    // turn in at a non-NPC entity: rejected
    const pickup = b
      .zone()
      .listEntities()
      .find((e) => e.kind === 'pickup')!.id;
    expect(await c.error(c.send('quest.turn_in', { entityId: pickup, questId: Q }))).toBe(
      'INVALID_TARGET',
    );

    // turn in (twice at once): exactly one succeeds
    const elder2 = elderId(b);
    const goldBefore = (await getBalances(handle.db, p.accountId, p.characterId)).find(
      (x) => x.currencyId === 'gold',
    )!.amount;
    const t1 = c.send('quest.turn_in', { entityId: elder2, questId: Q });
    const t2 = c.send('quest.turn_in', { entityId: elder2, questId: Q });
    const done = await c.waitFor('quest.completed');
    expect(done.d).toMatchObject({ questId: Q, xpGained: 300, gold: 250 });
    expect(done.d.items.map((i) => i.template.id)).toEqual(['accessory.cloak.wayfarer_cloak']);
    const second = await c.waitFor('error', (m) => m.ack === t1 || m.ack === t2);
    expect(second.d.code).toBe('RATE_LIMITED'); // overlapping DB work is rejected before execution
    await c.waitFor('quest.log', (m) => m.d.events.some((e) => e.kind === 'completed'));
    expect(questOf(c).state).toBe('completed');
    await c.waitFor('character.progress', (m) => m.d.xpGained === 300);
    const dialogue = await c.waitFor('npc.dialogue', (m) => m.ack === t1 || m.ack === t2);
    expect(dialogue.d.quests.find((entry) => entry.quest.questId === Q)).toMatchObject({
      action: null,
      quest: { state: 'completed' },
    });
    // Once the first action has finished, a replay still reaches the durable completion guard.
    expect(await c.error(c.send('quest.turn_in', { entityId: elder2, questId: Q }))).toBe(
      'QUEST_ALREADY_COMPLETED',
    );

    // DB matches what the client was told
    expect(await row(p.characterId)).toMatchObject({ status: 'completed' });
    const goldAfter = (await getBalances(handle.db, p.accountId, p.characterId)).find(
      (x) => x.currencyId === 'gold',
    )!.amount;
    expect(goldAfter).toBe(goldBefore + 250);
    const cloaks = await handle.db
      .select()
      .from(schema.itemInstances)
      .where(
        and(
          eq(schema.itemInstances.ownerCharacterId, p.characterId),
          eq(schema.itemInstances.templateId, 'accessory.cloak.wayfarer_cloak'),
        ),
      );
    expect(cloaks).toHaveLength(1);
    // replaying the turn-in later is still rejected and changes nothing
    expect(await c.error(c.send('quest.turn_in', { entityId: elder2, questId: Q }))).toBe(
      'QUEST_ALREADY_COMPLETED',
    );
    c.ws.close();
  });
});
