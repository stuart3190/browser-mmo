import { afterAll, beforeAll, expect, it } from 'vitest';
import { createDb } from '@mmo/db';
import { getGameData } from '@mmo/game-data';
import {
  createDomainContext,
  DevAuthProvider,
  SessionService,
  grantItemInTx,
  inTransaction,
  getCharacterItems,
} from '@mmo/domain';
import { createLogger, Metrics } from '@mmo/server-kit';
import { uuidv7 } from '@mmo/shared';
import { loadDotEnv } from '@mmo/config';
import { buildApp } from '../src/app';
import type { App } from '../src/app';
loadDotEnv();
const handle = createDb({ url: process.env.TEST_DATABASE_URL!, max: 5 });
const ctx = createDomainContext({ db: handle.db, gameData: getGameData() });
let app: App;
beforeAll(async () => {
  app = await buildApp({
    ctx,
    env: { CORS_ORIGINS: 'http://localhost:5180', NODE_ENV: 'test' },
    logger: createLogger({ service: 'market-api-test', level: 'silent' }),
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

it('authenticates marketplace review, paginated browsing, account history and versioned sales over HTTP', async () => {
  const seller = await player(),
    buyer = await player();
  await inTransaction(ctx, (tx) =>
    grantItemInTx(tx, ctx, {
      accountId: seller.accountId,
      characterId: seller.id,
      templateId: 'weapon.sword.iron_longsword',
      quantity: 1,
      method: 'system',
      actor: { accountId: null, characterId: null },
    }),
  );
  const inventory = await getCharacterItems(ctx.db, ctx, seller.accountId, seller.id);
  const sword = inventory.containers
    .flatMap((c) => c.items)
    .find((i) => i.template.id === 'weapon.sword.iron_longsword')!;
  const path = '/v1/marketplace/listings';
  const post = (payload: Record<string, unknown>, headers = seller.headers) =>
    app.inject({ method: 'POST', url: path, headers, payload });
  const request = {
    characterId: seller.id,
    itemInstanceId: sword.instance.id,
    expectedVersion: sword.instance.version,
    price: 100,
    durationHours: 12,
  };
  expect((await app.inject({ url: '/v1/marketplace/mine' })).statusCode).toBe(401);
  expect((await post(request, buyer.headers)).statusCode).toBe(404);
  expect((await post({ ...request, expectedVersion: sword.instance.version + 1 })).statusCode).toBe(
    409,
  );
  const created = await post(request);
  expect(created.statusCode).toBe(201);
  const id = created.json<{ listing: { id: string } }>().listing.id;
  expect((await app.inject({ url: `${path}/${id}` })).statusCode).toBe(401);
  const review = await app.inject({ url: `${path}/${id}`, headers: buyer.headers });
  expect(review.statusCode).toBe(200);
  expect(review.json()).toMatchObject({
    listing: { id, price: 100 },
    item: {
      instance: {
        id: sword.instance.id,
        stats: sword.instance.stats,
        modifiers: sword.instance.modifiers,
      },
    },
  });
  expect(
    (await app.inject({ url: `${path}?afterPrice=100`, headers: buyer.headers })).statusCode,
  ).toBe(400);
  const page = await app.inject({
    url: `${path}?templateId=weapon.sword.iron_longsword&limit=200`,
    headers: buyer.headers,
  });
  expect(page.json<{ listings: { id: string }[] }>().listings.some((l) => l.id === id)).toBe(true);
  expect(
    (
      await app.inject({
        url: `/v1/marketplace/mine?sellerAccountId=${seller.accountId}`,
        headers: buyer.headers,
      })
    ).json(),
  ).toEqual({ listings: [] });
  expect(
    (await app.inject({ method: 'POST', url: `${path}/${id}/cancel`, headers: buyer.headers }))
      .statusCode,
  ).toBe(403);
  expect(
    (
      await app.inject({
        method: 'POST',
        url: `${path}/${id}/buy`,
        headers: buyer.headers,
        payload: { characterId: buyer.id, expectedPrice: 101 },
      })
    ).statusCode,
  ).toBe(409);
  expect(
    (
      await app.inject({
        method: 'POST',
        url: `${path}/${id}/buy`,
        headers: buyer.headers,
        payload: { characterId: buyer.id, expectedPrice: 100 },
      })
    ).statusCode,
  ).toBe(200);
  expect((await app.inject({ url: `${path}/${id}`, headers: buyer.headers })).statusCode).toBe(409);
  expect(
    (await app.inject({ url: '/v1/marketplace/mine', headers: seller.headers })).json(),
  ).toMatchObject({ listings: [{ id, status: 'sold' }] });
});
