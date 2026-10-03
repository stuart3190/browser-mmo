import { defineConfig } from 'drizzle-kit';

// Only `drizzle-kit generate` uses this file (it diffs src/schema.ts against migrations/meta).
// Migrations are APPLIED by scripts/migrate.ts, never by `drizzle-kit push`.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema.ts',
  out: './migrations',
  strict: true,
});
