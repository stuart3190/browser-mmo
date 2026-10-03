import { loadRealtimeEnv, splitList } from '@mmo/config';
import { createDb } from '@mmo/db';
import { SessionService, createDomainContext } from '@mmo/domain';
import { getGameData } from '@mmo/game-data';
import { Metrics, createLogger } from '@mmo/server-kit';
import { createRealtimeServer } from './server';

const env = loadRealtimeEnv();
const logger = createLogger({ service: 'realtime', level: env.LOG_LEVEL });
const handle = createDb({
  url: env.DATABASE_URL,
  max: env.DATABASE_POOL_MAX,
  applicationName: 'mmo-realtime',
});
const ctx = createDomainContext({ db: handle.db, gameData: getGameData() });

const server = createRealtimeServer({
  ctx,
  // TTL is irrelevant here: the realtime service only resolves sessions created by the API.
  sessions: new SessionService(1),
  logger,
  metrics: new Metrics(),
  zoneIds: splitList(env.REALTIME_ZONES),
  tickHz: env.REALTIME_TICK_HZ,
  allowedOrigins: splitList(env.REALTIME_ALLOWED_ORIGINS),
});
await server.start(env.REALTIME_HOST, env.REALTIME_PORT);
logger.info(
  { host: env.REALTIME_HOST, port: env.REALTIME_PORT, zones: [...server.zones.keys()] },
  'realtime listening on /ws',
);

async function shutdown(signal: string) {
  logger.info({ signal }, 'shutting down');
  await server.stop();
  await handle.close();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
