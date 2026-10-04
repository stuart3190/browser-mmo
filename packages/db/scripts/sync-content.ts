import { loadDotEnv } from '@mmo/config';
import { getGameData } from '@mmo/game-data';
import { createDb, syncItemTemplates } from '../src/index';

// Deployment content only: never creates demo accounts, grants items or resets player data.
// Stop zone owners, run migrations, sync content, then start matching client/server builds.
loadDotEnv();
const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');
const handle = createDb({ url, max: 1, applicationName: 'mmo-content-sync' });
try {
  console.log(`Synced ${await syncItemTemplates(handle.db, getGameData())} item templates.`);
} finally {
  await handle.close();
}
