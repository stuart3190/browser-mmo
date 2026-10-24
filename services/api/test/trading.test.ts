import { afterAll, beforeAll, expect, it } from 'vitest';
import { createDb } from '@mmo/db';
import { getGameData } from '@mmo/game-data';
import { createDomainContext, DevAuthProvider, SessionService } from '@mmo/domain';
import { createLogger, Metrics } from '@mmo/server-kit';
import { uuidv7 } from '@mmo/shared';
import { loadDotEnv } from '@mmo/config';
import { buildApp } from '../src/app';
import type { App } from '../src/app';
loadDotEnv();
const handle = createDb({ url: process.env.TEST_DATABASE_URL!, max: 5 });
let app: App;
beforeAll(async () => {
  app = await buildApp({
    ctx: createDomainContext({ db: handle.db, gameData: getGameData() }),
    env: { CORS_ORIGINS: 'http://localhost:5180', NODE_ENV: 'test' },
    logger: createLogger({ service: 'trade-api-test', level: 'silent' }),
    metrics: new Metrics(),
    sessions: new SessionService(1),
    authProviders: new Map([['dev', new DevAuthProvider(new Set())]]),
    limits: { burst: 1000, perSecond: 1000 },
  });
});
afterAll(async () => {
  await app.close();
  await handle.close();
});
async function player() {
  const username = `trade_${uuidv7().replace(/-/g, '').slice(-16)}`;
  const login = await app.inject({
    method: 'POST',
    url: '/v1/auth/dev-login',
    payload: { username },
  });
  expect(login.statusCode).toBe(200);
  const headers = { authorization: `Bearer ${login.json<{ token: string }>().token}` };
  const name =
    'Api' +
    uuidv7()
      .replace(/-/g, '')
      .slice(-16)
      .replace(/[0-9a-f]/g, (c) => 'abcdefghijklmnop'[Number.parseInt(c, 16)]!);
  const created = await app.inject({
    method: 'POST',
    url: '/v1/characters',
    headers,
    payload: { name, classId: 'class.warrior' },
  });
  expect(created.statusCode).toBe(201);
  return { headers, name, id: created.json<{ character: { id: string } }>().character.id };
}
it('authenticates both sides, rejects forged ownership/malformed offers, and completes a revisioned exchange over HTTP', async () => {
  const a = await player(),
    b = await player(),
    outsider = await player();
  const base = `/v1/characters/${a.id}/trades`;
  expect((await app.inject({ url: base })).statusCode).toBe(401);
  const created = await app.inject({
    method: 'POST',
    url: base,
    headers: a.headers,
    payload: { targetName: b.name, requestId: uuidv7() },
  });
  expect(created.statusCode).toBe(201);
  const id = created.json<{ trade: { id: string } }>().trade.id;
  expect((await app.inject({ url: base, headers: outsider.headers })).statusCode).toBe(404);
  const act = (p: typeof a, payload: Record<string, unknown>) =>
    app.inject({
      method: 'POST',
      url: `/v1/characters/${p.id}/trades/${id}`,
      headers: p.headers,
      payload,
    });
  expect((await act(outsider, { action: 'cancel', revision: 0 })).statusCode).toBe(404);
  expect(
    (await act(a, { action: 'offer', revision: 0, offer: { items: [], copper: -1 } })).statusCode,
  ).toBe(400);
  expect(
    (
      await act(a, {
        action: 'offer',
        revision: 0,
        offer: { items: [], copper: 100 },
        accountId: outsider.id,
      })
    ).statusCode,
  ).toBe(400);
  expect(
    (await act(a, { action: 'offer', revision: 0, offer: { items: [], copper: 100 } })).statusCode,
  ).toBe(200);
  expect((await act(b, { action: 'lock', revision: 0 })).statusCode).toBe(409);
  for (const p of [a, b])
    expect((await act(p, { action: 'lock', revision: 1 })).statusCode).toBe(200);
  expect((await act(a, { action: 'confirm', revision: 1 })).statusCode).toBe(200);
  expect((await act(b, { action: 'confirm', revision: 1 })).json()).toMatchObject({
    trade: { status: 'completed' },
  });
  for (const [p, amount] of [
    [a, 900],
    [b, 1100],
  ] as const) {
    const wallet = await app.inject({
      url: `/v1/characters/${p.id}/currencies`,
      headers: p.headers,
    });
    expect(wallet.json()).toMatchObject({ balances: [{ currencyId: 'gold', amount }] });
  }
});
