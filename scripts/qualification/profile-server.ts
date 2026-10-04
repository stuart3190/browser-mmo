/** Isolated qualification host. Never imported by a production entrypoint. */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServer } from 'node:http';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import {
  createDb,
  runMigrations,
  syncItemTemplates,
  ZoneOwnership,
} from '../../packages/db/src/index';
import { createDomainContext, SessionService } from '../../packages/domain/src/index';
import { getGameData, CollisionWorld } from '../../packages/game-data/src/index';
import { createLogger, Metrics } from '../../packages/server-kit/src/index';
import { ZoneSimulation } from '../../services/world/src/index';
import { NavGrid } from '../../services/world/src/navigation';
import { createRealtimeServer } from '../../services/realtime/src/server';
import { AccountSync } from '../../services/realtime/src/sync';
import { WebSocket } from 'ws';
const url = process.env.TEST_DATABASE_URL;
if (process.env.NODE_ENV !== 'test' || !url || !/^\/mmo_(load|qual)_/.test(new URL(url).pathname))
  throw new Error('Qualification requires NODE_ENV=test and isolated mmo_load_* / mmo_qual_* DB');
const series = new Map<
  string,
  { count: number; total: number; self: number; max: number; samples: number[] }
>();
let stack: { child: number }[] = [];
function observe(name: string, ms: number, self = ms) {
  const s = series.get(name) ?? { count: 0, total: 0, self: 0, max: 0, samples: [] };
  s.count++;
  s.total += ms;
  s.self += self;
  s.max = Math.max(s.max, ms);
  if (s.samples.length < 8192) s.samples.push(ms);
  else s.samples[s.count % 8192] = ms;
  series.set(name, s);
}
function wrap(proto: any, name: string, label: string, async = false) {
  if (process.env.PROFILE_METHODS === 'false') return;
  const original = proto[name];
  if (typeof original !== 'function') throw new Error(`Missing profile method ${name}`);
  proto[name] = function (...args: any[]) {
    const t = performance.now(),
      frame = { child: 0 };
    if (!async) stack.push(frame);
    try {
      const result = original.apply(this, args);
      if (async)
        return Promise.resolve(result).finally(() => observe(label, performance.now() - t));
      return result;
    } finally {
      if (!async) {
        const ms = performance.now() - t;
        stack.pop();
        if (stack.length) stack.at(-1)!.child += ms;
        observe(label, ms, ms - frame.child);
      }
    }
  };
}
for (const [method, label] of Object.entries({
  step: 'world.step',
  stepEnemies: 'world.enemies',
  stepPlayersCombat: 'world.playerCombat',
  stepRegenAndCombatFlags: 'world.regen',
  stepGroups: 'world.spawns',
  entitiesVisibleFrom: 'world.aoi',
  checkpoint: 'checkpoint.serialize',
  handleMove: 'world.move',
  steer: 'world.steer',
})) {
  if (typeof (ZoneSimulation.prototype as any)[method] === 'function')
    wrap(ZoneSimulation.prototype, method, label);
}
wrap(NavGrid.prototype, 'findPath', 'world.pathfinding');
for (const method of ['overlaps', 'sweepBlocked', 'hasLineOfSight', 'slide'])
  wrap(CollisionWorld.prototype, method, `world.collision.${method}`);
wrap(ZoneOwnership.prototype, 'commit', 'checkpoint.commit', true);
wrap(AccountSync.prototype, 'push', 'notify.enqueue');
wrap(AccountSync.prototype, 'fullState', 'notify.fullState', true);
wrap(WebSocket.prototype, 'send', 'ws.send');
const stringify = JSON.stringify;
if (process.env.PROFILE_METHODS !== 'false')
  JSON.stringify = function (...args: any[]) {
    const t = performance.now();
    try {
      return (stringify as any)(...args);
    } finally {
      observe('json.stringify', performance.now() - t);
    }
  } as typeof JSON.stringify;
const handle = createDb({ url, max: 12, applicationName: 'mmo-profile' });
await runMigrations(handle.db);
await syncItemTemplates(handle.db, getGameData());
const ctx = createDomainContext({ db: handle.db, gameData: getGameData() });
const metrics = new Metrics();
const server = createRealtimeServer({
  ctx,
  sessions: new SessionService(1),
  logger: createLogger({ service: 'profile', level: process.env.LOG_LEVEL ?? 'warn' }),
  metrics,
  zoneIds: ['zone.greenvale.meadows'],
  tickHz: 20,
  allowedOrigins: ['http://localhost:5173', 'http://127.0.0.1:4173'],
  changeFeedUrl: url,
  trustProxyLoopback: true,
  maxConnections: 256,
});
await server.start('127.0.0.1', Number(process.env.REALTIME_PORT ?? 4401));
const lag = monitorEventLoopDelay({ resolution: 10 });
lag.enable();
let start = performance.now(),
  cpu = process.cpuUsage(),
  elu = performance.eventLoopUtilization();
const quantile = (a: number[], p: number) =>
  a[Math.min(a.length - 1, Math.floor(a.length * p))] ?? 0;
const probe = setInterval(() => {
  const t = performance.now();
  void handle.pool
    .query('select 1')
    .then(() => observe('db.probe', performance.now() - t))
    .catch(() => observe('db.probeError', 1));
}, 1000);
const diagnostic = createServer((req, res) => {
  if (req.url === '/reset') {
    series.clear();
    stack = [];
    start = performance.now();
    cpu = process.cpuUsage();
    elu = performance.eventLoopUtilization();
    lag.reset();
    res.end('ok');
    return;
  }
  const elapsed = (performance.now() - start) / 1000,
    c = process.cpuUsage(cpu);
  const methods = Object.fromEntries(
    [...series].map(([name, s]) => {
      const a = [...s.samples].sort((a, b) => a - b);
      return [
        name,
        {
          count: s.count,
          totalMs: s.total,
          selfMs: s.self,
          maxMs: s.max,
          p50Ms: quantile(a, 0.5),
          p95Ms: quantile(a, 0.95),
          p99Ms: quantile(a, 0.99),
        },
      ];
    }),
  );
  const zones = [...server.zones.values()].map((z) => ({
    id: z.zone.id,
    tick: z.tick,
    entities: z.listEntities().length,
    enemies: z.enemyIds().length,
  }));
  res.setHeader('content-type', 'application/json');
  res.end(
    stringify({
      elapsed,
      methods,
      zones,
      diagnostics: server.diagnostics(),
      players: server.playerCount(),
      cpuCores: (c.user + c.system) / 1e6 / elapsed,
      rss: process.memoryUsage().rss,
      eventLoopUtilization: performance.eventLoopUtilization(elu).utilization,
      eventLoop: {
        p50Ms: lag.percentile(50) / 1e6,
        p95Ms: lag.percentile(95) / 1e6,
        p99Ms: lag.percentile(99) / 1e6,
        maxMs: lag.max / 1e6,
      },
    }),
  );
});
await new Promise<void>((resolve) =>
  diagnostic.listen(Number(process.env.PROFILE_PORT ?? 4402), '127.0.0.1', resolve),
);
console.log('PROFILE_READY');
async function stop() {
  clearInterval(probe);
  lag.disable();
  diagnostic.close();
  await server.stop();
  await handle.close();
  process.exit(0);
}
process.on('SIGTERM', () => void stop());
process.on('SIGINT', () => void stop());
