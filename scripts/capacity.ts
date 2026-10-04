/** Real HTTP + WS + PostgreSQL workload; isolated disposable database only.
 * Run service processes separately, then TEST_DATABASE_URL=... LOAD_URL=http://127... pnpm exec tsx scripts/capacity.ts
 */
import { performance } from 'node:perf_hooks';
import { writeFile } from 'node:fs/promises';
import { WebSocket } from 'ws';
import { createDb } from '../packages/db/src/index';
import {
  createCharacter,
  createDomainContext,
  DevAuthProvider,
  SessionService,
} from '../packages/domain/src/index';
import { getGameData } from '../packages/game-data/src/index';
import { encodeClientMessage, parseServerMessage } from '../packages/networking/src/index';
const dbUrl = process.env.TEST_DATABASE_URL;
if (!dbUrl || !new URL(dbUrl).pathname.startsWith('/mmo_load_'))
  throw new Error('TEST_DATABASE_URL must be a disposable mmo_load_* database');
const api = process.env.LOAD_API_URL ?? 'http://127.0.0.1:4400';
const rt = process.env.LOAD_WS_URL ?? 'ws://127.0.0.1:4401/ws';
const duration = Number(process.env.LOAD_SECONDS ?? 60);
const sizes = (process.env.LOAD_PLAYERS ?? '10,25,50').split(',').map(Number);
const handle = createDb({ url: dbUrl });
const ctx = createDomainContext({ db: handle.db, gameData: getGameData() });
const sessions = new SessionService(1);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const percentile = (a: number[], p: number) =>
  [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))] ?? 0;
const results = [];
try {
  for (const count of sizes) {
    let bytes = 0,
      messages = 0,
      corrections = 0,
      errors = 0,
      disconnects = 0,
      httpErrors = 0;
    const rtts: number[] = [],
      httpTimes: number[] = [],
      ticks: number[] = [],
      checkpoints: number[] = [];
    const clients: {
      ws: InstanceType<typeof WebSocket>;
      token: string;
      id: string;
      seq: number;
      phase: number;
      ip: string;
    }[] = [];
    const startProvision = Date.now();
    for (let i = 0; i < count; i++) {
      const suffix = `${startProvision}${i}`;
      const { accountId } = await new DevAuthProvider(new Set()).authenticate(ctx, {
        username: `load_${suffix}`,
      });
      const name = 'Load' + suffix.replace(/[0-9]/g, (c) => 'abcdefghij'[Number(c)]!);
      const char = await createCharacter(ctx, { accountId, name, classId: 'class.warrior' });
      const { token } = await sessions.create(ctx, accountId, 'game_web');
      // Stagger admission through the real configured upgrade limits. No bypasses.
      const ip = `198.18.0.${i + 1}`;
      const ws = new WebSocket(rt, {
        origin: 'http://localhost:5173',
        headers: { 'x-real-ip': ip },
      });
      await new Promise<void>((resolve, reject) => {
        ws.once('open', resolve);
        ws.once('error', reject);
      });
      const c = { ws, token, id: char.id, seq: 1, phase: 0, ip };
      clients.push(c);
      const joined = new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Admission timeout')), 10000);
        ws.on('message', (raw) => {
          bytes += Buffer.byteLength(raw.toString());
          messages++;
          const parsed = parseServerMessage(raw.toString());
          if (!parsed.ok) {
            errors++;
            return;
          }
          const m = parsed.message;
          if (m.t === 'zone.snapshot') {
            clearTimeout(timer);
            resolve();
          }
          if (m.t === 'pong') rtts.push(Date.now() - m.d.clientTime);
          if (m.t === 'move.correction') corrections++;
          if (m.t === 'error') errors++;
        });
      });
      ws.on('close', () => disconnects++);
      ws.send(
        encodeClientMessage('auth.hello', c.seq, {
          token,
          characterId: char.id,
          client: 'game_web',
        }),
      );
      await joined;
      await sleep(550);
    }
    bytes = messages = corrections = errors = 0;
    rtts.length = 0;
    const move = setInterval(() => {
      for (const c of clients)
        if (c.ws.readyState === WebSocket.OPEN) {
          c.phase += 0.1;
          c.ws.send(
            encodeClientMessage('move.input', ++c.seq, {
              position: { x: Math.sin(c.phase) * 2, y: 0, z: -8 + Math.cos(c.phase) * 2 - 2 },
              rotationY: c.phase,
            }),
          );
        }
    }, 100);
    let httpBusy = false;
    const requests = setInterval(() => {
      for (const c of clients)
        if (c.ws.readyState === WebSocket.OPEN)
          c.ws.send(encodeClientMessage('ping', ++c.seq, { clientTime: Date.now() }));
      if (httpBusy) return;
      httpBusy = true;
      void (async () => {
        for (const c of clients) {
          const t = performance.now();
          const response = await fetch(`${api}/v1/characters/${c.id}/items`, {
            headers: { authorization: `Bearer ${c.token}`, 'x-forwarded-for': c.ip },
          });
          if (!response.ok) httpErrors++;
          await response.arrayBuffer();
          httpTimes.push(performance.now() - t);
        }
      })()
        .catch(() => {
          httpErrors++;
        })
        .finally(() => {
          httpBusy = false;
        });
    }, 2000);
    const samples = setInterval(() => {
      void fetch(rt.replace('ws:', 'http:').replace('/ws', '/metrics'))
        .then((r) => r.text())
        .then((txt) => {
          ticks.push(Number(/^world_tick_ms (.+)$/m.exec(txt)?.[1] ?? 0));
          checkpoints.push(Number(/^world_checkpoint_ms (.+)$/m.exec(txt)?.[1] ?? 0));
        });
    }, 1000);
    const beforeMetrics = await (
      await fetch(rt.replace('ws:', 'http:').replace('/ws', '/metrics'))
    ).text();
    const metric = (txt: string, key: string) =>
      Number(new RegExp(`^${key} (.+)$`, 'm').exec(txt)?.[1] ?? 0);
    const started = Date.now();
    await sleep(duration * 1000);
    clearInterval(move);
    clearInterval(requests);
    clearInterval(samples);
    while (httpBusy) await sleep(20);
    const afterMetrics = await (
      await fetch(rt.replace('ws:', 'http:').replace('/ws', '/metrics'))
    ).text();
    const result = {
      effectiveTickHz:
        (metric(afterMetrics, 'world_ticks_total') - metric(beforeMetrics, 'world_ticks_total')) /
        duration,
      serverCpuCores:
        (metric(afterMetrics, 'process_cpu_seconds') -
          metric(beforeMetrics, 'process_cpu_seconds')) /
        duration,
      serverRssBytes: metric(afterMetrics, 'process_rss_bytes'),
      players: count,
      seconds: (Date.now() - started) / 1000,
      rttP95Ms: percentile(rtts, 0.95),
      rttP99Ms: percentile(rtts, 0.99),
      httpP95Ms: percentile(httpTimes, 0.95),
      tickP95Ms: percentile(ticks, 0.95),
      checkpointP95Ms: percentile(checkpoints, 0.95),
      bytes,
      bytesPerPlayerSecond: bytes / count / duration,
      messages,
      corrections,
      errors,
      httpErrors,
      disconnects,
      pingSamples: rtts.length,
      httpSamples: httpTimes.length,
    };
    results.push(result);
    console.log(JSON.stringify(result));
    for (const c of clients) c.ws.close();
    await sleep(12000);
  }
  await writeFile(
    process.env.LOAD_REPORT ?? '/tmp/mmo-capacity.json',
    JSON.stringify({ at: new Date().toISOString(), duration, results }, null, 2),
  );
} finally {
  await handle.close();
}
