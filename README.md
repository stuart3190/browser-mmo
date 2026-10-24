# Broken Odyssey

One persistent, browser-first fantasy MMORPG, built with TypeScript, Babylon.js and PostgreSQL.

The playable Greenvale route includes Warrior and Mage combat, a seventeen-quest main/side journey,
gathering and timed crafting, persistent equipment and loot, a private solo/party Broken Vault,
trading, a marketplace, guilds, chat and friends/direct messages. Gear wear/repair and four
level-five specialisations are implemented. Tidewatch and Elderwood add authored quest/encounter
chapters, weapon commissions and equipment rewards; the wider atlas remains sparsely authored.
Complete-game release readiness is **not** claimed; current verification, failures and next work are recorded in
[PROGRESS](docs/PROGRESS.md) and the [resumable handoff](docs/COMPLETION_HANDOFF.md).

**Agents: read [`AGENTS.md`](AGENTS.md) first**, then `docs/MASTER_PLAN.md`, `docs/PROGRESS.md`,
`docs/DECISIONS.md`.

## What runs today

```
browser (Babylon.js) ──HTTP──▶ services/api (Fastify) ──┐
        │                                                ├──▶ PostgreSQL (Drizzle)
        └──WebSocket /ws──▶ services/realtime ───────────┘
                              └─ hosts @mmo/world zone simulation (in-process)
```

1. Log in and create a **Warrior** or **Mage**. Development login is local-only; production uses
   provisioned password accounts. Sessions authenticate both HTTP and WebSocket actions.
2. Move with **WASD** or the touch joystick. The server validates movement/collision and replicates
   players. Select enemies with **Tab** or a tap/click; **F** toggles attacks and **1–4** use abilities. **H** drinks a carried remedy.
3. Follow the opening guide to Elder Maren. **E** interacts with nearby NPCs, pickups and resources.
   Quests, enemy deaths, XP, currency and item ownership persist on the server.
4. **B** opens Bag, **C** Character and **V** Bank. Equip, compare and store actual item instances.
   Open the collapsed class handbook in Character to inspect current and upcoming abilities.
   The Marches workshop reserves timed crafts; **Skills** collects completed results and manages
   private Broken Vault runs. Reconnects restore authoritative state.
5. **P** opens Party, **T** direct Trade, **O** Market and **N** Friends. **Enter** opens Nearby,
   Zone or Party chat. Private conversations require accepted friendship. Touch players use the
   corresponding menu buttons.
6. **M** opens World / Travel. Inspect its regional chart, select a numbered place, and choose
   **Guide here**. Follow guidance to physical departure nodes to visit other regions.
   See [Greenvale systems](docs/gameplay/greenvale-systems.md) for private-run and profession rules.

## Quick start

Requirements: **Node 22.13+**, **pnpm 10**, **PostgreSQL 16+**. Docker is not required.

```bash
cp .env.example .env              # adjust DATABASE_URL / TEST_DATABASE_URL if needed
pnpm install --frozen-lockfile
pnpm db:migrate                   # apply SQL migrations
pnpm db:seed                      # demo accounts: admin, alice, bob
pnpm dev                          # api :4000, realtime :4001, game :5173, admin :5174
```

With development login enabled, open <http://localhost:5173>, log in with a username, create a
character and follow the opening guide. Admin tool: <http://localhost:5174> (login `admin`).

Full setup incl. creating the Postgres role: [`docs/architecture/local-development.md`](docs/architecture/local-development.md).

## Isolated qualification

The qualification runner creates separate loopback services and disposable databases, retains
logs/screenshots and stops only its own processes:

```bash
bash scripts/qualify-local.sh               # full checks and browser smoke
bash scripts/qualify-local.sh --production  # built client, password auth, HTTPS/WSS
```

[Qualification instructions](docs/hardening/LOCAL_RELEASE_QUALIFICATION.md) describe requirements,
capacity gates and the longer earned-character journeys. Browser smoke alone does not qualify
all gameplay, public scale or physical phones. Never point integration tests at persistent data.

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
