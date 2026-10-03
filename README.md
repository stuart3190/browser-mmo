# browser-mmo

Foundation for **one persistent, browser-first fantasy MMORPG** intended to grow for years.

> Status (2026-10-03): architecture foundation, a playable inventory/equipment loop and a
> server-authoritative combat foundation (one melee auto-attack loop against a placeholder Grey Wolf:
> targeting, enemy AI, death/respawn, XP, loot). No abilities, quests, crafting or social systems yet.
> See [`docs/PROGRESS.md`](docs/PROGRESS.md) for exactly what is verified.

**Agents: read [`AGENTS.md`](AGENTS.md) first**, then `docs/MASTER_PLAN.md`, `docs/PROGRESS.md`,
`docs/DECISIONS.md`.

## What runs today

```
browser (Babylon.js) ──HTTP──▶ services/api (Fastify) ──┐
        │                                                ├──▶ PostgreSQL (Drizzle)
        └──WebSocket /ws──▶ services/realtime ───────────┘
                              └─ hosts @mmo/world zone simulation (in-process)
```

1. Dev-login and create a character in the browser (HTTP API).
2. The game connects over WebSocket, authenticates with the session token, joins the zone.
3. Walk (WASD) — the server validates speed/bounds and replicates movement to other players.
4. Press **E** at a glowing box — the server checks range, reserves the pickup, mints a uniquely
   identified item instance in PostgreSQL in one transaction, and pushes `inventory.updated`.
5. **B** bag, **C** character, **V** bank: equip/unequip, compare, deposit/retrieve. Every action is
   an authoritative API call; changes from any server process are pushed back over the WebSocket
   (PostgreSQL change feed), and dropped connections reconnect automatically.
6. Walk north to the **Grey Wolf**, tap/click it (or Tab), press **F**/Attack. The server times every
   swing, resolves damage, runs the wolf's AI, awards XP and loot exactly once on its death; the loot
   lands in your bag and can be equipped. See [`docs/gameplay/combat.md`](docs/gameplay/combat.md).

## Quick start

Requirements: **Node 22.13+**, **pnpm 10**, **PostgreSQL 16+**. Docker is not required.

```bash
cp .env.example .env              # adjust DATABASE_URL / TEST_DATABASE_URL if needed
pnpm install
pnpm db:migrate                   # apply SQL migrations
pnpm db:seed                      # demo accounts: admin, alice, bob
pnpm dev                          # api :4000, realtime :4001, game :5173, admin :5174
```

Open <http://localhost:5173>, log in with any username, create a character, press E near the
glowing boxes. Admin tool: <http://localhost:5174> (login `admin`).

Full setup incl. creating the Postgres role: [`docs/architecture/local-development.md`](docs/architecture/local-development.md).

## Common commands

| Command                 | What it does                                                            |
| ----------------------- | ----------------------------------------------------------------------- |
| `pnpm verify`           | format check, lint, typecheck, unit + integration tests, build          |
| `pnpm test`             | unit tests (no database)                                                |
| `pnpm test:integration` | DB/API/WebSocket tests against `TEST_DATABASE_URL` (schema is dropped!) |
| `pnpm db:generate`      | generate a new SQL migration from `packages/db/src/schema.ts`           |
| `pnpm db:reset`         | drop + migrate + seed the dev database                                  |
| `pnpm assets:check`     | validate asset names and metadata sidecars                              |

## Repository map

| Path                             | Purpose                                                                  |
| -------------------------------- | ------------------------------------------------------------------------ |
| `apps/game-web`                  | Browser game client (Vite + Babylon.js)                                  |
| `apps/admin`                     | Admin/GM tool skeleton (React)                                           |
| `apps/companion-app-placeholder` | Reserved for the mobile companion app (docs only)                        |
| `services/api`                   | HTTP API (Fastify)                                                       |
| `services/realtime`              | WebSocket gateway, hosts zone simulations                                |
| `services/world`                 | Zone simulation library (`@mmo/world`), pure logic                       |
| `packages/shared`                | IDs (UUIDv7), error codes, roles/permissions                             |
| `packages/schemas`               | Zod schemas + types for every domain model and API DTO                   |
| `packages/game-data`             | Authored, validated content + pure rule functions                        |
| `packages/networking`            | Realtime protocol (typed, versioned) + client                            |
| `packages/db`                    | Drizzle schema, SQL migrations, DB client                                |
| `packages/domain`                | Server-authoritative business logic (items, storage, marketplace, auth…) |
| `packages/server-kit`            | Logging, metrics, HTTP error mapping                                     |
| `packages/config`                | Typed env loading                                                        |
| `packages/ui`                    | Shared presentation helpers                                              |
| `assets/`                        | Source art assets + `generated/` staging area                            |
| `docs/`                          | Architecture, gameplay, economy, world, mobile, art pipeline, ADRs       |

Details: [`docs/architecture/repository.md`](docs/architecture/repository.md).

## Documentation

- Architecture: [overview](docs/architecture/overview.md) · [repository](docs/architecture/repository.md) · [database](docs/architecture/database.md) · [realtime](docs/architecture/realtime.md) · [security](docs/architecture/security.md) · [local development](docs/architecture/local-development.md)
- Items: [item system](docs/items/item-system.md) · Economy: [marketplace](docs/economy/marketplace.md)
- Gameplay: [classes](docs/gameplay/classes.md) · [inventory](docs/gameplay/inventory.md) · World: [world architecture](docs/world/world-architecture.md)
- Mobile: [companion app](docs/mobile/companion-app.md) · Art: [art pipeline](docs/art-pipeline/README.md)
- Decisions: [ADRs](docs/adr/README.md) · [decision log](docs/DECISIONS.md)
