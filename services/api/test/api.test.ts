import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { loadDotEnv } from '@mmo/config';
import { createDb } from '@mmo/db';
import {
  DevAuthProvider,
  PasswordAuthProvider,
  provisionPasswordAccount,
  SessionService,
  createDomainContext,
} from '@mmo/domain';
import { getGameData } from '@mmo/game-data';
import { Metrics, createLogger } from '@mmo/server-kit';
import { uuidv7 } from '@mmo/shared';
import { buildApp } from '../src/app';
import type { App } from '../src/app';

loadDotEnv();
const handle = createDb({ url: process.env.TEST_DATABASE_URL!, max: 5 });
let app: App;

beforeAll(async () => {
  const ctx = createDomainContext({ db: handle.db, gameData: getGameData() });
  app = await buildApp({
    ctx,
    env: { CORS_ORIGINS: 'http://localhost:5173', NODE_ENV: 'test' },
    logger: createLogger({ service: 'api-test', level: 'silent' }),
    metrics: new Metrics(),
    sessions: new SessionService(1),
    authProviders: new Map([['dev', new DevAuthProvider(new Set(['apitestadmin']))]]),
  });
});
afterAll(async () => {
  await app.close();
  await handle.close();
});

async function login(username: string) {
  const res = await app.inject({
    method: 'POST',
    url: '/v1/auth/dev-login',
    payload: { username },
  });
  expect(res.statusCode).toBe(200);
  return res.json<{ token: string; account: { id: string } }>();
}
const auth = (token: string) => ({ authorization: `Bearer ${token}` });
const uniq = () => uuidv7().replace(/-/g, '').slice(-12);

describe('API', () => {
  it('exposes health, readiness and metrics, and echoes request IDs', async () => {
    expect((await app.inject({ url: '/health/live' })).json()).toEqual({ status: 'ok' });
    expect((await app.inject({ url: '/health/ready' })).json()).toMatchObject({
      checks: { database: 'ok' },
    });
    const res = await app.inject({
      url: '/health/live',
      headers: { 'x-request-id': 'test-request-1234' },
    });
    expect(res.headers['x-request-id']).toBe('test-request-1234');
    expect((await app.inject({ url: '/metrics' })).body).toContain('http_requests_total');
  });

  it('requires authentication and returns structured errors', async () => {
    const res = await app.inject({ url: '/v1/characters' });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ error: { code: 'UNAUTHENTICATED' } });
    const forged = await app.inject({ url: '/v1/characters', headers: auth('x'.repeat(43)) });
    expect(forged.statusCode).toBe(401);
  });

  it('runs the character + inventory flow over HTTP', async () => {
    const { token } = await login(`p_${uniq()}`);
    const bad = await app.inject({
      method: 'POST',
      url: '/v1/characters',
      headers: auth(token),
      payload: { name: '1!', classId: 'class.warrior' },
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.json()).toMatchObject({ error: { code: 'VALIDATION_FAILED' } });

    const name = `Api${uniq().replace(/[0-9]/g, 'x')}`.slice(0, 20);
    const created = await app.inject({
      method: 'POST',
      url: '/v1/characters',
      headers: auth(token),
      payload: { name, classId: 'class.warrior' },
    });
    expect(created.statusCode).toBe(201);
    const characterId = created.json<{ character: { id: string } }>().character.id;

    const items = await app.inject({
      url: `/v1/characters/${characterId}/items`,
      headers: auth(token),
    });
    const kinds = items
      .json<{ items: { containers: { container: { kind: string } }[] } }>()
      .items.containers.map((c) => c.container.kind);
    expect(kinds.sort()).toEqual([
      'account_vault',
      'backpack',
      'character_vault',
      'mailbox',
      'material_pouch',
    ]);

    const stats = await app.inject({
      url: `/v1/characters/${characterId}/stats`,
      headers: auth(token),
    });
    expect(stats.json()).toMatchObject({ stats: { total: { strength: 12 }, fromEquipment: {} } });

    const gold = await app.inject({
      url: `/v1/characters/${characterId}/currencies`,
      headers: auth(token),
    });
    expect(gold.json()).toMatchObject({ balances: [{ currencyId: 'gold', amount: 1000 }] });

    // Another account cannot read this character's items.
    const other = await login(`p_${uniq()}`);
    const denied = await app.inject({
      url: `/v1/characters/${characterId}/items`,
      headers: auth(other.token),
    });
    expect(denied.statusCode).toBe(404);
  });

  it('enforces admin permissions server-side', async () => {
    const player = await login(`p_${uniq()}`);
    const forbidden = await app.inject({
      url: '/v1/admin/accounts?q=a',
      headers: auth(player.token),
    });
    expect(forbidden.statusCode).toBe(403);
    expect(forbidden.json()).toMatchObject({ error: { code: 'FORBIDDEN' } });

    const admin = await login('apitestadmin');
    const me = await app.inject({ url: '/v1/me', headers: auth(admin.token) });
    expect(me.json<{ permissions: string[] }>().permissions).toContain('admin.items.grant');
    const ok = await app.inject({
      url: '/v1/admin/accounts?q=apitest',
      headers: auth(admin.token),
    });
    expect(ok.statusCode).toBe(200);
  });

  it('revokes sessions on logout', async () => {
    const { token } = await login(`p_${uniq()}`);
    expect(
      (await app.inject({ method: 'POST', url: '/v1/auth/logout', headers: auth(token) }))
        .statusCode,
    ).toBe(204);
    expect((await app.inject({ url: '/v1/me', headers: auth(token) })).statusCode).toBe(401);
  });
});

it('limits requests before session/database lookup, and releases failed request leases', async () => {
  const sessions = new SessionService(1);
  const resolve = vi.spyOn(sessions, 'resolve').mockResolvedValue(null);
  const limited = await buildApp({
    ctx: createDomainContext({ db: handle.db, gameData: getGameData() }),
    env: { CORS_ORIGINS: '', NODE_ENV: 'test' },
    logger: createLogger({ service: 'limit-test', level: 'silent' }),
    metrics: new Metrics(),
    sessions,
    authProviders: new Map(),
    limits: { burst: 2, perSecond: 0.001, concurrent: 1 },
  });
  try {
    for (let i = 0; i < 2; i++)
      expect((await limited.inject({ url: '/v1/me', headers: auth('invalid') })).statusCode).toBe(
        401,
      );
    const rejected = await limited.inject({ url: '/v1/me', headers: auth('invalid') });
    expect(rejected.statusCode).toBe(429);
    expect(resolve).toHaveBeenCalledTimes(2);
    let finish!: (value: null) => void;
    resolve.mockImplementationOnce(
      () =>
        new Promise((r) => {
          finish = r;
        }),
    );
    const pending = limited
      .inject({ url: '/v1/me', headers: auth('held'), remoteAddress: '127.0.0.2' })
      .then((r) => r);
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    expect((await limited.inject({ url: '/v1/me', remoteAddress: '127.0.0.3' })).statusCode).toBe(
      429,
    );
    finish(null);
    expect((await pending).statusCode).toBe(401);
    expect(
      (await limited.inject({ url: '/health/live', remoteAddress: '127.0.0.3' })).statusCode,
    ).toBe(200);
  } finally {
    await limited.close();
  }
});

it('production refuses dev/no auth and supports provisioned password login without dev fallback', async () => {
  const ctx = createDomainContext({ db: handle.db, gameData: getGameData() });
  const deps = {
    ctx,
    env: { CORS_ORIGINS: 'https://game.example', NODE_ENV: 'production' as const },
    logger: createLogger({ service: 'prod-auth-test', level: 'silent' }),
    metrics: new Metrics(),
    sessions: new SessionService(1),
  };
  await expect(buildApp({ ...deps, authProviders: new Map() })).rejects.toThrow(
    'Production requires',
  );
  await expect(
    buildApp({ ...deps, authProviders: new Map([['dev', new DevAuthProvider(new Set())]]) }),
  ).rejects.toThrow('Production requires');
  const username = `prod_${uniq()}`;
  const password = 'production-path test password';
  await provisionPasswordAccount(ctx, username, password);
  const prod = await buildApp({
    ...deps,
    authProviders: new Map([['password', new PasswordAuthProvider()]]),
  });
  try {
    expect(
      (await prod.inject({ method: 'POST', url: '/v1/auth/dev-login', payload: { username } }))
        .statusCode,
    ).toBe(404);
    expect((await prod.inject({ url: '/v1/auth/providers' })).json()).toEqual({
      providers: ['password'],
    });
    const login = await prod.inject({
      method: 'POST',
      url: '/v1/auth/password-login',
      payload: { username, password },
    });
    expect(login.statusCode).toBe(200);
    expect(
      (await prod.inject({ url: '/v1/me', headers: auth(login.json<{ token: string }>().token) }))
        .statusCode,
    ).toBe(200);
    expect(
      (
        await prod.inject({
          method: 'POST',
          url: '/v1/auth/password-login',
          payload: { username, password: 'an incorrect test password' },
        })
      ).statusCode,
    ).toBe(401);
  } finally {
    await prod.close();
  }
});
