# 0003 — PostgreSQL + Drizzle ORM

Status: Accepted · Date: 2026-10-03

## Context

The economy depends on transactional correctness: row locks, CHECK constraints, partial unique
indexes, `SELECT … FOR UPDATE`, explicit transaction boundaries. Schema must evolve via reviewed
migrations for years. Choice required between Prisma and Drizzle.

## Decision

**PostgreSQL 16+** with **Drizzle ORM** (`drizzle-orm/node-postgres`, `pg` driver) and
**drizzle-kit** to _generate_ SQL migrations, which are committed and applied by our own migrate
script.

Why Drizzle over Prisma:

- SQL-first: CHECK constraints, partial unique indexes and `FOR UPDATE` are expressed in the schema
  / query builder directly; Prisma needs raw SQL for row locks and partial indexes.
- Generated migrations are plain SQL files we review and commit.
- No separate query-engine binary or code generation step; types come from the TS schema.
- Transactions are ordinary callbacks; the same `tx` object is passed through domain functions.

## Alternatives considered

Prisma (richer tooling, weaker fit for lock-heavy economy code); Kysely (excellent query builder
but no schema/migration story of its own); raw `pg` (no type safety).

## Consequences

Developers must know SQL. Migration files in `packages/db/migrations` are never edited after being
applied — add new ones. `drizzle-kit push` is not used.
