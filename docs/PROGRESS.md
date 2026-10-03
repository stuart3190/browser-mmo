# Progress

Authoritative checklist of what genuinely exists and works in this repository.

Rules (see `AGENTS.md`):

- Do NOT mark anything complete without evidence. Code existing is not evidence; it must be implemented and verified.
- If a ticked item is found not to work, untick it and add it to Known Issues.
- Keep Current Work, Known Issues, and Next Recommended Task up to date after substantial work.

Completed items should carry proof notes in this form:

```markdown
- [x] Item name
  - Verified date: YYYY-MM-DD
  - Agent/model:
  - Proof/test:
  - Commit SHA:
```

Status at creation (2026-10-03): the repository contained only `README.md` and `.gitignore`, so every item below starts unchecked.

Update 2026-10-03 (Claude Opus 5.5): foundation + technical proof built. Proof notes below use the compact form
`Verified YYYY-MM-DD · agent · proof · commit`. Commits: `8454ea0` (foundation, schemas, game data, DB, domain),
`0f0a413` (protocol, world sim, API, realtime, game + admin clients), `7fa2d8e` (docs, asset tooling, CI template; ADRs landed in `0f0a413`).
"`pnpm verify`" = format check + lint + typecheck + 40 unit tests + 33 integration tests (real PostgreSQL 16) + build, all passing.
"Update 2026-10-03 (Claude Opus 5.5), milestone "playable inventory + equipment loop": commit `418b1fd`.
"Inventory E2E" = headless Chromium against the real stack (bundled API + realtime, Vite client, PostgreSQL), 24 checks:
admin grants pushed live → hover tooltip → equip → visible stat change → comparison tooltip → level/class-restricted equips
rejected with DB unchanged → unequip reverts stats → vault deposit/retrieve → UI double-click + 3 concurrent raw API moves
(exactly one succeeds, one copy everywhere) → simulated socket drop → realtime server killed, item granted while down,
server restarted → client reconnects and shows it → UI == API == PostgreSQL state → 390×844 touch layout tap-to-equip.

"Browser E2E" = headless Chromium (Playwright, WebGL2 via SwiftShader) driving the real stack: login → create character →
WASD to the sword → E → `inventory.updated` → HUD shows the item → row verified in PostgreSQL.

# Foundation

- [x] Monorepo configured
  - Verified 2026-10-03 · Claude Opus 5.5 · pnpm workspaces + Turborepo; `pnpm verify` passes · 8454ea0
- [x] Package manager configured
  - Verified 2026-10-03 · Claude Opus 5.5 · pnpm 10, `packageManager` pinned, lockfile committed · 8454ea0
- [x] TypeScript configured
  - Verified 2026-10-03 · Claude Opus 5.5 · strict TS 6 base config; `pnpm typecheck` passes for all 14 workspace packages + scripts · 8454ea0
- [x] Shared config packages
  - Verified 2026-10-03 · Claude Opus 5.5 · root tsconfig/ESLint/Prettier; `@mmo/config` env schemas with unit tests · 8454ea0
- [x] Environment setup documented
  - Verified 2026-10-03 · Claude Opus 5.5 · `.env.example`, docs/architecture/local-development.md; followed to run the stack · 7fa2d8e
- [ ] CI foundation
  - Workflow written (mirrors `pnpm verify` with a Postgres service) but kept as a template in `docs/ci/github-actions-ci.yml`: the pushing token lacked the GitHub `workflow` scope. Never run. See docs/ci/README.md to enable.

# Browser Game

- [x] 3D engine selected
  - Verified 2026-10-03 · Claude Opus 5.5 · Babylon.js (ADR 0002); renders with WebGL2 in Browser E2E · 0f0a413
- [x] Game shell boots
  - Verified 2026-10-03 · Claude Opus 5.5 · Browser E2E: login, character create, scene loads, no page errors · 0f0a413
- [x] Basic world renders
  - Verified 2026-10-03 · Claude Opus 5.5 · Browser E2E screenshots: 4 chunk grounds + placeholder props · 0f0a413
- [ ] Camera controls
  - Orbit camera (drag rotate, wheel zoom, follows player) implemented; follow seen in E2E screenshots, drag/zoom not exercised by any automated check.
- [x] Character renders
  - Verified 2026-10-03 · Claude Opus 5.5 · Placeholder capsule visible in Browser E2E screenshots · 0f0a413
- [x] Movement
  - Verified 2026-10-03 · Claude Opus 5.5 · Browser E2E: WASD moves player ~10 m, server accepts (no correction); realtime test checks speed-hack correction · 0f0a413
- [x] NPC spawning
  - Verified 2026-10-03 · Claude Opus 5.5 · NPC spawned from chunk spawn point (world unit test) and rendered (E2E screenshot) · 0f0a413
- [x] Item pickup
  - Verified 2026-10-03 · Claude Opus 5.5 · Browser E2E + realtime integration test: intent → range check → DB row (`world_pickup`, unique source_ref) → `inventory.updated` · 0f0a413
- [x] HUD foundation
  - Verified 2026-10-03 · Claude Opus 5.5 · Plain-DOM status/prompt/log/inventory panels; E2E shows picked-up item listed · 0f0a413

# Backend

- [x] API service
  - Verified 2026-10-03 · Claude Opus 5.5 · Fastify; 5 API integration tests (health, auth, characters, items, admin permissions) · 0f0a413
- [x] Auth foundation
  - Verified 2026-10-03 · Claude Opus 5.5 · Dev provider + hashed opaque sessions + logout revocation (API tests). Dev-only: no password/OAuth yet · 0f0a413
- [x] Character persistence
  - Verified 2026-10-03 · Claude Opus 5.5 · Create/list via API tests; name uniqueness enforced. (Periodic/disconnect position save implemented but untested.) · 0f0a413
- [x] Item persistence
  - Verified 2026-10-03 · Claude Opus 5.5 · Domain integration tests (items.test.ts) · 8454ea0
- [x] Inventory persistence
  - Verified 2026-10-03 · Claude Opus 5.5 · Domain integration tests (storage.test.ts) · 8454ea0
- [x] Equipment persistence
  - Verified 2026-10-03 · Claude Opus 5.5 · Equip/swap/unequip integration tests · 8454ea0
- [x] Vault persistence
  - Verified 2026-10-03 · Claude Opus 5.5 · Character vault + shared account vault move tests · 8454ea0

# Database

- [x] Migrations
  - Verified 2026-10-03 · Claude Opus 5.5 · `packages/db/migrations/0000_init.sql` applied by `pnpm db:migrate` and by test setup · 8454ea0
- [x] Accounts
  - Verified 2026-10-03 · Claude Opus 5.5 · table in 0000_init.sql, exercised by integration tests · 8454ea0
- [x] Characters
  - Verified 2026-10-03 · Claude Opus 5.5 · table in 0000_init.sql, exercised by integration tests · 8454ea0
- [x] Item templates
  - Verified 2026-10-03 · Claude Opus 5.5 · table in 0000_init.sql, exercised by integration tests · 8454ea0
- [x] Item instances
  - Verified 2026-10-03 · Claude Opus 5.5 · table in 0000_init.sql, exercised by integration tests · 8454ea0
- [x] Inventories
  - Verified 2026-10-03 · Claude Opus 5.5 · implemented as `containers` table (see database.md mapping); tests · 8454ea0
- [x] Equipment
  - Verified 2026-10-03 · Claude Opus 5.5 · implemented as `location_kind=equipped` + unique (character, slot); tests · 8454ea0
- [x] Vaults
  - Verified 2026-10-03 · Claude Opus 5.5 · `containers` kinds character_vault/account_vault; tests · 8454ea0
- [x] Marketplace tables
  - Verified 2026-10-03 · Claude Opus 5.5 · `marketplace_listings`, `marketplace_transactions`; marketplace tests · 8454ea0
- [x] Item history
  - Verified 2026-10-03 · Claude Opus 5.5 · `item_history` asserted in item/storage/marketplace tests · 8454ea0

# Realtime Multiplayer

- [x] WebSocket connection
  - Verified 2026-10-03 · Claude Opus 5.5 · realtime integration tests over real sockets; Browser E2E · 0f0a413
- [x] Authentication
  - Verified 2026-10-03 · Claude Opus 5.5 · auth.hello with session token; forged token / other character / cross-origin rejected (tests) · 0f0a413
- [x] Presence
  - Verified 2026-10-03 · Claude Opus 5.5 · presence.update joined/left within a zone (test). Zone-scoped only · 0f0a413
- [x] Player movement replication
  - Verified 2026-10-03 · Claude Opus 5.5 · world.moves received by second client (test) · 0f0a413
- [x] Entity spawn
  - Verified 2026-10-03 · Claude Opus 5.5 · entity.spawn on join/respawn (world + realtime tests) · 0f0a413
- [x] Entity despawn
  - Verified 2026-10-03 · Claude Opus 5.5 · entity.despawn on leave/pickup (world + realtime tests) · 0f0a413
- [x] World state updates
  - Verified 2026-10-03 · Claude Opus 5.5 · per-tick batched world.moves with chunk-based interest (world tests) · 0f0a413
- [x] Server-side item/wallet change push
  - Verified 2026-10-03 · Claude Opus 5.5 · PostgreSQL LISTEN/NOTIFY change feed → `inventory.updated`(+`removed`)/`character.stats`/`wallet.updated`; realtime tests (admin grant, equip, vault, marketplace removal, cross-character shared vault, invalid equip sends nothing, resync after listener loss) + Inventory E2E (pushes from the separate API process) · 418b1fd
- [x] Reconnect
  - Verified 2026-10-03 · Claude Opus 5.5 · `RealtimeClient` auto-reconnect with backoff, no retry on close codes ≥ 4000 (realtime tests: simulated drop, session replaced); Inventory E2E: socket drop and full realtime server kill/restart recovered without page reload · 418b1fd
- [x] Chat protocol
  - Verified 2026-10-03 · Claude Opus 5.5 · chat.send/chat.message for say/zone (test). No guild/party/whisper channels yet · 0f0a413

# Characters / Classes

- [x] Character model
  - Verified 2026-10-03 · Claude Opus 5.5 · schema + table + create/list · 8454ea0
- [x] Class architecture
  - Verified 2026-10-03 · Claude Opus 5.5 · 4 placeholder classes, cross-validated; proficiencies enforced by equip tests · 8454ea0
- [x] Specialisation architecture
  - Verified 2026-10-03 · Claude Opus 5.5 · 13 placeholder specs in data, validated at load. No spec selection flow · 8454ea0
- [x] Stats
  - Verified 2026-10-03 · Claude Opus 5.5 · `getCharacterStats` (class base + level + equipped items) — unit test (game-data), domain integration test, API `/stats` test, realtime `character.stats` push test, Inventory E2E visible change · 418b1fd
- [ ] XP
  - Data-driven curve + `applyExperience` unit-tested; nothing awards XP yet.
- [ ] Levels
  - Level stored and used for equip checks; no levelling flow.
- [ ] Abilities
  - Data definitions only; no combat.

# Combat

- [ ] Melee combat
- [ ] Ranged combat
- [ ] Magic combat
- [ ] Healing
- [ ] Enemy combat
- [ ] Damage validation

# Items

- [x] Item templates
  - Verified 2026-10-03 · Claude Opus 5.5 · 15 validated templates; schema refinements tested · 8454ea0
- [x] Item instances
  - Verified 2026-10-03 · Claude Opus 5.5 · minted only by grantItemInTx; tests · 8454ea0
- [x] Unique IDs
  - Verified 2026-10-03 · Claude Opus 5.5 · UUIDv7 (unit test) + concurrent-claim test yields exactly one row · 8454ea0
- [x] Rarity
  - Verified 2026-10-03 · Claude Opus 5.5 · data-driven table; rolled rarity affects stats/modifiers/sockets (unit tests) · 8454ea0
- [x] Stats
  - Verified 2026-10-03 · Claude Opus 5.5 · rolled per instance within template ranges × rarity (unit tests) · 8454ea0
- [x] Modifiers
  - Verified 2026-10-03 · Claude Opus 5.5 · rolled from data pool by rarity (unit tests) · 8454ea0
- [ ] Durability
  - Stored on instances (current/max); nothing reduces or repairs it yet.
- [x] Binding
  - Verified 2026-10-03 · Claude Opus 5.5 · on_pickup and on_equip binding + account-vault restriction tested; account binding untested · 8454ea0
- [x] Provenance/history
  - Verified 2026-10-03 · Claude Opus 5.5 · history events asserted across create/move/list/sell · 8454ea0

# Equipment

- [x] Equipment slots
  - Verified 2026-10-03 · Claude Opus 5.5 · 16 data-driven slots · 8454ea0
- [x] Equip
  - Verified 2026-10-03 · Claude Opus 5.5 · integration tests incl. swap and bind-on-equip · 8454ea0
- [x] Unequip
  - Verified 2026-10-03 · Claude Opus 5.5 · integration test · 8454ea0
- [x] Validation
  - Verified 2026-10-03 · Claude Opus 5.5 · slot/class/proficiency/level/two-hand rules (unit + integration) · 8454ea0
- [x] Stat application
  - Verified 2026-10-03 · Claude Opus 5.5 · equip/unequip changes effective stats (domain + realtime tests; Inventory E2E strength base → base + sword → base). No combat consumes stats yet · 418b1fd

# Inventory

- [x] Backpack
  - Verified 2026-10-03 · Claude Opus 5.5 · tests · 8454ea0
- [x] Material pouch
  - Verified 2026-10-03 · Claude Opus 5.5 · materials routed to pouch; non-materials rejected (tests) · 8454ea0
- [x] Stacking
  - Verified 2026-10-03 · Claude Opus 5.5 · merge on acquisition with provenance (test) · 8454ea0
- [x] Inventory UI
  - Verified 2026-10-03 · Claude Opus 5.5 · React bag window (backpack/materials slot grids, icon placeholders, rarity borders, stack counts, wallet), tooltips with requirements and comparison, tap-friendly details sheet; Inventory E2E incl. 390×844 touch layout · 418b1fd
- [x] Equipment UI
  - Verified 2026-10-03 · Claude Opus 5.5 · character panel paper-doll from game-data slots with equipped markers + effective stats table; equip/unequip/swap via API (Inventory E2E) · 418b1fd
- [x] Vault/bank UI
  - Verified 2026-10-03 · Claude Opus 5.5 · bank window (personal + shared vault tabs, backpack below); deposit/retrieve verified in Inventory E2E and DB. Placeholder: bank opens anywhere (no banker proximity check) · 418b1fd
- [ ] Sorting
- [ ] Filtering
  - Client helper `filterItems` exists in @mmo/ui; untested, unused.
- [x] Locking
  - Verified 2026-10-03 · Claude Opus 5.5 · locked flag blocks marketplace listing (test) · 8454ea0
- [ ] Favourites
  - Flag stored and settable via API; no test, no UI.
- [ ] Junk marking
  - Flag stored and settable via API; no test, no UI.

# Storage

- [x] Character vault
  - Verified 2026-10-03 · Claude Opus 5.5 · tests · 8454ea0
- [x] Account vault
  - Verified 2026-10-03 · Claude Opus 5.5 · shared across characters of one account; bound items refused (tests) · 8454ea0
- [ ] Guild vault
  - Container kind + DB constraint only; access always denied.

# Economy

- [x] Currency model
  - Verified 2026-10-03 · Claude Opus 5.5 · data-defined currencies (character/account scope), wallets, caps · 8454ea0
- [x] Currency transactions
  - Verified 2026-10-03 · Claude Opus 5.5 · locked adjustments, overdraft rejected, ledger sum == balance (test) · 8454ea0
- [x] Audit trail
  - Verified 2026-10-03 · Claude Opus 5.5 · currency_ledger verified by test; audit_log rows written for buys and admin grant/revoke (not asserted by tests) · 8454ea0

# Trading

- [ ] Player trade
  - Model only (Trade schema, trade_escrow location).
- [ ] Trade validation
- [ ] Atomic exchange
- [ ] Exploit protection

# Marketplace

- [x] Listings
  - Verified 2026-10-03 · Claude Opus 5.5 · escrow + fee (test) · 8454ea0
- [x] Buy
  - Verified 2026-10-03 · Claude Opus 5.5 · atomic item+currency transfer (test) · 8454ea0
- [x] Sell
  - Verified 2026-10-03 · Claude Opus 5.5 · seller proceeds minus sale fee (test) · 8454ea0
- [x] Cancel
  - Verified 2026-10-03 · Claude Opus 5.5 · test · 8454ea0
- [x] Expiry
  - Verified 2026-10-03 · Claude Opus 5.5 · expireListings returns item (test) · 8454ea0
- [x] Fees
  - Verified 2026-10-03 · Claude Opus 5.5 · listing + sale fees from data (unit + integration) · 8454ea0
- [x] Transaction history
  - Verified 2026-10-03 · Claude Opus 5.5 · marketplace_transactions row per sale (test) · 8454ea0
- [x] Duplication protection
  - Verified 2026-10-03 · Claude Opus 5.5 · 5 concurrent buyers → exactly 1 sale (test) · 8454ea0

# World

- [x] Region model
  - Verified 2026-10-03 · Claude Opus 5.5 · schema + demo region, cross-validated · 8454ea0
- [x] Zone model
  - Verified 2026-10-03 · Claude Opus 5.5 · schema + demo zone, bounds enforced by movement validation · 8454ea0
- [x] Chunk model
  - Verified 2026-10-03 · Claude Opus 5.5 · 2×2 demo chunks; spawn-in-chunk validation; chunk-based interest (tests) · 8454ea0
- [ ] Streaming
  - Per-chunk build/dispose exists; all chunks of the zone load at once.
- [ ] Towns
- [ ] Wilderness
- [ ] Caves
- [ ] Dynamic events

# Quests

- [ ] Quest model
  - Placeholder schema only.
- [ ] Quest states
- [ ] Rewards

# Dungeons

- [ ] Dungeon architecture
  - Placeholder schema only.
- [ ] Instance architecture
- [ ] Boss encounters

# Crafting / Gathering

- [ ] Materials
  - Material templates exist and stack into the pouch; no gathering/crafting use.
- [ ] Gathering
- [ ] Recipes
- [ ] Crafting

# Social

- [ ] Friends
- [ ] Parties
- [ ] Guilds
- [ ] Direct messages
- [ ] Group chat
- [ ] Guild chat
  - Social schemas are placeholders only.

# Mobile Companion App

- [ ] App foundation
- [ ] Login
- [ ] Inventory
- [ ] Vault
- [ ] Marketplace
- [ ] Trades
- [ ] Friends
- [ ] Guilds
- [ ] Messaging
- [ ] Notifications
  - Only `apps/companion-app-placeholder/README.md` and docs/mobile/companion-app.md exist.

# Art Pipeline

- [x] Naming conventions
  - Verified 2026-10-03 · Claude Opus 5.5 · documented; enforced by `pnpm assets:check` (exercised manually) · 7fa2d8e
- [x] Concepts folder
  - Verified 2026-10-03 · Claude Opus 5.5 · created with README/.gitkeep · 7fa2d8e
- [x] Models folder
  - Verified 2026-10-03 · Claude Opus 5.5 · created with README/.gitkeep · 7fa2d8e
- [x] Textures folder
  - Verified 2026-10-03 · Claude Opus 5.5 · created with README/.gitkeep · 7fa2d8e
- [x] Icons folder
  - Verified 2026-10-03 · Claude Opus 5.5 · created with README/.gitkeep · 7fa2d8e
- [x] Generated assets rules
  - Verified 2026-10-03 · Claude Opus 5.5 · `assets:promote` refuses to overwrite (manually exercised); git-ignore rules for caches/renders · 7fa2d8e
- [ ] GLB/GLTF pipeline
- [ ] AI-assisted generation pipeline
- [ ] Blender automation

# Security

- [x] Threat model
  - Verified 2026-10-03 · Claude Opus 5.5 · docs/architecture/security.md · 7fa2d8e
- [x] Item duplication protection
  - Verified 2026-10-03 · Claude Opus 5.5 · constraints + concurrency tests · 8454ea0
- [x] Currency protection
  - Verified 2026-10-03 · Claude Opus 5.5 · CHECK >= 0, locked adjustments, ledger (tests) · 8454ea0
- [ ] Trade protection
  - Trading not implemented.
- [x] Marketplace race-condition protection
  - Verified 2026-10-03 · Claude Opus 5.5 · concurrent buyer test · 8454ea0
- [x] WebSocket validation
  - Verified 2026-10-03 · Claude Opus 5.5 · protocol unit tests + forged/replay/origin tests · 0f0a413
- [x] Admin permissions
  - Verified 2026-10-03 · Claude Opus 5.5 · API test: player 403, admin allowed; admin UI gate checked in browser · 0f0a413

# Testing

- [x] Unit tests
  - Verified 2026-10-03 · Claude Opus 5.5 · 40 tests across 8 packages · 0f0a413
- [x] Integration tests
  - Verified 2026-10-03 · Claude Opus 5.5 · 33 tests (domain 24, API 5, realtime 4) on PostgreSQL 16 · 0f0a413
- [x] Item ownership tests
  - Verified 2026-10-03 · Claude Opus 5.5 · items.test.ts · 8454ea0
- [x] Inventory transfer tests
  - Verified 2026-10-03 · Claude Opus 5.5 · storage.test.ts · 8454ea0
- [x] Vault transfer tests
  - Verified 2026-10-03 · Claude Opus 5.5 · storage.test.ts · 8454ea0
- [x] Marketplace tests
  - Verified 2026-10-03 · Claude Opus 5.5 · marketplace.test.ts · 8454ea0
- [x] Realtime protocol tests
  - Verified 2026-10-03 · Claude Opus 5.5 · networking protocol.test.ts + realtime.test.ts · 0f0a413

# Deployment

- [ ] Development deployment
  - Runs locally only (`pnpm dev`, or bundled `node services/*/dist/main.js` — verified). No hosted dev environment.
- [ ] Production strategy
  - Documented in docs/architecture/overview.md; nothing implemented.
- [x] Health endpoints
  - Verified 2026-10-03 · Claude Opus 5.5 · /health/live + /health/ready on API and realtime (API test; curl against running services) · 0f0a413
- [x] Logging
  - Verified 2026-10-03 · Claude Opus 5.5 · pino JSON with requestId/connectionId/accountId/characterId (observed in realtime logs) · 0f0a413
- [x] Metrics-ready architecture
  - Verified 2026-10-03 · Claude Opus 5.5 · Prometheus-text /metrics on both services (unit + API test) · 0f0a413
- [ ] Backups

## Current Work

Nothing in progress. Milestone "playable inventory + equipment loop" is complete on branch `claude/great-brahmagupta-h834j7` (commit `418b1fd`), awaiting owner review; not merged to `main`.

## Known Issues

1. **CI not enabled and never executed.** The workflow is a template at `docs/ci/github-actions-ci.yml` (automation could not push `.github/workflows/` files). A maintainer must move it into place; it may need fixes on first run.
2. **WebGPU unverified.** `?renderer=webgpu` path compiles but was never run on real GPU hardware; WebGL2 is the default.
3. **Single realtime process per zone.** Two realtime processes hosting the same zone would run divergent simulations. No zone registry yet. (The change feed itself works with several processes.)
4. **Change feed is not durable.** NOTIFY events emitted while the listener is disconnected are lost; correctness relies on the full resync after reconnect (tested). Needs a direct DB connection (not PgBouncer transaction mode).
5. **Reconnect = full snapshot.** No session resume/replay buffer; an expired session cannot reconnect (client shows "Disconnected"; reload to log in). The game client keeps the token in memory only.
6. **Bank opens anywhere.** No banker NPC/proximity rule yet (server would need the player's position from the realtime service).
7. **No drag-and-drop, sorting, search, split-stack or loadout UI.** Actions are via the details sheet. Icons are text placeholders.
8. **Main game JS chunk grew ~44 → ~181 KB gzip** with React + UI (measured, not analysed); Babylon chunk ≈1.9 MB minified still dominates; lazy shader chunks are merged into it by `manualChunks`.
9. **One-handed weapons always equip to the main hand.** Off-hand one-handers are possible via the API but not from the UI; dual-wield rules are undesigned.
10. **Expired listings with a full bag** stay in escrow until the seller has space (no mailbox). The expiry sweep runs in every API process (safe, wasteful with replicas).
11. **Lock-order inversion between grant and move** (grant locks container then stack items; move locks item then containers) can deadlock under contention; PostgreSQL detects it and `inTransaction` retries, but it is not eliminated.
12. **`item_instances.listing_id` has no foreign key** (circular with listings); escrow consistency is enforced in domain code and checked on cancel/buy.
13. **Position persistence untested.** Positions are saved every 15 s and on disconnect, but no test asserts it.
14. **Stack-merge rows accumulate** (`destroyed/stack_merged`); archiving needed eventually.
15. **Dev auth only.** Anyone can log in as any username when `AUTH_DEV_LOGIN_ENABLED=true`. Usernames in `AUTH_DEV_ADMIN_USERNAMES` become admins on first login.
16. **Camera drag/zoom** still not covered by an automated check.
17. drizzle-kit pulls deprecated `@esbuild-kit/*` sub-dependencies (warning only).

## Next Recommended Task

**Milestone: combat foundation (server-authoritative), against the placeholder Grey Wolf already in game data.**

1. Enable CI (move `docs/ci/github-actions-ci.yml` to `.github/workflows/ci.yml`) and fix anything it finds.
2. Spawn enemies from `enemy` spawn points in the zone simulation; replicate health.
3. Targeting + auto-attack using effective stats (`getCharacterStats`) and weapon damage; server-side range, cooldown and damage validation; death/respawn.
4. Loot drops via the existing `LootTable` + `grantItemInTx` (personal loot), XP via `applyExperience`, both persisted transactionally and pushed through the existing change feed.
5. Minimal target frame + combat log in the React HUD.

Keep marketplace UI, trading, crafting and social out of that milestone.
