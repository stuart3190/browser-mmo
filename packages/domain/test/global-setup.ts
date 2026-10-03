import pg from 'pg';
import { loadDotEnv } from '@mmo/config';
import { createDb, runMigrations, syncItemTemplates } from '@mmo/db';
import { getGameData } from '@mmo/game-data';

/**
 * Integration tests run against a REAL PostgreSQL database (TEST_DATABASE_URL). The schema is
 * dropped and re-migrated once per run, so never point this at data you care about.
 */
export default async function setup(): Promise<void> {
  loadDotEnv();
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      'TEST_DATABASE_URL is not set. Integration tests need PostgreSQL (see docs/architecture/local-development.md).',
    );
  }
  if (url === process.env.DATABASE_URL)
    throw new Error('TEST_DATABASE_URL must differ from DATABASE_URL');
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  await client.query(
    'DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;',
  );
  await client.end();

  const handle = createDb({ url, max: 2 });
  await runMigrations(handle.db);
  await syncItemTemplates(handle.db, getGameData());
  await handle.close();
}
