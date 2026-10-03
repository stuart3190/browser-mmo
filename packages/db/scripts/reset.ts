import { loadDotEnv } from '@mmo/config';
import pg from 'pg';

/** DEV ONLY: drops and recreates the public schema of DATABASE_URL. Refuses in production. */
loadDotEnv();
const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');
if (process.env.NODE_ENV === 'production')
  throw new Error('Refusing to reset a production database');

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query(
    'DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;',
  );
  console.log('Database reset.');
} finally {
  await client.end();
}
