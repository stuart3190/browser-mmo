import cors from '@fastify/cors';
import Fastify from 'fastify';
import { sql } from 'drizzle-orm';
import type { ApiEnv } from '@mmo/config';
import { splitList } from '@mmo/config';
import type { AuthProvider, DomainContext, SessionService } from '@mmo/domain';
import type { Logger, Metrics } from '@mmo/server-kit';
import { httpStatusFor } from '@mmo/server-kit';
import { DomainError, ErrorCode, uuidv7 } from '@mmo/shared';
import { bearerToken } from './http';
import { adminRoutes } from './routes/admin';
import { authRoutes } from './routes/auth';
import { characterRoutes } from './routes/characters';
import { marketplaceRoutes } from './routes/marketplace';

export interface AppDeps {
  ctx: DomainContext;
  env: Pick<ApiEnv, 'CORS_ORIGINS' | 'NODE_ENV'>;
  logger: Logger;
  metrics: Metrics;
  sessions: SessionService;
  /** Enabled auth providers keyed by id (only 'dev' today). */
  authProviders: ReadonlyMap<string, AuthProvider>;
}

const REQUEST_ID_RE = /^[A-Za-z0-9-]{8,64}$/;

export type App = Awaited<ReturnType<typeof buildApp>>;

export async function buildApp(deps: AppDeps) {
  const app = Fastify({
    loggerInstance: deps.logger,
    // Request IDs: honour a well-formed inbound X-Request-Id (from a proxy/client), else mint one.
    genReqId: (req) => {
      const h = req.headers['x-request-id'];
      return typeof h === 'string' && REQUEST_ID_RE.test(h) ? h : uuidv7();
    },
    requestIdHeader: false,
    bodyLimit: 64 * 1024,
    trustProxy: false,
  });

  const httpRequests = deps.metrics.counter(
    'http_requests_total',
    'HTTP requests by route and status',
  );

  await app.register(cors, {
    origin: splitList(deps.env.CORS_ORIGINS),
    allowedHeaders: ['authorization', 'content-type', 'x-request-id'],
    exposedHeaders: ['x-request-id'],
  });

  app.decorateRequest('session', null);
  app.addHook('onRequest', async (req, reply) => {
    reply.header('x-request-id', req.id);
    const token = bearerToken(req);
    req.session = token ? await deps.sessions.resolve(deps.ctx, token) : null;
  });
  app.addHook('onResponse', async (req, reply) => {
    httpRequests.inc({
      method: req.method,
      route: req.routeOptions.url ?? 'unknown',
      status: String(reply.statusCode),
    });
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof DomainError) {
      const status = httpStatusFor(err.code);
      if (status >= 500) req.log.error({ err }, 'domain error');
      return reply.status(status).send({
        error: { code: err.code, message: err.message, requestId: req.id, details: err.details },
      });
    }
    const fastifyErr = err as { statusCode?: number; validation?: unknown; message?: string };
    if (fastifyErr.statusCode && fastifyErr.statusCode < 500) {
      return reply.status(fastifyErr.statusCode).send({
        error: {
          code: ErrorCode.VALIDATION_FAILED,
          message: fastifyErr.message ?? 'Bad request',
          requestId: req.id,
        },
      });
    }
    req.log.error({ err }, 'unhandled error');
    return reply
      .status(500)
      .send({ error: { code: ErrorCode.INTERNAL, message: 'Internal error', requestId: req.id } });
  });
  app.setNotFoundHandler((req, reply) =>
    reply.status(404).send({
      error: { code: ErrorCode.NOT_FOUND, message: 'Route not found', requestId: req.id },
    }),
  );

  // --- Health & metrics (unauthenticated; bind metrics to a private network in production) ---
  app.get('/health/live', async () => ({ status: 'ok' }));
  app.get('/health/ready', async (_req, reply) => {
    try {
      await deps.ctx.db.execute(sql`select 1`);
      return { status: 'ok', checks: { database: 'ok' } };
    } catch {
      return reply.status(503).send({ status: 'unavailable', checks: { database: 'error' } });
    }
  });
  app.get('/metrics', async (_req, reply) =>
    reply.type('text/plain; version=0.0.4').send(deps.metrics.render()),
  );

  await app.register(authRoutes(deps), { prefix: '/v1' });
  await app.register(characterRoutes(deps), { prefix: '/v1' });
  await app.register(marketplaceRoutes(deps), { prefix: '/v1' });
  await app.register(adminRoutes(deps), { prefix: '/v1/admin' });
  return app;
}
