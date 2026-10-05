import { afterAll, afterEach, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import { WebSocket } from 'ws';
import { eq } from 'drizzle-orm';
import { loadDotEnv } from '@mmo/config';
import { createDb, schema } from '@mmo/db';
import { DevAuthProvider, SessionService, createCharacter, createDomainContext } from '@mmo/domain';
import { GameData, seededRng } from '@mmo/game-data';
import type { ServerMessage } from '@mmo/networking';
import { PROTOCOL_VERSION, encodeClientMessage, parseServerMessage } from '@mmo/networking';
import { Metrics, createLogger } from '@mmo/server-kit';
import { uuidv7 } from '@mmo/shared';
import { ARENA, arenaGameData } from '@mmo/world/testing';
import { createRealtimeServer } from '../src/server';

/**
 * Authoritative exploration over the real protocol, with a small arena visit fixture.
 * Real server acceptance/visit credit, crash recovery and forged-message rejection.
 */

loadDotEnv();
const TEST_URL = process.env.TEST_DATABASE_URL!;
const handle = createDb({ url: TEST_URL, max: 8 });
const raw = structuredClone(arenaGameData().raw);
raw.zones
  .find((z) => z.id === ARENA)!
  .landmarks.push({
    id: 'landmark.test.visit',
    name: 'Test visit',
    position: { x: -6, y: 0, z: 8.5 },
  });
const fixture = raw.quests.find((q) => q.id === 'quest.greenvale.well_records')!;
fixture.objectives = [
  {
    id: 'visit',
    kind: 'explore',
    zoneId: ARENA,
    areaId: 'landmark.test.visit',
    label: 'Visit the stone',
  },
];
fixture.prerequisites = [];
fixture.minLevel = 1;
const gameData = GameData.load(raw);
const ctx = createDomainContext({ db: handle.db, gameData, rng: seededRng(11) });
const sessions = new SessionService(1);
const Q = 'quest.greenvale.well_records';
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

it('authoritative visit after acceptance publishes progress, reconnect/restart retain it and forged explore packets cannot credit', async () => {
  let b = await boot();
  const p = await player();
  let c = await join(b.url, p);
  const elder = b
    .zone()
    .listEntities()
    .find((e) => e.kind === 'npc')!.id;
  c.send('quest.accept', { entityId: elder, questId: Q });
  await c.waitFor(
    'quest.log',
    (m) => m.d.quests.find((q) => q.questId === Q)?.state === 'ready_to_turn_in',
  );
  const rows = await handle.db
    .select()
    .from(schema.characterQuests)
    .where(eq(schema.characterQuests.characterId, p.characterId));
  expect(rows.find((q) => q.questId === Q)!.progress).toEqual({ visit: 1 });
  c.ws.close();
  await sleep(100);
  await b.server.simulateCrash();
  b = await boot();
  c = await join(b.url, p);
  expect(
    c
      .all('quest.log')
      .at(-1)!
      .d.quests.find((q) => q.questId === Q)?.state,
  ).toBe('ready_to_turn_in');
  // There is no exploration completion message in the protocol.
  c.ws.send(
    JSON.stringify({
      v: PROTOCOL_VERSION,
      t: 'quest.explore',
      seq: ++c.seq,
      d: { questId: Q, areaId: 'landmark.test.visit' },
    }),
  );
  await c.waitFor('error', (m) => m.d.code === 'VALIDATION_FAILED');
  c.ws.close();
});
