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
    logger: createLogger({ service: 'guild-api-test', level: 'silent' }),
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

it('enforces guild consent, ownership, role and exact guild identity over HTTP', async () => {
  const a = await player(),
    b = await player(),
    c = await player();
  const root = (p: typeof a) => `/v1/characters/${p.id}/guild`;
  const post = (p: typeof a, path: string, payload: Record<string, unknown>) =>
    app.inject({ method: 'POST', url: root(p) + path, headers: p.headers, payload });
  expect((await app.inject({ url: root(a) })).statusCode).toBe(401);
  expect((await app.inject({ url: root(a), headers: c.headers })).statusCode).toBe(404);
  const created = await post(a, '', {
    name: `Guild ${uuidv7().slice(-8)}`,
    tag: uuidv7().slice(-5),
  });
  expect(created.statusCode).toBe(200);
  const guildId = created.json<{ guildId: string }>().guildId;
  expect((await post(a, '/invite', { guildId, name: b.name })).statusCode).toBe(204);
  expect((await app.inject({ url: root(b), headers: b.headers })).json().invitations).toHaveLength(
    1,
  );
  expect(
    (await app.inject({ url: root(b) + `/messages?guildId=${guildId}`, headers: b.headers }))
      .statusCode,
  ).toBe(403);
  expect((await post(b, '/respond', { guildId, accept: true })).statusCode).toBe(204);
  expect((await post(b, '/notice', { guildId, motd: 'forged officer' })).statusCode).toBe(403);
  expect(
    (await post(a, '/member', { guildId, targetId: b.id, action: 'promote' })).statusCode,
  ).toBe(204);
  expect((await post(b, '/notice', { guildId, motd: 'Meet by the gate' })).statusCode).toBe(204);
  const id = uuidv7();
  expect((await post(b, '/messages', { guildId, id, body: '<b>Hello guild</b>' })).statusCode).toBe(
    200,
  );
  expect((await post(b, '/messages', { guildId, id, body: '<b>Hello guild</b>' })).statusCode).toBe(
    200,
  );
  const messages = (
    await app.inject({ url: root(a) + `/messages?guildId=${guildId}`, headers: a.headers })
  ).json().messages;
  expect(messages).toHaveLength(1);
  expect(messages[0]).toMatchObject({ fromName: b.name, body: '<b>Hello guild</b>' });
  expect(
    (await post(b, '/messages', { guildId: uuidv7(), id: uuidv7(), body: 'wrong guild' }))
      .statusCode,
  ).toBe(403);
  expect((await post(a, '/leave', { disband: true })).statusCode).toBe(400);
  expect((await post(a, '/leave', { guildId: uuidv7(), disband: true })).statusCode).toBe(403);
  expect((await post(a, '/leave', { guildId, disband: true })).statusCode).toBe(204);
  expect(
    (await app.inject({ url: root(b) + `/messages?guildId=${guildId}`, headers: b.headers }))
      .statusCode,
  ).toBe(403);
});
