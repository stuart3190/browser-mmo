import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { z } from 'zod';

/**
 * Environment configuration.
 *
 * - Values come from process.env, optionally pre-populated from the repo-root `.env` file.
 * - Every service declares exactly the variables it uses through a Zod schema and fails fast
 *   on startup if any are missing or malformed.
 * - Secrets have NO defaults. `.env.example` documents every variable.
 */

const NodeEnvSchema = z.enum(['development', 'test', 'production']).default('development');
const LogLevelSchema = z
  .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
  .default('info');
const boolFromString = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

export const CommonEnvSchema = z.object({
  NODE_ENV: NodeEnvSchema,
  LOG_LEVEL: LogLevelSchema,
  DATABASE_URL: z.url(),
  TRUST_PROXY_LOOPBACK: boolFromString.default(false),
  /** Pool size per process. */
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),
});

export const ApiEnvSchema = CommonEnvSchema.extend({
  API_HOST: z.string().default('127.0.0.1'),
  API_PORT: z.coerce.number().int().positive().default(4000),
  /** Comma-separated list of browser origins allowed to call the API. */
  CORS_ORIGINS: z.string().default('http://localhost:5173,http://localhost:5174'),
  SESSION_TTL_HOURS: z.coerce
    .number()
    .int()
    .positive()
    .default(24 * 7),
  /** Dev auth lets anyone log in by username. MUST be false in production (enforced). */
  AUTH_DEV_LOGIN_ENABLED: boolFromString.default(false),
  AUTH_PASSWORD_LOGIN_ENABLED: boolFromString.default(false),
  /** Usernames that dev-login promotes to admin (dev only). Comma separated. */
  AUTH_DEV_ADMIN_USERNAMES: z.string().default(''),
});
export type ApiEnv = z.infer<typeof ApiEnvSchema>;

export const RealtimeEnvSchema = CommonEnvSchema.extend({
  REALTIME_HOST: z.string().default('127.0.0.1'),
  REALTIME_PORT: z.coerce.number().int().positive().default(4001),
  REALTIME_ALLOWED_ORIGINS: z.string().default('http://localhost:5173'),
  REALTIME_TICK_HZ: z.coerce.number().int().min(1).max(60).default(20),
  REALTIME_MAX_CONNECTIONS: z.coerce.number().int().min(1).max(256).default(5),
  /** Zones hosted by this realtime process (comma separated). */
  REALTIME_ZONES: z.string().default('zone.greenvale.meadows'),
});
export type RealtimeEnv = z.infer<typeof RealtimeEnvSchema>;

/** Walks up from cwd to find the monorepo root `.env` (the directory holding pnpm-workspace.yaml). */
function findRootEnvFile(start: string): string | undefined {
  let dir = start;
  for (let i = 0; i < 8; i++) {
    if (existsSync(resolve(dir, 'pnpm-workspace.yaml'))) {
      const file = resolve(dir, '.env');
      return existsSync(file) ? file : undefined;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

/** Minimal .env parser (KEY=VALUE, # comments, optional quotes). Existing env vars win. */
export function loadDotEnv(cwd: string = process.cwd()): void {
  const file = findRootEnvFile(cwd);
  if (!file) return;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

export function parseEnv<S extends z.ZodType>(
  schema: S,
  source: Record<string, string | undefined> = process.env,
): z.infer<S> {
  const result = schema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}\nSee .env.example.`);
  }
  return result.data;
}

export function loadApiEnv(): ApiEnv {
  loadDotEnv();
  const env = parseEnv(ApiEnvSchema);
  if (env.NODE_ENV === 'production' && env.AUTH_DEV_LOGIN_ENABLED) {
    throw new Error('AUTH_DEV_LOGIN_ENABLED must not be true in production');
  }
  if (
    env.NODE_ENV === 'production' &&
    (!env.AUTH_PASSWORD_LOGIN_ENABLED ||
      !['127.0.0.1', '::1'].includes(env.API_HOST) ||
      !splitList(env.CORS_ORIGINS).length ||
      splitList(env.CORS_ORIGINS).some((o) => !o.startsWith('https://')))
  )
    throw new Error(
      'Production needs password auth, HTTPS origins and loopback binding behind TLS ingress',
    );
  return env;
}

export function loadRealtimeEnv(): RealtimeEnv {
  loadDotEnv();
  const env = parseEnv(RealtimeEnvSchema);
  if (
    env.NODE_ENV === 'production' &&
    (!['127.0.0.1', '::1'].includes(env.REALTIME_HOST) ||
      !splitList(env.REALTIME_ALLOWED_ORIGINS).length ||
      splitList(env.REALTIME_ALLOWED_ORIGINS).some((o) => !o.startsWith('https://')))
  )
    throw new Error(
      'Production realtime needs loopback binding behind TLS ingress and HTTPS origins',
    );
  return env;
}

export function splitList(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
