import { loadApiEnv, splitList } from '@mmo/config';
import { createDb } from '@mmo/db';
import {
  DevAuthProvider,
  PasswordAuthProvider,
  SessionService,
  createDomainContext,
  expireListings,
} from '@mmo/domain';
import type { AuthProvider } from '@mmo/domain';
import { getGameData } from '@mmo/game-data';
import { Metrics, createLogger } from '@mmo/server-kit';
import { buildApp } from './app';

const env = loadApiEnv();
const logger = createLogger({ service: 'api', level: env.LOG_LEVEL });
const handle = createDb({
  url: env.DATABASE_URL,
  max: env.DATABASE_POOL_MAX,
  applicationName: 'mmo-api',
});
const ctx = createDomainContext({ db: handle.db, gameData: getGameData() });

const authProviders = new Map<string, AuthProvider>();
if (env.AUTH_PASSWORD_LOGIN_ENABLED) authProviders.set('password', new PasswordAuthProvider());
if (env.AUTH_DEV_LOGIN_ENABLED) {
  authProviders.set(
    'dev',
    new DevAuthProvider(
      new Set(splitList(env.AUTH_DEV_ADMIN_USERNAMES).map((u) => u.toLowerCase())),
    ),
  );
  logger.warn('Dev login is ENABLED (never enable this in production)');
}

const app = await buildApp({
  ctx,
  env,
  logger,
  metrics: new Metrics(),
  sessions: new SessionService(env.SESSION_TTL_HOURS),
  authProviders,
  trustProxyLoopback: env.TRUST_PROXY_LOOPBACK,
});

// Background job: marketplace expiry sweep. Single-instance for now; with several API replicas
// this must move to a leader-elected worker (see docs/economy/marketplace.md).
let sweeping = false;
const sweep = setInterval(() => {
  if (sweeping) return;
  sweeping = true;
  expireListings(ctx)
    .then(
      (n) => n > 0 && logger.info({ expired: n }, 'expired marketplace listings'),
      (err: unknown) => logger.error({ err }, 'listing expiry sweep failed'),
    )
    .finally(() => {
      sweeping = false;
    });
}, 60_000);

await app.listen({ host: env.API_HOST, port: env.API_PORT });

async function shutdown(signal: string) {
  logger.info({ signal }, 'shutting down');
  clearInterval(sweep);
  await app.close();
  await handle.close();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
