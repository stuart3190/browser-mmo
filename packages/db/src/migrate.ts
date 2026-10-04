import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { drizzle } from 'drizzle-orm/node-postgres';
import { poolFor } from './client';
import type { Database } from './client';

export const MIGRATIONS_FOLDER = resolve(dirname(fileURLToPath(import.meta.url)), '../migrations');

/** Applies pending SQL migrations in order inside a transaction (drizzle migrator). */
export async function runMigrations(
  db: Database,
  migrationsFolder = MIGRATIONS_FOLDER,
): Promise<void> {
  const client = await poolFor(db).connect();
  try {
    // Serialize migration runners on a pinned session; fail rather than wait indefinitely.
    const result = await client.query<{ locked: boolean }>(
      'select pg_try_advisory_lock(717724, 1) as locked',
    );
    if (!result.rows[0]?.locked)
      throw new Error('Another migration runner owns the migration lock');
    const journal = JSON.parse(
      await readFile(resolve(migrationsFolder, 'meta/_journal.json'), 'utf8'),
    ) as { entries: { tag: string; when: number }[] };
    const exists = await client.query<{ name: string | null }>(
      "select to_regclass('drizzle.__drizzle_migrations')::text as name",
    );
    if (exists.rows[0]?.name) {
      const applied = await client.query<{ hash: string; created_at: string }>(
        'select hash,created_at from drizzle.__drizzle_migrations order by created_at',
      );
      for (const row of applied.rows) {
        const entry = journal.entries.find((e) => e.when === Number(row.created_at));
        if (
          !entry ||
          createHash('sha256')
            .update(await readFile(resolve(migrationsFolder, `${entry.tag}.sql`)))
            .digest('hex') !== row.hash
        )
          throw new Error(
            'Applied migration checksum mismatch; restore original migration and add a new migration',
          );
      }
      if (applied.rows.length < journal.entries.length) {
        const owners = await client.query<{ n: string }>(
          "select count(*) n from pg_locks where locktype='advisory' and classid=717723 and granted and database=(select oid from pg_database where datname=current_database())",
        );
        if (Number(owners.rows[0]?.n))
          throw new Error('Stop zone hosts before applying migrations');
      }
    }
    await migrate(drizzle(client), { migrationsFolder });
  } finally {
    client.release(true);
  }
}
