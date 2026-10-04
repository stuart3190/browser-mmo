import { readFileSync } from 'node:fs';
import { loadDotEnv } from '@mmo/config';
import { createDb } from '@mmo/db';
import { getGameData } from '@mmo/game-data';
import { createDomainContext, provisionPasswordAccount } from '../src/index';
loadDotEnv();
if (!process.env.DATABASE_URL || !process.env.MMO_AUTH_USERNAME)
  throw new Error('Set DATABASE_URL and MMO_AUTH_USERNAME; supply password on stdin');
const role = process.env.MMO_AUTH_ROLE ?? 'player';
if (role !== 'player' && role !== 'admin') throw new Error('MMO_AUTH_ROLE must be player or admin');
const handle = createDb({ url: process.env.DATABASE_URL });
try {
  const id = await provisionPasswordAccount(
    createDomainContext({ db: handle.db, gameData: getGameData() }),
    process.env.MMO_AUTH_USERNAME,
    readFileSync(0, 'utf8').replace(/\r?\n$/, ''),
    role,
  );
  console.log(`Provisioned account ${id}; prior sessions revoked. Existing roles are preserved.`);
} finally {
  await handle.close();
}
