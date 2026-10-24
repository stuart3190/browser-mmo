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
    logger: createLogger({ service: 'social-api-test', level: 'silent' }),
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
  return {
    headers,
    name,
    accountId: login.json<{ account: { id: string } }>().account.id,
    id: created.json<{ character: { id: string } }>().character.id,
  };
}

it('enforces consent, ownership and message identity through the authenticated social API', async () => {
  const a = await player(),
    b = await player(),
    c = await player();
  const root = (p: typeof a) => `/v1/characters/${p.id}/social`;
  const action = (p: typeof a, peer: typeof a, action: string) =>
    app.inject({
      method: 'POST',
      url: `${root(p)}/${peer.accountId}`,
      headers: p.headers,
      payload: { action },
    });
  const messages = (p: typeof a, peer: typeof a) => `${root(p)}/${peer.accountId}/messages`;
  expect((await app.inject({ url: root(a) })).statusCode).toBe(401);
  expect((await app.inject({ url: root(a), headers: c.headers })).statusCode).toBe(404);
  expect(
    (
      await app.inject({
        method: 'POST',
        url: root(a),
        headers: a.headers,
        payload: { name: b.name },
      })
    ).statusCode,
  ).toBe(200);
  expect((await action(a, b, 'accept')).statusCode).toBe(403);
  expect((await app.inject({ url: messages(a, b), headers: a.headers })).statusCode).toBe(403);
  expect((await action(b, a, 'accept')).statusCode).toBe(204);
  const id = uuidv7(),
    body = 'Private message <script>literal</script>';
  const post = (payload: Record<string, unknown>) =>
    app.inject({ method: 'POST', url: messages(a, b), headers: a.headers, payload });
  expect((await post({ id, body, fromAccountId: c.accountId })).statusCode).toBe(400);
  expect((await post({ id, body })).json()).toMatchObject({
    message: { id, body, fromAccountId: a.accountId, fromCharacterId: a.id, fromName: a.name },
  });
  expect((await post({ id, body })).statusCode).toBe(200);
  const read = await app.inject({ url: messages(b, a), headers: b.headers });
  expect(read.json<{ messages: unknown[] }>().messages).toHaveLength(1);
  expect((await app.inject({ url: messages(c, a), headers: c.headers })).statusCode).toBe(403);
  expect(
    (
      await app.inject({
        method: 'POST',
        url: `${messages(c, a)}/read`,
        headers: c.headers,
        payload: { ids: [id] },
      })
    ).statusCode,
  ).toBe(403);
  expect(
    (
      await app.inject({
        method: 'POST',
        url: `${messages(b, a)}/read`,
        headers: b.headers,
        payload: { ids: [id] },
      })
    ).statusCode,
  ).toBe(200);
  expect((await app.inject({ url: root(b), headers: b.headers })).json()).toMatchObject({
    friends: [{ friendAccountId: a.accountId, unread: 0, status: 'accepted' }],
  });
  expect((await action(b, a, 'block')).statusCode).toBe(204);
  expect((await post({ id: uuidv7(), body: 'after block' })).statusCode).toBe(403);
  expect(
    (
      await app.inject({
        method: 'POST',
        url: root(a),
        headers: a.headers,
        payload: { name: b.name },
      })
    ).statusCode,
  ).toBe(403);
  expect((await action(b, a, 'unblock')).statusCode).toBe(204);
  expect((await post({ id: uuidv7(), body: 'no renewed consent' })).statusCode).toBe(403);
});
