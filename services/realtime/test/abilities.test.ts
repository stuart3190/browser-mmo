import { afterAll, afterEach, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import { WebSocket } from 'ws';
import { eq } from 'drizzle-orm';
import { loadDotEnv } from '@mmo/config';
import { createDb, schema } from '@mmo/db';
import {
  DevAuthProvider,
  SessionService,
  adminGrantItem,
  createCharacter,
  createDomainContext,
  moveItem,
} from '@mmo/domain';
import { seededRng, xpToNextLevel } from '@mmo/game-data';
import type { ServerMessage } from '@mmo/networking';
import { PROTOCOL_VERSION, encodeClientMessage, parseServerMessage } from '@mmo/networking';
import { Metrics, createLogger } from '@mmo/server-kit';
import { uuidv7 } from '@mmo/shared';
import { ARENA, WOLF_HOME, arenaGameData } from '@mmo/world/testing';
import { createRealtimeServer } from '../src/server';

/** Class abilities over the real protocol: authority, cooldowns, unlocks, persistence. */

loadDotEnv();
const TEST_URL = process.env.TEST_DATABASE_URL!;
const handle = createDb({ url: TEST_URL, max: 8 });
const gameData = arenaGameData();
const ctx = createDomainContext({ db: handle.db, gameData, rng: seededRng(21) });
const sessions = new SessionService(1);
const HS = 'ability.warrior.heavy_strike';
const BS = 'ability.warrior.battle_strike';
const FB = 'ability.mage.firebolt';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Server = ReturnType<typeof createRealtimeServer>;
const running: Server[] = [];
async function boot() {
  const server = createRealtimeServer({
    ctx,
    sessions,
    logger: createLogger({ service: 'rt-ability-test', level: process.env.RT_LOG ?? 'silent' }),
    metrics: new Metrics(),
    zoneIds: [ARENA],
    tickHz: 20,
    allowedOrigins: ['http://localhost:5173'],
    lingerMs: 0,
    killRecoveryIntervalMs: 250,
    changeFeedUrl: TEST_URL,
    rng: seededRng(9),
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

async function player(classId: string, pos: { x: number; z: number }, xp = 0) {
  const { accountId } = await new DevAuthProvider(new Set()).authenticate(ctx, {
    username: `ab_${uuidv7().replace(/-/g, '').slice(-16)}`,
  });
  const name = `Ab${uuidv7()
    .replace(/[^a-f]/g, '')
    .slice(0, 12)}`;
  const ch = await createCharacter(ctx, { accountId, name, classId });
  await handle.db
    .update(schema.characters)
    .set({ zoneId: ARENA, posX: pos.x, posZ: pos.z, xp })
    .where(eq(schema.characters.id, ch.id));
  const { token } = await sessions.create(ctx, accountId, 'game_web');
  return { accountId, characterId: ch.id, token };
}

async function join(
  b: Awaited<ReturnType<typeof boot>>,
  p: { token: string; characterId: string },
) {
  const c = new Client(b.url);
  await c.opened;
  c.send('auth.hello', { token: p.token, characterId: p.characterId, client: 'game_web' });
  await c.waitFor('auth.ok');
  await c.waitFor('ability.state');
  return c;
}

/** Waits for an idle, full-health wolf (the arena wolf respawns 8 s after dying). */
async function wolf(b: Awaited<ReturnType<typeof boot>>, fresh = true) {
  const start = Date.now();
  while (Date.now() - start < 20_000) {
    for (const id of b.zone().enemyIds()) {
      const e = b.zone().getEnemy(id)!;
      if (
        fresh
          ? e.mode === 'idle' && e.health === e.maxHealth
          : e.mode !== 'dead' && e.mode !== 'dying'
      )
        return id;
    }
    await sleep(50);
  }
  throw new Error('no wolf');
}

const near = { x: WOLF_HOME.x, z: WOLF_HOME.z - 2.5 };

describe('class abilities over the realtime protocol', { timeout: 60_000 }, () => {
  it('Warrior: Heavy Strike hits once; spam, simultaneous and replayed requests never execute twice', async () => {
    const b = await boot();
    const w = await wolf(b);
    const p = await player('class.warrior', near);
    const c = await join(b, p);
    const st = c.all('ability.state').at(-1)!.d;
    expect(st.abilities.map((a) => a.abilityId)).toEqual(['ability.common.attack', HS, BS]);
    c.send('target.set', { entityId: w });
    await c.waitFor('combat.state', (m) => m.d.targetId === w);
    // 5 identical requests sent back-to-back (simultaneous) + one replayed sequence number
    const seqs = Array.from({ length: 5 }, () => c.send('ability.use', { abilityId: HS }));
    c.send('ability.use', { abilityId: HS }, seqs[0]);
    await c.waitFor('combat.damage', (m) => m.d.abilityId === HS);
    const errors = await Promise.all(seqs.slice(1).map((s) => c.error(s)));
    expect(errors.every((e) => e === 'ON_COOLDOWN')).toBe(true);
    await c.waitFor('error', (m) => m.d.code === 'CONFLICT');
    await sleep(300);
    const hits = c.all('combat.damage').filter((m) => m.d.abilityId === HS);
    expect(hits).toHaveLength(1);
    expect(b.zone().getEnemy(w)!.health).toBe(80 - hits[0]!.d.amount);
    // cooldown reported in server time
    const after = c.all('ability.state').at(-1)!.d;
    const hs = after.abilities.find((a) => a.abilityId === HS)!;
    expect(hs.readyAt - after.serverTime).toBeGreaterThan(5000);
    // a fake "damage" field is ignored: only the server computes damage
    const before = b.zone().getEnemy(w)!.health;
    c.ws.send(
      JSON.stringify({
        v: PROTOCOL_VERSION,
        t: 'ability.use',
        seq: ++c.seq,
        d: { abilityId: HS, damage: 9999 },
      }),
    );
    await sleep(300);
    expect(b.zone().getEnemy(w)!.health).toBeGreaterThanOrEqual(before - 60);
    // other class / locked
    expect(await c.error(c.send('ability.use', { abilityId: FB }))).toBe('ABILITY_NOT_AVAILABLE');
    expect(await c.error(c.send('ability.use', { abilityId: BS }))).toBe('ABILITY_LOCKED');
    c.ws.close();
  });

  it('Mage: Firebolt hits at range, Heavy Strike is refused, gear raises spell output inputs', async () => {
    const b = await boot();
    const w = await wolf(b);
    const p = await player('class.mage', { x: WOLF_HOME.x, z: WOLF_HOME.z - 18 });
    const c = await join(b, p);
    expect(
      c
        .all('ability.state')
        .at(-1)!
        .d.abilities.map((a) => a.abilityId),
    ).toEqual(['ability.common.attack', FB, 'ability.mage.flame_burst']);
    c.send('target.set', { entityId: w });
    await c.waitFor('combat.state', (m) => m.d.targetId === w);
    expect(await c.error(c.send('ability.use', { abilityId: HS }))).toBe('ABILITY_NOT_AVAILABLE');
    c.send('ability.use', { abilityId: FB });
    const hit = await c.waitFor('combat.damage', (m) => m.d.abilityId === FB);
    expect(hit.d.targetId).toBe(w);
    expect(await c.error(c.send('ability.use', { abilityId: FB }))).toBe('ON_COOLDOWN');
    // equipping a staff (API path, another process) updates the stats abilities scale with
    const intBefore = b.zone().getPlayer(p.characterId)!.stats.intellect ?? 0;
    const staff = await adminGrantItem(ctx, {
      actor: { accountId: null, characterId: null },
      characterId: p.characterId,
      templateId: 'weapon.staff.oak_staff',
      quantity: 1,
      reason: 'ability test',
    });
    await moveItem(ctx, {
      accountId: p.accountId,
      characterId: p.characterId,
      request: {
        itemInstanceId: staff.instance.id,
        expectedVersion: staff.instance.version,
        to: { kind: 'equipped', slotId: 'main_hand' },
      },
    });
    const start = Date.now();
    while (
      (b.zone().getPlayer(p.characterId)!.stats.spell_power ?? 0) === 0 &&
      Date.now() - start < 5000
    )
      await sleep(50);
    expect(b.zone().getPlayer(p.characterId)!.stats.spell_power).toBeGreaterThan(0);
    expect(b.zone().getPlayer(p.characterId)!.stats.intellect).toBeGreaterThan(intBefore);
    c.ws.close();
  });

  it('out-of-range casts are rejected; cooldowns survive logout/login (persisted)', async () => {
    const b = await boot();
    const w = await wolf(b);
    const p = await player('class.warrior', { x: WOLF_HOME.x, z: WOLF_HOME.z - 12 });
    let c = await join(b, p);
    c.send('target.set', { entityId: w });
    await c.waitFor('combat.state', (m) => m.d.targetId === w);
    expect(await c.error(c.send('ability.use', { abilityId: HS }))).toBe('OUT_OF_RANGE');
    // walk up (validated moves), strike, log out
    for (let z = WOLF_HOME.z - 11; z <= WOLF_HOME.z - 2.5; z += 0.5) {
      c.send('move.input', { position: { x: WOLF_HOME.x, y: 0, z }, rotationY: 0 });
      await sleep(110);
    }
    c.send('ability.use', { abilityId: HS });
    await c.waitFor('combat.damage', (m) => m.d.abilityId === HS);
    c.ws.close();
    await sleep(400);
    const [row] = await handle.db
      .select()
      .from(schema.characters)
      .where(eq(schema.characters.id, p.characterId));
    expect(row!.abilityCooldowns[HS]).toBeGreaterThan(Date.now());
    c = await join(b, p);
    const st = c.all('ability.state').at(-1)!.d;
    expect(st.abilities.find((a) => a.abilityId === HS)!.readyAt).toBe(row!.abilityCooldowns[HS]);
    c.send('target.set', { entityId: w });
    await c.waitFor('combat.state', (m) => m.d.targetId === w);
    expect(await c.error(c.send('ability.use', { abilityId: HS }))).toBe('ON_COOLDOWN');
    c.ws.close();
  });

  it('a level-up unlocks Battle Strike live; it was rejected before', async () => {
    const b = await boot();
    const w = await wolf(b);
    const need = xpToNextLevel(gameData.raw.experienceCurve, 1);
    const p = await player('class.warrior', near, need - 1);
    const c = await join(b, p);
    c.send('target.set', { entityId: w });
    await c.waitFor('combat.state', (m) => m.d.targetId === w);
    expect(await c.error(c.send('ability.use', { abilityId: BS }))).toBe('ABILITY_LOCKED');
    // one-shot the wolf so its kill reward levels us up
    const me = b.zone().getPlayer(p.characterId)!;
    b.zone().updateCombatProfile(
      p.characterId,
      {
        classId: 'class.warrior',
        level: me.level,
        stats: me.stats,
        maxHealth: me.maxHealth,
        weapon: { min: 500, max: 500, attackSpeedMs: 2000 },
      },
      Date.now(),
    );
    c.send('combat.attack', { start: true });
    await c.waitFor('character.progress', (m) => m.d.levelsGained > 0, 15_000);
    const unlocked = await c.waitFor('ability.state', (m) => m.d.newlyUnlocked.includes(BS));
    expect(unlocked.d.abilities.find((a) => a.abilityId === BS)!.unlocked).toBe(true);
    // usable on the next wolf
    const w2 = await wolf(b, false); // it may already be attacking us
    c.send('target.set', { entityId: w2 });
    await c.waitFor('combat.state', (m) => m.d.targetId === w2);
    await sleep(1100); // global cooldown from nothing; just be safe
    c.send('ability.use', { abilityId: BS });
    await c.waitFor('combat.damage', (m) => m.d.abilityId === BS, 15_000);
    c.ws.close();
  });
});
