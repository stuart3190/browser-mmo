# Local development

## Requirements

- Node **22.13+** (see `.nvmrc`), pnpm **10** (`corepack enable`)
- PostgreSQL **16+** running locally. Docker is **not** required.

## PostgreSQL setup (once)

```bash
# Ubuntu/Debian example; any local Postgres 16+ works (Postgres.app, Homebrew, …)
sudo -u postgres psql -c "CREATE ROLE mmo LOGIN PASSWORD 'mmo' CREATEDB;"
sudo -u postgres createdb -O mmo mmo_dev
sudo -u postgres createdb -O mmo mmo_test
```

Optional, if you prefer Docker for the database only:
`docker run -d --name mmo-pg -e POSTGRES_USER=mmo -e POSTGRES_PASSWORD=mmo -e POSTGRES_DB=mmo_dev -p 5432:5432 postgres:16`
(then `createdb -h localhost -U mmo mmo_test`).

## First run

```bash
cp .env.example .env
pnpm install
pnpm db:migrate
pnpm db:seed
pnpm dev
```

| Process  | URL                                                           |
| -------- | ------------------------------------------------------------- |
| API      | http://localhost:4000 (`/health/ready`, `/metrics`)           |
| Realtime | ws://localhost:4001/ws (`http://localhost:4001/health/ready`) |
| Game     | http://localhost:5173 (`?renderer=webgpu` to try WebGPU)      |
| Admin    | http://localhost:5174 (log in as `admin`)                     |

Seeded dev logins: `admin` (admin role), `alice` (Warrior with gear, potions, ore, vaulted cloak),
`bob` (Mage with an active marketplace listing). Any other username auto-registers.

## Environment variables

All variables are documented in `.env.example`. Services validate their env with Zod at startup and
exit with a readable message if something is missing. Browser apps only see `VITE_*` variables.

## Tests

```bash
pnpm test               # fast unit tests, no DB
pnpm test:integration   # uses TEST_DATABASE_URL — DROPS its schema each run
pnpm verify             # everything CI runs
```

## Schema changes

Edit `packages/db/src/schema.ts` → `pnpm db:generate` → review the new SQL in
`packages/db/migrations/` → `pnpm db:migrate` → commit schema + migration + meta together.

## Troubleshooting

- `Invalid environment configuration` → compare `.env` with `.env.example`.
- WebSocket closes with 403 → the page origin is not in `REALTIME_ALLOWED_ORIGINS`.
- Integration tests refuse to run → `TEST_DATABASE_URL` missing or equal to `DATABASE_URL`.
