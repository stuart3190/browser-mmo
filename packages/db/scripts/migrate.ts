import { loadDotEnv } from '@mmo/config';
import { createDb } from '../src/client';
import { runMigrations } from '../src/migrate';

loadDotEnv();
const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set (see .env.example)');

const handle = createDb({ url, max: 1, applicationName: 'mmo-migrate' });
try {
  await runMigrations(handle.db);
  console.log('Migrations applied.');
} finally {
  await handle.close();
}
