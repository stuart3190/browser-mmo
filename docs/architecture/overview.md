# Architecture overview

## Principles

1. **Server-authoritative.** Clients (browser game, admin, future mobile app) send _intent_. The
   server owns item creation, currency, loot, combat results, marketplace/trades, progression and
   movement validation.
2. **One source of truth per concern.** Shapes: `@mmo/schemas`. Content and pure rules:
   `@mmo/game-data`. Persistence-backed rules: `@mmo/domain`. Wire protocol: `@mmo/networking`.
3. **Modular monolith** ([ADR 0004](../adr/0004-modular-monolith.md)). Processes are thin hosts
   over shared packages, so they can be split later without rewriting rules.
4. **Database as the last line of defence.** Invariants are enforced by constraints as well as code.
5. **Client-agnostic backend.** Sessions carry a `clientKind`; nothing assumes the browser.

## Runtime topology (today)

```
                ┌───────────────────────┐   HTTP /v1/*      ┌───────────────────────┐
 apps/game-web ─┤ Babylon.js + DOM HUD  ├──────────────────▶│ services/api          │
 apps/admin  ───┤ React                 │                   │ Fastify               │──┐
                └──────────┬────────────┘                   └───────────────────────┘  │
                           │ WebSocket /ws (protocol v1)                                │
                           ▼                                                            ▼
                ┌───────────────────────┐   @mmo/domain (same code as API)   ┌──────────────┐
                │ services/realtime     │───────────────────────────────────▶│ PostgreSQL   │
                │  ├ ZoneSimulation ×N  │                                    └──────────────┘
                │  │ (@mmo/world)       │
                └───────────────────────┘
```

- **API**: auth, characters, inventory moves/equip, marketplace, admin. Request IDs, structured
  logs, `/health/live`, `/health/ready`, `/metrics`.
- **Realtime**: authenticates sockets, validates/rate-limits every frame, feeds zone simulations,
  persists pickups through `@mmo/domain`, persists positions periodically and on disconnect.
- **World** (`@mmo/world`): pure in-memory zone simulation — entities, spawns, movement
  validation, chunk-based interest management, two-phase pickups.
- **Redis**: not used yet ([ADR 0011](../adr/0011-redis-deferred.md)).

## Package dependency graph

```
shared ◀── schemas ◀── game-data ◀── networking ◀── world
   ▲          ▲            ▲             ▲            ▲
   └──── config, server-kit, db ◀── domain ◀── api, realtime (hosts world)
apps/game-web → game-data, networking, schemas, ui        apps/admin → schemas, game-data, ui
```

Apps never import `db`, `domain` or `server-kit`. `world` never imports `db`/`domain` (the host
does the persistence).

## Request lifecycle (HTTP)

`onRequest` assigns/echoes `x-request-id`, resolves the bearer session → route parses input with
Zod → calls a domain function → domain opens a transaction, locks rows in a fixed order (listing →
items → containers → wallets), validates, writes, appends history/ledger/audit rows → DTO returned.
`DomainError(code)` maps to an HTTP status in one table (`@mmo/server-kit/http-errors`).

## Observability

- **Logs**: pino JSON to stdout, one child logger per request/connection carrying `requestId`,
  `connectionId`, `accountId`, `characterId`. Tokens/passwords are redacted.
- **Request IDs**: HTTP `x-request-id`; realtime requests use `<connectionId>:<seq>`; both are
  written into `item_history.details.requestId` and `audit_log.request_id`.
- **Metrics**: dependency-free registry rendering Prometheus text (`http_requests_total`,
  `ws_connections`, `ws_messages_total`, `world_pickups_total`, `world_tick_ms`). Swap for
  OpenTelemetry behind the same interface when needed. `/metrics` must not be exposed publicly.
- **Health**: `live` (process up) and `ready` (DB reachable; realtime also reports zones/players).

## Deployment strategy (not yet implemented)

- Build: `pnpm build` produces `services/*/dist/main.js` (tsup, `@mmo/*` inlined, npm deps external)
  and static bundles in `apps/*/dist`. Ship services with `pnpm deploy --filter <svc> --prod`.
- Migrations: run `pnpm db:migrate` as a release step before rolling services.
- Static apps on a CDN; API behind a load balancer (stateless, horizontally scalable);
  realtime with sticky zone ownership (one process per zone set until a zone registry exists).
- Backups: PostgreSQL PITR (WAL archiving) from day one of any public test. Not configured here.
