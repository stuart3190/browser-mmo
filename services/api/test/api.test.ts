import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadDotEnv } from '@mmo/config';
import { createDb } from '@mmo/db';
import { DevAuthProvider, SessionService, createDomainContext } from '@mmo/domain';
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
