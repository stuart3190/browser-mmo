/** TLS/password-auth workload against an isolated production-config deployment.
 * Operator fixture writes happen before admission; measured actions use public HTTP/WS only.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { WebSocket } from 'ws';
import { createDb, syncItemTemplates } from '../../packages/db/src/index';
import {
  createDomainContext,
  provisionPasswordAccount,
  createCharacter,
  adminGrantItem,
  acceptQuest,
} from '../../packages/domain/src/index';
import { getGameData } from '../../packages/game-data/src/index';
import { parseServerMessage } from '../../packages/networking/src/index';
const url = process.env.TEST_DATABASE_URL;
assert(url && /^\/mmo_load_/.test(new URL(url).pathname), 'isolated mmo_load_* database required');
const api = process.env.QUAL_URL ?? 'https://127.0.0.1:4443';
assert(
  api.startsWith('https://'),
  'TLS required; trust the qualification CA with NODE_EXTRA_CA_CERTS',
);
const handle = createDb({ url });
const gd = getGameData();
const collision = gd.collisionWorld('zone.greenvale.meadows');
const ctx = createDomainContext({ db: handle.db, gameData: gd });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const q = (a: number[], p: number) =>
  [...a].sort((a, b) => a - b)[Math.min(a.length - 1, Math.floor(a.length * p))] ?? 0;
const count = Number(process.env.LOAD_PLAYERS ?? 5),
  seconds = Number(process.env.LOAD_SECONDS ?? 120);
const clients: any[] = [];
const report: any = {
  at: new Date().toISOString(),
  players: count,
  intendedSeconds: seconds,
  transport: 'TLS, production password auth',
  errors: {},
  httpErrors: {},
  disconnects: 0,
  corrections: 0,
  bytesIn: 0,
  bytesOut: 0,
  damage: 0,
  playerHits: 0,
  kills: 0,
  vitals: 0,
  economyWrites: 0,
  sales: 0,
  skippedHttpCycles: 0,
};
let measuring = false;
const rtts: number[] = [],
  http: number[] = [],
  probes: number[] = [],
  tick: number[] = [],
  checkpoint: number[] = [],
  queues: number[] = [],
  sockets: number[] = [];
const increment = (obj: any, key: string) => (obj[key] = (obj[key] ?? 0) + 1);
async function request(path: string, token?: string, body?: unknown) {
  const t = performance.now();
  const r = await fetch(api + '/v1' + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  if (measuring) http.push(performance.now() - t);
  if (!r.ok) {
    if (measuring) increment(report.httpErrors, String(r.status));
    throw new Error(`HTTP ${r.status}: ${path}: ${await r.text()}`);
  }
  return r.status === 204 ? {} : ((await r.json()) as any);
}
function send(c: any, t: string, d: unknown) {
  if (c.ws.readyState !== WebSocket.OPEN) return;
  const raw = JSON.stringify({ v: 1, t, seq: ++c.seq, d });
  c.ws.send(raw);
  if (measuring) report.bytesOut += Buffer.byteLength(raw);
}
const metric = (s: string, n: string) => Number(new RegExp(`^${n} (.+)$`, 'm').exec(s)?.[1] ?? 0);
const metrics = () => fetch('http://127.0.0.1:4401/metrics').then((r) => r.text());
let movement: NodeJS.Timeout | undefined,
  actions: NodeJS.Timeout | undefined,
  sampling: NodeJS.Timeout | undefined;
try {
  await syncItemTemplates(handle.db, gd);
  assert.deepEqual((await request('/auth/providers')).providers, ['password']);
  const dev = await fetch(api + '/v1/auth/dev-login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'disabled', client: 'game_web' }),
  });
  assert.equal(dev.status, 404);
  assert.equal((await fetch(api + '/metrics')).status, 403);
  report.productionGates = { onlyPassword: true, devLogin404: true, privateMetrics403: true };
  for (let i = 0; i < count; i++) {
    const username = `qual_${Date.now()}_${i}`,
      password = randomBytes(24).toString('hex');
    const accountId = await provisionPasswordAccount(ctx, username, password);
    const char = await createCharacter(ctx, {
      accountId,
      name: 'Qual' + `${Date.now()}${i}`.replace(/\d/g, (d) => 'abcdefghij'[Number(d)]!),
      classId: 'class.warrior',
    });
    const item = await adminGrantItem(ctx, {
      characterId: char.id,
      templateId: 'weapon.sword.iron_longsword',
      quantity: 1,
      actor: { accountId: null, characterId: null },
      reason: 'isolated qualification equipment fixture',
    });
    const sale = await adminGrantItem(ctx, {
      characterId: char.id,
      templateId: 'weapon.sword.iron_longsword',
      quantity: 1,
      actor: { accountId: null, characterId: null },
      reason: 'isolated qualification sale fixture',
    });
    await acceptQuest(ctx, {
      characterId: char.id,
      questId: 'quest.greenvale.wolves_at_the_edge',
      npcId: 'npc.greenvale.elder_maren',
    });
    const checkpoint = (await handle.pool.query('select payload from zone_checkpoints limit 1'))
      .rows[0];
    const world = JSON.parse(JSON.parse(checkpoint.payload).simulation);
    const wolves = world.entities.$map
      .map((e: any) => e[1])
      .filter((e: any) => e.kind === 'enemy' && !e.dead);
    const pos = wolves[i % wolves.length]?.position;
    assert(pos, 'live wolf fixture required');
    await handle.pool.query('update characters set pos_x=$1,pos_z=$2 where id=$3', [
      pos.x,
      pos.z,
      char.id,
    ]);
    const { token } = await request('/auth/password-login', undefined, {
      username,
      password,
      client: 'game_web',
    });
    const items = (await request(`/characters/${char.id}/items`, token)).items;
    const backpack = items.containers.find((c: any) => c.container.kind === 'backpack').container
      .id;
    const vault = items.containers.find((c: any) => c.container.kind === 'character_vault')
      .container.id;
    const c: any = {
      id: char.id,
      token,
      itemId: item.instance.id,
      saleId: sale.instance.id,
      backpack,
      vault,
      seq: 0,
      entities: new Map(),
      pos: { ...pos },
      health: 1,
      target: null,
      actionAt: 0,
      economyBusy: false,
      economyPhase: 0,
      sold: false,
    };
    const ws = new WebSocket(api.replace('https:', 'wss:') + '/ws', { origin: api });
    c.ws = ws;
    clients.push(c);
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(Error('admission timeout')), 10000);
      ws.on('error', reject);
      ws.on('close', () => {
        if (measuring) report.disconnects++;
      });
      ws.on('open', () =>
        send(c, 'auth.hello', { token, characterId: char.id, client: 'game_web' }),
      );
      ws.on('message', (raw) => {
        if (measuring) report.bytesIn += Buffer.byteLength(raw.toString());
        const p = parseServerMessage(raw.toString());
        if (!p.ok) {
          increment(report.errors, 'schema');
          return;
        }
        const m: any = p.message;
        if (m.t === 'auth.ok') c.entityId = m.d.entityId;
        if (m.t === 'zone.snapshot') {
          for (const e of m.d.entities) c.entities.set(e.id, e);
          c.pos = { ...c.entities.get(c.entityId).position };
          clearTimeout(timeout);
          resolve();
        }
        if (m.t === 'entity.spawn') c.entities.set(m.d.entity.id, m.d.entity);
        if (m.t === 'entity.despawn') c.entities.delete(m.d.entityId);
        if (m.t === 'world.moves')
          for (const [id, x, y, z] of m.d.moves) {
            const e = c.entities.get(id);
            if (e) e.position = { x, y, z };
          }
        if (m.t === 'move.correction') {
          c.pos = { ...m.d.position };
          if (measuring) report.corrections++;
        }
        if (m.t === 'player.vitals') {
          c.health = m.d.health;
          if (measuring) report.vitals++;
        }
        if (m.t === 'combat.damage') {
          if (measuring) {
            report.damage++;
            if (m.d.targetId === c.entityId) report.playerHits++;
          }
          const e = c.entities.get(m.d.targetId);
          if (e) e.health = m.d.targetHealth;
        }
        if (m.t === 'combat.death') {
          const e = c.entities.get(m.d.entityId);
          if (e) e.dead = true;
          if (measuring) report.kills++;
        }
        if (m.t === 'pong' && measuring) rtts.push(Date.now() - m.d.clientTime);
        if (m.t === 'error' && measuring) increment(report.errors, m.d.code + ': ' + m.d.message);
      });
    });
    await sleep(2200); // real shared-IP login/upgrade admission limits; no spoofed forwarding headers
  }
  const before = await metrics(),
    started = performance.now();
  report.measuredAt = new Date().toISOString();
  measuring = true;
  movement = setInterval(() => {
    for (const c of clients) {
      if (c.health <= 0) continue;
      const enemies = [...c.entities.values()].filter(
        (e: any) => e.kind === 'enemy' && !e.dead && e.health > 0,
      ) as any[];
      enemies.sort(
        (a, b) =>
          Math.hypot(a.position.x - c.pos.x, a.position.z - c.pos.z) -
          Math.hypot(b.position.x - c.pos.x, b.position.z - c.pos.z),
      );
      const e = enemies[0];
      if (!e) continue;
      const dx = e.position.x - c.pos.x,
        dz = e.position.z - c.pos.z,
        d = Math.hypot(dx, dz);
      if (d > 1.4) {
        const next = collision.slide(
          c.pos,
          { x: c.pos.x + (dx / d) * Math.min(0.2, d), z: c.pos.z + (dz / d) * Math.min(0.2, d) },
          0.45,
        );
        c.pos = { ...next, y: 0 };
      }
      send(c, 'move.input', { position: c.pos, rotationY: Math.atan2(dx, dz) });
      if (c.target !== e.id) {
        c.target = e.id;
        send(c, 'target.set', { entityId: e.id });
      }
      if (d < 2 && Date.now() - c.actionAt > 8500) {
        send(c, 'combat.attack', { start: true });
        send(c, 'ability.use', { abilityId: 'ability.warrior.heavy_strike' });
        c.actionAt = Date.now();
      }
    }
  }, 100);
  actions = setInterval(() => {
    for (const c of clients) {
      send(c, 'ping', { clientTime: Date.now() });
      if (c.economyBusy) {
        report.skippedHttpCycles++;
        continue;
      }
      c.economyBusy = true;
      void (async () => {
        const items = (await request(`/characters/${c.id}/items`, c.token)).items;
        const equipped = [
          ...Object.values(items.equipment.slots),
          ...items.containers.flatMap((v: any) => v.items),
        ].find((x: any) => x.instance.id === c.itemId) as any;
        assert(equipped, 'fixture item missing');
        const to =
          c.economyPhase % 3 === 0
            ? { kind: 'equipped', slotId: 'main_hand' }
            : { kind: 'container', containerId: c.economyPhase % 3 === 1 ? c.vault : c.backpack };
        await request(`/characters/${c.id}/items/move`, c.token, {
          itemInstanceId: c.itemId,
          expectedVersion: equipped.instance.version,
          to,
        });
        report.economyWrites++;
        c.economyPhase++;
        if (!c.sold && count > 1) {
          c.sold = true;
          const listing = (
            await request('/marketplace/listings', c.token, {
              characterId: c.id,
              itemInstanceId: c.saleId,
              price: 10,
              durationHours: 24,
            })
          ).listing;
          const buyer = clients[(clients.indexOf(c) + 1) % count];
          await request(`/marketplace/listings/${listing.id}/buy`, buyer.token, {
            characterId: buyer.id,
            expectedPrice: 10,
          });
          report.sales++;
        }
      })()
        .catch((e) => increment(report.httpErrors, String(e)))
        .finally(() => (c.economyBusy = false));
    }
  }, 3000);
  sampling = setInterval(() => {
    void (async () => {
      const t = performance.now();
      await handle.pool.query('select 1');
      probes.push(performance.now() - t);
      const m = await metrics();
      tick.push(metric(m, 'world_tick_ms'));
      checkpoint.push(metric(m, 'world_checkpoint_ms'));
      queues.push(metric(m, 'world_outbound_queue_bytes'));
      sockets.push(metric(m, 'world_socket_buffer_bytes'));
    })().catch((e) => increment(report.errors, String(e)));
  }, 1000);
  await sleep(seconds * 1000);
  clearInterval(movement);
  clearInterval(actions);
  clearInterval(sampling);
  while (clients.some((c) => c.economyBusy)) await sleep(50);
  const after = await metrics();
  const elapsed = (performance.now() - started) / 1000;
  measuring = false;
  Object.assign(report, {
    elapsedSeconds: elapsed,
    simulationHz:
      (metric(after, 'world_ticks_total') - metric(before, 'world_ticks_total')) / elapsed,
    skippedSlots:
      metric(after, 'world_tick_slots_skipped_total') -
      metric(before, 'world_tick_slots_skipped_total'),
    cpuCores:
      (metric(after, 'process_cpu_seconds') - metric(before, 'process_cpu_seconds')) / elapsed,
    rssBytes: metric(after, 'process_rss_bytes'),
    rttMs: { p50: q(rtts, 0.5), p95: q(rtts, 0.95), p99: q(rtts, 0.99), samples: rtts.length },
    httpMs: { p95: q(http, 0.95), samples: http.length },
    dbProbeMs: { p95: q(probes, 0.95), p99: q(probes, 0.99) },
    sampledTickP95Ms: q(tick, 0.95),
    sampledCheckpointP95Ms: q(checkpoint, 0.95),
    sampledQueuePeak: Math.max(0, ...queues),
    sampledSocketPeak: Math.max(0, ...sockets),
  });
  report.db = (
    await handle.pool.query(
      "select (select count(*) from kill_events where status='rewarded') rewarded,(select count(*) from kill_rewards) rewards,(select count(*) from marketplace_transactions) sales,(select count(*) from item_history) history",
    )
  ).rows[0];
  // Deployed logout/revocation must disconnect a real socket and reject the old bearer token.
  const c = clients[0];
  const closed = new Promise<number>((resolve, reject) => {
    const t = setTimeout(() => reject(Error('revocation did not disconnect')), 6000);
    c.ws.once('close', (code: number) => {
      clearTimeout(t);
      resolve(code);
    });
  });
  await request('/auth/logout', c.token, {});
  report.revocationCloseCode = await closed;
  assert(
    (await fetch(api + '/v1/me', { headers: { authorization: `Bearer ${c.token}` } })).status ===
      401,
  );
  report.productionGates.logoutDisconnectAndBearerRejection = true;
  console.log(JSON.stringify(report, null, 2));
  await writeFile(
    process.env.LOAD_REPORT ?? '/tmp/mmo-production-load.json',
    JSON.stringify(report, null, 2),
  );
} finally {
  clearInterval(movement);
  clearInterval(actions);
  clearInterval(sampling);
  for (const c of clients) c.ws.close();
  await handle.close();
}
