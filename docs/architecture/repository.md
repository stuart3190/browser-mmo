# Repository structure

```
apps/
  game-web/                    Browser game (Vite, Babylon.js, DOM HUD)
  admin/                       Admin/GM tool (Vite, React)
  companion-app-placeholder/   README only — reserved for the mobile app
services/
  api/                         HTTP API host (Fastify)               → dist/main.js
  realtime/                    WebSocket gateway host (ws)            → dist/main.js
  world/                       @mmo/world zone simulation LIBRARY (hosted by realtime)
packages/
  shared/      IDs, error codes, permissions (isomorphic, no deps)
  schemas/     Zod schemas + inferred types for all models and DTOs
  game-data/   Authored content + validated registry + pure rules
  networking/  Realtime protocol, codec, client
  db/          Drizzle schema, migrations/, migrate & reset scripts
  domain/      Server business logic + integration tests + seed script
  server-kit/  Logger, metrics, HTTP error mapping
  config/      Env schemas & loading
  ui/          Presentation helpers shared by clients
assets/        Source art + generated/ staging (see docs/art-pipeline)
docs/          Project memory (MASTER_PLAN, PROGRESS, DECISIONS) + topic docs + adr/
scripts/       Repo tooling (assets.ts)
docs/ci/       CI workflow template (copy to .github/workflows/ to enable)
```

## Deviations from the suggested layout (and why)

| Suggested                                         | Actual                                                                                                                               | Why                                                                                         |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| `packages/config` = tooling config                | `packages/config` = runtime env config; tooling config is at the root (`tsconfig.base.json`, `eslint.config.js`, `.prettierrc.json`) | One place for lint/TS rules; packages only `extends`                                        |
| —                                                 | `packages/db`                                                                                                                        | Schema/migrations isolated from business logic; used by domain, seed, tests                 |
| —                                                 | `packages/domain`                                                                                                                    | Business rules shared by API **and** realtime ([ADR 0004](../adr/0004-modular-monolith.md)) |
| —                                                 | `packages/server-kit`                                                                                                                | Logging/metrics shared by both services without leaking into browser bundles                |
| `services/world` as a service                     | a library hosted in-process by realtime                                                                                              | Avoids a premature network hop; can become its own process later                            |
| `docs/backend`, `docs/networking`, `docs/classes` | index pages pointing at `docs/architecture/*` and `docs/gameplay/classes.md`                                                         | Avoid duplicated, drifting docs                                                             |

## Conventions

- Package names: `@mmo/<dir>`. Internal packages export TS source ([ADR 0012](../adr/0012-source-packages-bundled-services.md)).
- Task names (Turborepo): `build`, `typecheck`, `test` (no DB), `test:integration` (DB), `dev`.
- Test files: `*.test.ts` beside the code (unit) or under `test/` (integration).
- Content IDs: lowercase dotted slugs (`weapon.sword.iron_longsword`). Never rename shipped IDs.
