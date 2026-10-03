import { drizzle } from 'drizzle-orm/node-postgres';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema';

export type Schema = typeof schema;
export type Database = NodePgDatabase<Schema>;
/** Transaction handle type. Domain functions that must run inside a transaction take this. */
export type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
/** Either a database or a transaction (for read helpers usable in both). */
export type DbOrTx = Database | Tx;

export interface DbHandle {
  db: Database;
  pool: pg.Pool;
  close(): Promise<void>;
}

// BIGINT (int8) as JS number. All amounts are bounded well inside Number.MAX_SAFE_INTEGER by
// schema validation and currency maxBalance.
pg.types.setTypeParser(20, (v) => Number(v));

export function createDb(opts: { url: string; max?: number; applicationName?: string }): DbHandle {
  const pool = new pg.Pool({
    connectionString: opts.url,
    max: opts.max ?? 10,
    application_name: opts.applicationName ?? 'mmo',
  });
  const db = drizzle(pool, { schema });
  return { db, pool, close: () => pool.end() };
}
