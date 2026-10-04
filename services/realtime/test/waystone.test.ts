import { afterAll, afterEach, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import { WebSocket } from 'ws';
import { eq } from 'drizzle-orm';
import { createDb, schema } from '@mmo/db';
import {
  DevAuthProvider,
  SessionService,
  createCharacter,
  createDomainContext,
  acceptQuest,
} from '@mmo/domain';
import { seededRng, DEMO_ZONE_ID as ARENA, getGameData } from '@mmo/game-data';
import type { ServerMessage } from '@mmo/networking';
import { encodeClientMessage, parseServerMessage } from '@mmo/networking';
import { Metrics, createLogger } from '@mmo/server-kit';
import { uuidv7 } from '@mmo/shared';
import { createRealtimeServer } from '../src/server';
const handle = createDb({ url: process.env.TEST_DATABASE_URL!, max: 8 });
const ctx = createDomainContext({ db: handle.db, gameData: getGameData(), rng: seededRng(11) });
const sessions = new SessionService(1);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const running: ReturnType<typeof createRealtimeServer>[] = [];
async function boot() {
  const server = createRealtimeServer({
    ctx,
    sessions,
    logger: createLogger({ service: 'party-test', level: 'silent' }),
    metrics: new Metrics(),
    zoneIds: [ARENA],
    tickHz: 20,
    allowedOrigins: ['http://localhost:5173'],
    lingerMs: 0,
  });
  await server.start('127.0.0.1', 0);
  running.push(server);
  return { server, url: `ws://127.0.0.1:${(server.http.address() as AddressInfo).port}/ws` };
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
  await c.waitFor('character.progress');
  await c.waitFor('party.update');
  return c;
}

it('Waystone talk must reach the real NPC and advances only the speaking character once', async () => {
  const host = await boot();
  const far = await player(),
    near = await player({ x: -8, z: -90 });
  const q = 'quest.greenvale.old_waystone';
  for (const p of [far, near]) {
    await handle.db
      .update(schema.characters)
      .set({ level: 2 })
      .where(eq(schema.characters.id, p.characterId));
    await handle.db.insert(schema.characterQuests).values({
      characterId: p.characterId,
      questId: 'quest.greenvale.wolves_at_the_edge',
      status: 'completed',
      acceptedAt: new Date(),
      progress: { kill_wolves: 5 },
      completedAt: new Date(),
      rewardedAt: new Date(),
      turnInId: uuidv7(),
    });
    await acceptQuest(ctx, {
      characterId: p.characterId,
      questId: q,
      npcId: 'npc.greenvale.elder_maren',
    });
  }
  const a = await join(host.url, far),
    b = await join(host.url, near);
  const rill = host.server.zones
    .get(ARENA)!
    .listEntities()
    .find((e) => e.refId === 'npc.greenvale.keeper_rill')!.id;
  expect(await a.error(a.send('npc.interact', { entityId: rill }))).toBe('OUT_OF_RANGE');
  const talk1 = b.send('npc.interact', { entityId: rill });
  await b.waitFor('quest.log', (m) =>
    m.d.quests.some((v) => v.questId === q && v.state === 'ready_to_turn_in'),
  );
  expect(
    a
      .all('quest.log')
      .at(-1)!
      .d.quests.find((v) => v.questId === q)!.state,
  ).toBe('active');
  await b.waitFor('npc.dialogue', (m) => m.ack === talk1);
  const talk2 = b.send('npc.interact', { entityId: rill });
  await b.waitFor('npc.dialogue', (m) => m.ack === talk2);
  expect(await b.error(b.send('quest.turn_in', { entityId: rill, questId: q }))).toBe('WRONG_NPC');
  a.ws.close();
  b.ws.close();
}, 30_000);
