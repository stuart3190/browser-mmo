# Contributing

Humans and AI agents follow the same rules. **Read [`AGENTS.md`](AGENTS.md) before changing anything.**

## Workflow

1. Read `docs/MASTER_PLAN.md`, `docs/PROGRESS.md`, `docs/DECISIONS.md`, and the docs for the area
   you are touching.
2. Extend what exists. Do not rebuild or replace another contributor's system without recording a
   superseding decision (`docs/adr/` + `docs/DECISIONS.md`).
3. Make the change with tests.
4. Run `pnpm verify` (needs PostgreSQL; see local-development.md). At minimum: `pnpm lint`,
   `pnpm typecheck`, `pnpm test`, and `pnpm test:integration` if you touched `db`, `domain`,
   `api` or `realtime`.
5. Update `docs/PROGRESS.md` (tick only what you verified, with proof notes) and the relevant docs.
6. Commit in logical steps with descriptive messages.

## Where code goes

| You are adding…                                        | Put it in                                                                        |
| ------------------------------------------------------ | -------------------------------------------------------------------------------- |
| A new data shape shared by clients/servers             | `packages/schemas` (Zod first, infer the type)                                   |
| Authored content (items, classes, zones…)              | `packages/game-data/src/content` — validated at load                             |
| A pure rule (no I/O): damage formula, equip check, fee | `packages/game-data/src/rules` + unit test                                       |
| A rule that reads/writes the database                  | `packages/domain` + integration test                                             |
| An HTTP endpoint                                       | `services/api/src/routes` — thin: parse with Zod, call domain, return DTO        |
| A realtime message                                     | `packages/networking/src/protocol.ts` first, then handler in `services/realtime` |
| Zone simulation behaviour                              | `services/world` + unit test (no sockets, no DB)                                 |
| A table/column                                         | `packages/db/src/schema.ts` → `pnpm db:generate` → review SQL → commit migration |

## Non-negotiable rules

- **Server authority.** Clients send intent. Never accept item IDs, quantities, prices, positions
  or outcomes from a client without validating them server-side.
- **Items are only minted by `grantItemInTx`** (`packages/domain/src/items.ts`). Item locations
  only change inside a transaction holding `FOR UPDATE` locks. Never `DELETE` item rows.
- **Every economy change is recorded**: `item_history` for items, `currency_ledger` for money,
  `audit_log` for privileged actions.
- **No balance numbers in code.** Rarity, fees, stats, capacities come from game data.
- **Never edit an applied migration.** Add a new one.
- **No secrets in code or commits.** `.env` is git-ignored; document variables in `.env.example`.
- **No blockchain/crypto concepts** in UI or gameplay. The dormant `external*` item fields must stay inert.
- Don't skip/disable tests to get green.

## Code style

TypeScript strict (incl. `noUncheckedIndexedAccess`), ESM, Prettier (100 cols, single quotes),
ESLint flat config at the root. Prefer `as const` objects over `enum`. Use `import type` for types.
Comments explain _why_, not _what_.

## Tooling notes

- Turborepo is configured with `"agentGuidance": false` so it does not inject text into
  `AGENTS.md`. Turborepo's own docs ship inside `node_modules/turbo/docs`.
- Integration tests **drop and recreate** the schema of `TEST_DATABASE_URL`.
