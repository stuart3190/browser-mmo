# Architecture Decision Log

All major architecture decisions for this project should be recorded here, so that future agents and models do not unknowingly reverse them.

Rules for this log:

- Add a new entry for every meaningful architectural decision.
- Entries are append-only. To change a decision, add a new entry that supersedes the old one and say which entry it supersedes.
- Do not record invented or speculative decisions. Record only what has actually been decided.
- Undecided questions are listed under "Open questions" at the bottom until they are decided.

## Entry format

```markdown
## YYYY-MM-DD — Decision title

**Decision**
What was chosen.

**Reason**
Why it was chosen.

**Alternatives considered**
Other serious options.

**Consequences**
Trade-offs and future implications.
```

---

The entries below were recorded when the project memory files were created. They are the decisions already clearly implied by the project specification in `docs/MASTER_PLAN.md`. No implementation existed at the time.

## 2026-10-03 — Browser-first game client

**Decision**
The game runs directly in the browser, using a serious browser 3D engine with WebGL/WebGPU-capable rendering.

**Reason**
The project specification defines the game as a browser-first MMORPG: no install, immediate access.

**Alternatives considered**
A native desktop client. A downloadable engine-based client.

**Consequences**
Rendering, asset sizes, and memory use must fit browser limits, which makes asset streaming and chunked world loading necessary. The specific engine is not yet chosen (see Open questions).

## 2026-10-03 — No Unity

**Decision**
Unity is not used for this project.

**Reason**
Stated explicitly in the project specification. The game is browser-first and built on a TypeScript web stack.

**Alternatives considered**
Unity with a WebGL export.

**Consequences**
The client is built with a browser-native 3D engine. Babylon.js and Three.js are both acceptable candidates.

## 2026-10-03 — Server-authoritative gameplay and economy

**Decision**
The server is authoritative for gameplay and the economy. The browser is never trusted for currency, item generation, loot, combat outcomes, marketplace actions, trades, or progression.

**Reason**
A persistent MMO with tradable items and a player economy cannot tolerate duplication, currency manipulation, or forged client requests.

**Alternatives considered**
Client-authoritative logic with server-side checks after the fact. Peer-to-peer authority.

**Consequences**
Every gameplay and economy action needs server-side validation and proper database transaction boundaries. Clients send intent; the server decides outcomes. This costs more server work and adds latency considerations for combat and movement.

## 2026-10-03 — One persistent game, no sequels

**Decision**
This is one persistent game that grows over time. It is not a throwaway prototype and not the first of several games.

**Reason**
Stated in the project specification. Growth happens through new regions, classes, dungeons, bosses, quests, items, systems, world events, social systems, mobile features, and live-service content.

**Alternatives considered**
A disposable prototype followed by a rewrite. A series of separate games.

**Consequences**
Data models, content systems, and the world structure must be extensible and data-driven. Schema changes need migrations that preserve existing player data. Shortcuts that would force a rewrite later should be avoided.

## 2026-10-03 — No blockchain implementation now

**Decision**
Crypto is not part of the public game design. No blockchain is implemented, no crypto terminology appears in the UI, and the game is not built around NFTs. The game database is the source of truth for item ownership. Item records may carry dormant fields (`externalOwnershipEnabled`, `externalAssetId`, `externalNetwork`) that have no gameplay effect.

**Reason**
Stated in the project specification. The dormant fields keep optional external ownership possible later without redesigning the item system.

**Alternatives considered**
Building on-chain ownership now. Omitting the dormant fields entirely.

**Consequences**
No code path may read the dormant fields for gameplay purposes. If external ownership is ever added, it must be recorded here as a new decision, and the database remains authoritative unless that decision says otherwise.

## 2026-10-03 — Mobile companion app shares the backend

**Decision**
The future mobile companion app uses the same backend and shared schemas as the browser game. The backend must never assume the browser client is the only client.

**Reason**
Stated in the project specification. Inventory, vault, marketplace, trading, social, and messaging features must behave identically on both clients.

**Alternatives considered**
A separate mobile backend. A mobile-specific API layer with its own data rules.

**Consequences**
APIs and schemas are client-agnostic and shared through common packages. Auth, sessions, and notifications must support more than one client type. Business rules live on the server, not in either client.

## 2026-10-03 — Separate item templates from item instances

**Decision**
Item templates (for example "Iron Longsword") are separate from item instances (one specific Iron Longsword with its own unique ID, owner, modifiers, durability, and history). Every tradable item instance has a globally unique immutable ID. An item instance must never exist in incompatible states at once (equipped, inventory, vault, active trade, marketplace listing).

**Reason**
Stated in the project specification. This is required for per-item modifiers, provenance, ownership history, trading, and duplication prevention.

**Alternatives considered**
Storing items only as template ID plus quantity per container.

**Consequences**
The instance table must scale to millions of rows. Each instance needs a single authoritative location, and moves between locations must be transactional. Stackable items (materials, consumables) need a defined approach within this model, which is not yet decided.

## 2026-10-03 — Monorepo tooling: pnpm workspaces + Turborepo, strict TypeScript 6

**Decision**
One repository with pnpm workspaces (`apps/*`, `services/*`, `packages/*`), Turborepo task orchestration, strict TypeScript 6 (`noUncheckedIndexedAccess`), one root ESLint flat config, Prettier, Vitest. Turborepo `agentGuidance` is disabled so the tool does not inject text into `AGENTS.md`. Full record: `docs/adr/0001-monorepo-pnpm-turborepo.md`.

**Reason**
Shared schemas/content/protocol across browser, servers, admin and future mobile app; strict pnpm dependency isolation; cacheable tasks.

**Alternatives considered**
npm/yarn workspaces, Nx, polyrepo. TypeScript 7 (not yet supported by typescript-eslint).

**Consequences**
Each package declares its own dependencies. Internal packages ship TS source and services are bundled with tsup (`docs/adr/0012-source-packages-bundled-services.md`).

## 2026-10-03 — Browser 3D engine: Babylon.js

**Decision**
Babylon.js (`@babylonjs/core`, deep ES imports). WebGL2 is the default; WebGPU is wired behind `?renderer=webgpu` with fallback. Full comparison with Three.js: `docs/adr/0002-babylonjs-client-engine.md`.

**Reason**
Full game engine (scene graph, cameras, input, collisions, asset containers, LOD, instancing, inspector), first-class WebGPU with the same API as WebGL, written in TypeScript, strong backwards-compatibility policy — important for a multi-year project.

**Alternatives considered**
Three.js (smaller, huge ecosystem, but a rendering library needing more DIY game systems and with more frequent breaking changes), PlayCanvas, a custom renderer.

**Consequences**
Gameplay code depends on `AbstractEngine` only. The engine chunk is ~1.9 MB minified. WebGPU path is not yet verified on real GPU hardware.

## 2026-10-03 — Database layer: PostgreSQL + Drizzle ORM

**Decision**
PostgreSQL 16+ with Drizzle ORM (`pg` driver). drizzle-kit generates SQL migrations that are reviewed, committed and applied by `pnpm db:migrate`. `docs/adr/0003-postgresql-drizzle.md`.

**Reason**
The economy needs CHECK constraints, partial unique indexes and `SELECT ... FOR UPDATE` expressed directly; Drizzle is SQL-first with plain-SQL migrations and no generated client/engine binary. Prisma would need raw SQL for row locks and partial indexes.

**Alternatives considered**
Prisma, Kysely, raw `pg`.

**Consequences**
Contributors need SQL knowledge. Applied migrations are never edited.

## 2026-10-03 — Modular monolith with a shared domain package

**Decision**
Business rules live in `@mmo/domain` (DB-backed) and `@mmo/game-data` (pure). `services/api` (Fastify) and `services/realtime` (ws) are thin hosts. `services/world` is the zone-simulation library, hosted in-process by realtime. `docs/adr/0004-modular-monolith.md`, `docs/adr/0010-fastify-http.md`.

**Reason**
Avoid premature microservices while keeping a clean split path; one implementation of every rule for HTTP and WebSocket callers.

**Alternatives considered**
Microservices now; one process for everything.

**Consequences**
Only one realtime process may host a given zone until a zone registry exists.

## 2026-10-03 — Realtime: WebSockets with a typed, versioned JSON protocol

**Decision**
`ws` WebSocket server at `/ws`; envelope `{v,t,seq,ack,d}` validated by Zod on both ends; protocol version 1; session token in the first `auth.hello` frame; strictly increasing `seq` for replay protection; client sends intent only. `docs/adr/0005-realtime-websocket-protocol.md`, `docs/architecture/realtime.md`.

**Reason**
Universal browser/mobile support, simple operations, typed contracts shared by all clients.

**Alternatives considered**
WebTransport, Socket.IO, uWebSockets.js, a binary codec now.

**Consequences**
JSON bandwidth cost; binary encoding is a candidate for protocol v2. Tick 20 Hz, chunk-based interest management.

## 2026-10-03 — Item location stored on the item instance row

**Decision**
An item's single authoritative location is a set of columns on its `item_instances` row (`location_kind` + kind-specific columns), enforced by CHECK and partial unique constraints. All slot stores (backpack, material pouch, character vault, account vault, guild vault) are rows of one `containers` table. Equipment is a location kind, not a table. Item rows are never deleted. `docs/adr/0006-item-location-invariant.md`.

**Reason**
Makes "an item can never be in two places" structurally true; separate inventory/equipment/vault tables cannot enforce cross-table uniqueness.

**Alternatives considered**
Separate `inventory_slots`/`equipment`/`vault_items` tables; an `item_locations` side table.

**Consequences**
The requested `inventories`, `inventory_slots`, `equipment`, `vaults`, `vault_items` tables are represented by `containers` + location columns (mapping in `docs/architecture/database.md`). Equip swaps use a transaction-local scratch slot.

## 2026-10-03 — Stackable items are instances with a quantity

**Decision**
Resolves the open question on stackables. A stack is one item instance with `quantity`. Every acquisition inserts its own row; if it is fully merged into existing stacks, that row is stored as `destroyed / stack_merged` with history. `docs/adr/0007-stackable-items.md`.

**Reason**
Keeps template/instance separation, per-acquisition provenance, and uniform `source_ref` dedupe.

**Alternatives considered**
Template + count per container; never merging.

**Consequences**
Extra rows for high-volume materials; archiving of destroyed rows will be needed later.

## 2026-10-03 — Authentication: provider abstraction + opaque database sessions

**Decision**
`AuthProvider` interface with one `DevAuthProvider` (username only; refused in production). `auth_identities` table for linked logins. Opaque 256-bit bearer tokens, SHA-256 hashed at rest, with client kind, expiry and revocation. The realtime service validates the same token. `docs/adr/0008-auth-sessions.md`.

**Reason**
Revocable sessions (bans, compromise) and a clean path to email/password and OAuth.

**Alternatives considered**
JWTs; a hosted auth provider now.

**Consequences**
Session lookup per request (cache later).

## 2026-10-03 — UUIDv7 identifiers

**Decision**
All persistent entity IDs (including item instance IDs) are application-generated UUIDv7. Content uses stable slugs. `docs/adr/0009-uuidv7-ids.md`.

**Reason**
Time-ordered keys keep very large tables (item instances, history) index-friendly.

**Alternatives considered**
UUIDv4, bigserial.

**Consequences**
IDs reveal creation time. Clients never mint authoritative IDs.

## 2026-10-03 — Redis deferred

**Decision**
Redis is not used yet. It will be introduced with the first feature that needs it (cross-process pub/sub, zone registry, session cache, global rate limits, job queues). `docs/adr/0011-redis-deferred.md`.

**Reason**
Nothing in the current foundation needs it; keeps local setup to Node + PostgreSQL.

**Alternatives considered**
Adding Redis now for sessions/presence.

**Consequences**
Single realtime process per zone; API→game inventory push notifications are not possible yet.

## 2026-10-03 — In-game UI: React rendered as a DOM overlay

**Decision**
The browser game's UI (inventory, character/equipment, bank, tooltips, HUD) is React 19 rendered into a DOM overlay above the Babylon canvas, subscribed to a plain client state store. Framework-free item logic (version-aware reconciliation, equip targeting, comparisons, requirements) lives in `@mmo/ui`. Layout is responsive: floating windows on desktop, bottom sheets with large touch targets on narrow/touch screens. `docs/adr/0013-react-game-ui.md`.

**Reason**
Real MMO windows/tooltips need a component model; React is already used by the admin app and is the likely basis for the companion app; DOM UI is easier to style, localise and make accessible than canvas UI.

**Alternatives considered**
Babylon GUI, plain DOM, Preact, Solid.

**Consequences**
Resolves the "Game HUD/UI framework" open question. Main game chunk grew from ~44 KB to ~181 KB gzip (measured; not yet analysed). Every item action must be reachable by tap (hover is an enhancement only).

## 2026-10-03 — Realtime pushes via a PostgreSQL LISTEN/NOTIFY change feed

**Decision**
Triggers on `item_instances` and `currency_balances` publish ID-only notifications on channel `mmo_changes` (migration 0001). The realtime service listens, re-reads authoritative rows and pushes `inventory.updated` (with `removed` tombstones), `character.stats` and `wallet.updated` to affected connections; after every listener reconnect it resends full snapshots. Clients reconcile by item `version`. `docs/adr/0014-postgres-change-feed.md`.

**Reason**
Changes made through the HTTP API, admin tools or jobs must reach connected clients. NOTIFY is transactional (no phantom pushes for rolled-back writes), needs no new infrastructure, and triggers cannot be forgotten by new write paths.

**Alternatives considered**
Redis pub/sub (ADR 0011's plan; not transactional without an outbox), explicit notify calls in domain code, transactional outbox + poller.

**Consequences**
Partially addresses ADR 0011: Redis is still not used. NOTIFY is not durable, so correctness relies on resync-on-reconnect. The listener needs a direct (non-PgBouncer-transaction-mode) connection. Revisit when write volume or multi-region needs demand a durable stream.

## 2026-10-03 — Realtime client reconnect and close-code policy

**Decision**
`RealtimeClient` reconnects automatically with exponential backoff after unexpected drops and re-sends `auth.hello`; every `auth.ok` is followed by fresh snapshots and the client rebuilds its view from them. Close codes ≥ 4000 are deliberate server decisions (invalid session, session replaced, protocol error) and are never retried. The server pings every 30 s and terminates connections that miss a pong. Protocol v1 gained backwards-compatible additions: `inventory.updated.removed`, reason `sync`, and the `character.stats` and `wallet.updated` messages.

**Reason**
Dropped connections must recover without a page reload, without two tabs fighting over one character, and without stale state.

**Alternatives considered**
Session-resume with server-side replay buffers (more complex; snapshots are cheap at current state sizes).

**Consequences**
Reconnect cost is a full snapshot. Old clients that do not know the new message types ignore them (`parseServerMessage` drops unknown types); the new `sync` reason would be rejected by a client built before it, which is acceptable while only one client exists.

---

## Open questions

These are not yet decided. Record a dated entry above when one is.

- Large binary asset storage (Git LFS vs external asset store/CDN).
- Realtime horizontal scaling: zone registry and routing design.
- Movement model: input-based server simulation vs validated client positions (current).
- Mobile companion app framework.

Resolved on 2026-10-03 (see entries above): in-game UI framework (React DOM overlay), browser 3D engine (Babylon.js), ORM (Drizzle), realtime server design (ws + versioned JSON protocol, in-process zone simulations), authentication approach (provider abstraction + opaque sessions), stackable items (instances with quantity).

The preferred technical direction (TypeScript, Node.js, pnpm workspace monorepo, PostgreSQL, Redis where useful, WebSockets, Zod or equivalent, Vitest or equivalent, ESLint, Prettier) is listed in `docs/MASTER_PLAN.md` as a preference. All of these except Redis were adopted on 2026-10-03.
