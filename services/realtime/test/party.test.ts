import { afterAll, afterEach, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import { WebSocket } from 'ws';
import { eq } from 'drizzle-orm';
import { createDb, schema } from '@mmo/db';
import { DevAuthProvider, SessionService, createCharacter, createDomainContext } from '@mmo/domain';
import { seededRng } from '@mmo/game-data';
import type { ServerMessage } from '@mmo/networking';
import { encodeClientMessage, parseServerMessage } from '@mmo/networking';
import { Metrics, createLogger } from '@mmo/server-kit';
import { uuidv7 } from '@mmo/shared';
import { ARENA, arenaGameData } from '@mmo/world/testing';
import { createRealtimeServer } from '../src/server';
const handle = createDb({ url: process.env.TEST_DATABASE_URL!, max: 8 });
const ctx = createDomainContext({ db: handle.db, gameData: arenaGameData(), rng: seededRng(11) });
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

it('party protocol authenticates roles, rejects replays and recovers membership across reconnect and host restart', async () => {
  let host = await boot();
  const a = await player(),
    b = await player();
  let ca = await join(host.url, a),
    cb = await join(host.url, b);
  const seq = ca.send('party.invite', { characterId: b.characterId });
  const invitation = (await cb.waitFor('party.update', (m) => !!m.d.invitation)).d.invitation!;
  ca.ws.send(encodeClientMessage('party.invite', seq, { characterId: b.characterId }));
  expect(await ca.error(seq)).toBe('CONFLICT');
  cb.send('party.respond', { invitationId: invitation.id, accept: true });
  const id = (await ca.waitFor('party.update', (m) => m.d.members.length === 2)).d.partyId!;
  expect(
    await cb.error(cb.send('party.respond', { invitationId: invitation.id, accept: true })),
  ).toBe('CONFLICT');
  expect(await cb.error(cb.send('party.disband', { partyId: id }))).toBe('CONFLICT');
  expect(await ca.error(ca.send('party.leave', { partyId: uuidv7() }))).toBe('CONFLICT');
  cb.ws.close();
  await ca.waitFor('party.update', (m) =>
    m.d.members.some((x) => x.characterId === b.characterId && !x.online),
  );
  cb = await join(host.url, b);
  expect(cb.all('party.update').at(-1)!.d.partyId).toBe(id);
  await host.server.stop();
  running.splice(running.indexOf(host.server), 1);
  host = await boot();
  ca = await join(host.url, a);
  cb = await join(host.url, b);
  expect(
    (
      await cb.waitFor(
        'party.update',
        (m) => m.d.members.every((x) => x.online) && m.d.members.length === 2,
      )
    ).d.partyId,
  ).toBe(id);
  cb.messages = [];
  ca.send('party.disband', { partyId: id });
  await cb.waitFor('party.update', (m) => m.d.partyId === null);
  ca.ws.close();
  cb.ws.close();
}, 30_000);
