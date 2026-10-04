/** Actual PostgreSQL transaction killed after the item UPDATE, before COMMIT. */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createDb } from '../../packages/db/src/index';
import { createDomainContext, moveItem } from '../../packages/domain/src/index';
import { getGameData } from '../../packages/game-data/src/index';
const url = process.env.TEST_DATABASE_URL;
if (process.env.NODE_ENV !== 'test' || !process.send || !url || url === process.env.DATABASE_URL)
  throw new Error('Test IPC only');
const db = createDb({ url });
db.pool.on('connect', (client) => {
  const query = client.query.bind(client);
  client.query = ((...args: any[]) => {
    const result = (query as any)(...args);
    const text = typeof args[0] === 'string' ? args[0] : args[0]?.text;
    if (typeof text === 'string' && /^update "item_instances"/i.test(text))
      return Promise.resolve(result).then(() => {
        process.send!({ kind: 'updated' });
        return new Promise(() => undefined);
      });
    return result;
  }) as typeof client.query;
});
await moveItem(
  createDomainContext({ db: db.db, gameData: getGameData() }),
  JSON.parse(process.env.MOVE_INPUT!),
);
throw new Error('Expected UPDATE fault was not reached');
