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

## 2026-10-03 — Server-authoritative combat in the zone tick, exactly-once rewards, reconnect linger

**Decision**
Combat (targeting, melee auto-attack swing timers, enemy AI, death, respawn, regen) runs inside the existing 20 Hz `ZoneSimulation` tick with no per-entity timers; formulas are pure, data-driven functions in `@mmo/game-data`. Clients may only send `target.set`, `combat.attack` and `combat.respawn`. Kills are credited to the first character that damaged the enemy and persisted by the gateway with `awardKill` in one transaction (XP/level, loot via `grantItemInTx`, gold via the ledger), made exactly-once by the `kill_rewards (kill_id, character_id)` primary key. Item changes refresh the in-world combat profile. A closed connection leaves its character in the world for 10 s; reconnecting re-attaches to it. `docs/adr/0015-server-authoritative-combat.md`, `docs/gameplay/combat.md`.

**Reason**
Keeps every outcome server-side and testable, reuses the existing tick and item pipeline, makes duplicate rewards structurally impossible, and prevents escaping fights by disconnecting.

**Alternatives considered**
Client-timed attacks, per-entity timers, rewards inside the simulation, immediate removal on disconnect.

**Consequences**
Kill events are in memory until persisted (a crash in that window loses the reward). Per-tick cost grows with entities × players. A disconnected character stays vulnerable for 10 s.

---

## 2026-10-04 — Data-driven collision, grid navigation and spawn-group population

**Decision**
One prop-shape table drives both placeholder visuals and gameplay colliders; a pure `CollisionWorld` (spatial hash: overlap, swept movement, line of sight, slide) is shared by server movement validation, combat LOS, enemy steering and client prediction; enemies path with a lazily built 1 m `NavGrid` (A* + smoothing) and give up/return when stuck or unreachable; zones populate through data-driven spawn groups (`maxAlive`, respawn window, minimum player distance) filled from the tick. `docs/adr/0016-world-collision-navigation-population.md`.

**Reason**
Obstacles must block movement and sight consistently on client and server, enemies must not walk through walls or attack through them, and population must scale without per-entity timers.

**Alternatives considered**
Physics engine on both sides; Recast navmesh; per-enemy spawn points only.

**Consequences**
2D collision only (no height/levels yet); static obstacles only; navigation can be swapped behind `findPath`.

---

## 2026-10-04 — Write-ahead kill events (outbox) and mailbox overflow loot

**Decision**
Supersedes the "kill events are in memory until persisted" consequence of the 2026-10-03 combat entry. Enemy deaths are recorded in `kill_events` before they become visible (`dying` → record → `confirmKill`); rewards are applied from the row exactly once (`FOR UPDATE SKIP LOCKED`, status in the same transaction), retried with backoff, recovered on startup and by a periodic sweep; persisted respawn times are restored into zones on start. Loot that does not fit the bags goes to a system-only `mailbox` container ("Recovered loot"); a full mailbox keeps the kill pending instead of dropping loot. `docs/adr/0017-durable-kill-events-mailbox.md`.

**Reason**
A crash or DB failure must never lose, duplicate or partially apply a legitimate reward, resurrect a recorded death early, or destroy loot because bags are full.

**Alternatives considered**
Recording and rewarding in one transaction; corpse looting first; deterministic loot seeds.

**Consequences**
Deaths are announced one DB write later; a full mailbox delays the whole reward; `kill_events` needs a retention job before production.

---

## 2026-10-04 — Quest foundation

**Decision**
Quest definitions are game data; `character_quests` stores one row per character and quest (`active` / `completed`, kill counters, timestamps). Kill objectives advance inside the existing exactly-once kill-reward transaction; collect objectives are derived from authoritative inventory (backpack, material pouch and Recovered loot; unlocked items only) and consumed at turn-in; turn-in (consume, XP, currency, items with Recovered-loot overflow, completion) is one transaction. NPC interaction and quest actions go through the realtime gateway, which validates the NPC entity and range from the zone simulation. `docs/adr/0018-quest-foundation.md`, `docs/gameplay/quests.md`.

**Reason**
Exactly-once progress and rewards without a second kill path or an item-acquisition ledger; range checks need the simulation's authoritative position.

**Alternatives considered**
Acquisition-event counting for collect objectives; a generic quest engine; quest actions over HTTP.

**Consequences**
Selling or vaulting quest items lowers progress (intended); a full Recovered loot box blocks turn-in until there is room; repeatable quests need a schema extension.

---

## 2026-10-04 — Playable classes and server-authoritative abilities

**Decision**
Warrior and Mage are the only playable classes (`playable` flag gates creation). Abilities are data (class, unlock level, range, cooldown, damage school/base/weapon multiplier/stat scaling) executed synchronously by `ZoneSimulation.useAbility` against the current server-side target, with server-clock cooldowns plus a 1 s global cooldown; running cooldowns are saved to `characters.ability_cooldowns` on leaving the world. No resource system yet. `docs/adr/0019-class-abilities.md`, `docs/gameplay/classes.md`.

**Reason**
Keeps every check and outcome on the server's single-threaded tick world (no double execution), reuses targeting, stats and the kill pipeline, and stays extensible for future classes.

**Alternatives considered**
Client cooldown timers, per-use cooldown history rows, introducing mana/rage now.

**Consequences**
Only instant single-target hostile abilities; casts/AoE/heals/effects need an effect grammar later. A crash can drop unsaved cooldowns (≤ 12 s).

---

## Open questions

These are not yet decided. Record a dated entry above when one is.

- Large binary asset storage (Git LFS vs external asset store/CDN).
- Realtime horizontal scaling: zone registry and routing design.
- Movement model: input-based server simulation vs validated client positions (current).
- Mobile companion app framework.

Resolved on 2026-10-03 (see entries above): in-game UI framework (React DOM overlay), browser 3D engine (Babylon.js), ORM (Drizzle), realtime server design (ws + versioned JSON protocol, in-process zone simulations), authentication approach (provider abstraction + opaque sessions), stackable items (instances with quantity).

The preferred technical direction (TypeScript, Node.js, pnpm workspace monorepo, PostgreSQL, Redis where useful, WebSockets, Zod or equivalent, Vitest or equivalent, ESLint, Prettier) is listed in `docs/MASTER_PLAN.md` as a preference. All of these except Redis were adopted on 2026-10-03.

---

## 2026-10-04 — Pre-alpha admission, state ordering and bounded reconciliation

**Date**
2026-10-04

**Decision**
Keep the current PostgreSQL + Fastify + WebSocket + in-process zone architecture. Replace
per-message movement tolerance with cumulative distance credit: class speed replenishes the
budget, initial credit is 0.75 m and total stored credit is capped at half a second of movement
plus 0.75 m. Collisions and zone bounds remain authoritative.

Guard asynchronous character admission per character. Sequential replacement still closes the
previous controller; overlapping admissions are rejected. Validate map ownership before gameplay
messages. Revalidate active sessions every second, enforce the recorded expiry on ticks/messages,
and disconnect on failed checks or a validation age over five seconds at default settings.
Disconnected characters retain the existing combat linger behavior.

Persist position, rotation, health and unexpired cooldowns with one UPDATE. Non-overlapping periodic
saves include cooldowns. Departure writes follow any running periodic save; failed snapshots stay
in memory and must persist before re-entry reloads the character. Reattachment refreshes gear while
preserving live health and cooldowns.

Bound outbound WebSocket buffering to 256 KiB including the next encoded frame; terminate slow
clients. Cap gateway sockets at 256 and upgrades per source IP at a 20 burst / 2 per second.
Keep the existing 40 burst / 20 per second frame bucket; database actions additionally use an
8 burst / 2 per second bucket, one action at a time per connection and eight concurrent incoming
DB handlers per gateway. HTTP uses source-IP (120 burst / 30 per second), account (60 / 15),
auth POST (10 / 0.5) limits and 16 concurrent authentication/route work slots. Limiter key tables
are bounded and fail closed at capacity. Database connection acquisition, statements and locks
have 5 s, 10 s and 3 s timeouts respectively. Kill record work is capped at four concurrent jobs.
These are starting safety limits, not measured production capacity.

Serialize full snapshots with change-feed fan-out, coalesce refresh requests and bound pending
notification keys. Listener reconnection, query failures and overflow request full reconciliation;
a 30 s sweep also repairs inventory/wallet/quest views and live combat profiles. Keep LISTEN/NOTIFY
as an invalidation hint, not a durable log. Lock the character before item movement/equipment slot
validation, so an empty equipment set is protected against concurrent incompatible equips.

**Reason**
The audit identified exploitable movement allowances, async controller races, missing session
revocation, stale departure reads, unbounded work, lost refreshes and an empty-equipment locking
race. These boundaries need concrete invariants before inviting external players.

**Alternatives considered**
Input-only movement resimulation; per-frame database auth; a new message broker; distributed
session/zone coordination; per-ability durable event sourcing; unrestricted promise queues.
None is necessary for this focused single-host hardening batch. A zone ownership fence remains
a separate required deployment improvement.

**Consequences**
No new gameplay, schema migration, broker or auth provider. Concurrent expensive actions can return
RATE_LIMITED and must be retried after completion/backoff. Session revocation is bounded polling,
not immediate push; an unhealthy database can disconnect valid sessions. Controller and admission
guarantees remain process-local. Reconciliation is eventually consistent. Failed in-memory saves
are not crash-durable; no per-action persistence guarantee is claimed. IP limits require an explicit
trusted ingress review before proxy deployment. Existing grant/move lock-order inversions remain
protected by transaction retries, not eliminated. See PROGRESS for tests and implementation SHA.

---

## 2026-10-04 — Exclusive zone ownership and durable publication

**Date**
2026-10-04

**Decision**
Supersede the previous hardening entry's process-local ownership and periodic-only state durability.
Keep one simulation host per zone and enforce it with PostgreSQL session advisory locks. The pinned
ownership connection also writes versioned recovery images and character health/position/cooldowns
in a single atomic statement with synchronous WAL commit. Never transparently reconnect it. Lost
ownership or failed/ambiguous writes fence ticks, gameplay and publication; replacement requires
fresh ownership and recovery. Normal shutdown confirms lock release. Startup errors release locks.

Capture world/player combat state, stable spawn/pickup identities, respawn queues and pending kills.
Publish authoritative batches only after their checkpoint commits. The simulation continues while
storage publication coalesces; output queues are bounded. Rewards cannot run before the associated
kill enters a durable checkpoint, and the existing unique kill/reward transactions remain final
idempotency barriers. Departure removal and final character state share a checkpoint. Recovering
players retain saved state and disconnect linger; offline combat is not simulated retroactively.
Recovery format version and game-data hash must match, otherwise startup refuses service.

Serialize migration runners with a deployment lock and check applied migration hashes. Zone startup
holds the shared side of that lock while acquiring ownership; a pending migration refuses live zone
owners. Incompatible recovery/content changes require an explicit migration and compatible rollback.

**Reason**
Duplicate hosts could diverge; periodic-only saves lost published health, position and cooldowns.
Keeping locks and commits on the same non-reconnecting connection prevents an old host from writing
through a fresh pool connection after losing authority. Whole recovery images are a small, reviewable
correctness design for the current small world, without introducing a distributed log or broker.

**Alternatives considered**
Timed leases without fencing; Redis coordination; separate ownership and pooled checkpoint writes;
a complete event-sourced simulation; periodic saves with an accepted rollback window. The first and
third permit stale-owner writes, distributed components add failure modes, and periodic saves do not
satisfy published-state durability. Per-entity dirty-state persistence remains a future optimization
if representative measurements justify it.

**Consequences**
Storage latency is now visible in authoritative feedback and database loss disconnects players.
Unpublished predicted inputs may roll back; published state must survive a process crash. Checkpoints
increase WAL/write work and couple recovery to content/version migrations. This is not a scalable
multi-region design or a guarantee against asynchronous PostgreSQL replica data loss. Network
partitions can delay failover until PostgreSQL releases the old session. Do not steal locks or use
transaction-pooled ownership connections. Current measured results do not establish 20 Hz production
capacity; the default five-connection admission cap is a conservative pilot guardrail, not a promise.
See `docs/hardening/2026-10-04.md` for measured evidence and limits.

## 2026-10-04 — Provisioned pre-alpha authentication and operational release gates

**Date**
2026-10-04

**Decision**
Use the existing auth-provider and opaque-session architecture with operator-provisioned password
accounts for invited pre-alpha users. Store salted scrypt hashes (N=131072, r=8, p=1), bound hashing
to two jobs, apply IP/name/work limits and revoke sessions on password rotation. Production refuses
dev auth, missing password auth, non-HTTPS/empty origins and non-loopback service binding. TLS ingress
is mandatory. Trusted forwarding is opt-in, loopback-only, and requires ingress to overwrite headers.
Keep dev auth for development/test only. No public signup, automated reset or social-auth integration.

Provide a consistent-snapshot pg_dump/pg_restore tool with checksum/count manifest, private files,
empty-target protection, economy integrity checks and session revocation after restoration. Keep
production scheduling, encryption, off-host retention and deployment-specific recovery objectives as
explicit operator gates. Maintain one validated CI workflow source and attempt installation through
GitHub; credential rejection must be recorded, with an exact owner copy/commit action, never described
as a hosted CI pass. Browser/capacity scripts record actual observations, including failures to meet
targets, without treating emulated phones as real hardware.

**Reason**
Username-only login cannot reach external players. The current auth abstraction already supports a
small secure invitation flow; a replacement platform is unnecessary. Recovery and deployment need
repeatable evidence rather than documentation-only confidence.

**Alternatives considered**
External OIDC service now; shipping dev auth behind an obscure URL; public self-registration/reset;
manual untested SQL dumps; adding Redis/NATS/Kafka to solve performance without measurements. None
is required for this invited single-region pre-alpha. OIDC/MFA can follow if account operations grow.

**Consequences**
Operators verify identity out of band and provision/rotate credentials; public account lifecycle is
intentionally absent. Production needs actual TLS, private metrics, provisioned accounts, hosted CI
and off-host backups. Local restore and software-rendered browser measurements cannot certify those
external operations or real mobile devices. No gameplay or monetization changes are included.

## 2026-10-04 — Measured simulation deadlines and release qualification

**Date**: 2026-10-04

**Decision**
Anchor simulation scheduling to monotonic 50 ms deadlines. Count expired slots and skip them;
do not manufacture catch-up ticks, relax movement validation, or publish before durable commit.
Keep CPU/method profiling and destructive process fault injection in isolated qualification scripts.
The existing development-only browser debug view may expose read-only scene counts; production
must continue to omit it. Require hosted CI evidence separately from local checks.

**Reason**
An idle 50 ms interval on this VM achieved only 18.25 Hz. A simultaneous timer control measured
17.90 Hz with an accumulating interval versus 18.90 Hz with anchored deadlines. The sampled world
step was about 2 ms at p95 at five players; measurements did not justify rewriting AI, collision,
AOI, or navigation. Database completion and scheduling tails remain qualification concerns.

**Alternatives considered**
Keep accumulating timer drift; backfill many simulation steps after stalls; weaken durable
publication; add a broker; rewrite navigation without measured attribution. These either conceal
missed deadlines, change gameplay/security guarantees, or target an unproven bottleneck.

**Consequences**
A skipped-slot counter exposes overload; this change does not promise 20 Hz on unsuitable hosting.
Capacity requires quiet, controlled measurements with declared limits, not zero error counts alone.
Process-level SIGKILL/SIGSTOP tests complement in-process crash hooks. A paused zone owner retains
its PostgreSQL lock: takeover requires confirmed session termination, never a guessed lease expiry.
No additional distributed ownership service or gameplay feature is introduced.

The CI build step explicitly overrides its test environment with `NODE_ENV=production`. The root
build command checks the emitted game entrypoint for development/debug code and fails closed.
Qualification reproduced a `NODE_ENV=test` release build containing `__mmo` and development React;
the negative check rejected it and the production rebuild passed. This is a release-artifact gate,
not a replacement for production server auth/configuration checks.

## 2026-10-04 — Production-mode qualification remains separate from release approval

**Date**: 2026-10-04

**Decision**
Qualify the existing production bundles through a separate loopback TLS ingress, password-only
authentication and a restricted database runtime role. Keep destructive fixtures and process-fault
controls in disposable-database scripts, outside production entrypoints. Export only read-only queue
pressure gauges. Test populated migration upgrades and restore a real checkpoint before release.

**Reason**
Development-mode load tests alone did not exercise production authentication/ingress. Real combat,
equipment/vault and marketplace traffic still missed the declared tick/RTT gate. Tests established
correctness for deployed ownership, sessions, recovery and restore without justifying a world rewrite.

**Alternatives considered**
Reuse dev login or expose debug controls in production; treat zero errors as capacity certification;
change AI, weaken durable publication or add a broker without measured attribution.

**Consequences**
An isolated TLS certificate, locally encrypted restore and passing local tests do not prove public
hosting, off-host disaster recovery, physical-phone performance or hosted CI. All remain separate
release gates. Keep main unchanged while Actions results are unreadable or capacity gates fail.
See `docs/hardening/production-qualification-2026-10-04.md` for evidence and limitations.

## 2026-10-04 — Local code merge criteria and password rotation ordering

**Date**: 2026-10-04

**Decision**
Per the owner's explicit instruction, supersede the merge restrictions in the earlier operational
release-gates, measured release-qualification and production-mode qualification entries. Hosted CI
visibility, hosting capacity, physical-device testing and off-host operations remain external follow-ups;
they do not prevent development or a merge with passing full local verification and no known actionable
CRITICAL/HIGH in-repo blocker. Preserve existing performance/security limits and historical evidence.

Keep the password provider/session architecture. Carry the verified identity/hash internally from
password authentication to session creation. Lock the account in the issuance transaction, recheck
that credential, then insert the session. Rotation already locks the same account before updating the
hash and revoking sessions. The HTTP password route requires this evidence; it is never returned in
its response. Slow password hashing stays outside the database transaction.

**Reason**
External qualification was repeatedly preventing development despite locally verified code. The owner
explicitly changed those priorities. Code review also found that a login verified before password
rotation could otherwise issue a new valid session after rotation had revoked existing sessions.

**Alternatives considered**
Continue blocking development on external measurements; weaken production safety limits; replace auth;
hold a database lock during scrypt; rely on revoking only sessions that existed before hashing finished.
None is necessary for this focused merge or correctly addresses the credential race with bounded work.

**Consequences**
Issuance and rotation have a defined order: issuance first is revoked by rotation; rotation first makes
old verification fail. Trusted development/test session creation remains available internally. New
credential-changing code must preserve account-first locking. No schema, gameplay or public auth flow
is added. Local verification is not hosted CI success, device acceptance or production capacity proof.

## 2026-10-04 — Greenvale playable presentation over the existing simulation

**Date**: 2026-10-04

**Decision**
Build the first playable slice by completing presentation and onboarding over the existing authoritative
movement/combat/loot/quest implementation. Use small procedural articulated rigs and shared flat
materials instead of introducing an external asset dependency. Derive walk/idle motion from movement;
play strikes from server damage events. Local weapon presentation follows real equipped inventory.
Visible roads and minimap routes share one client presentation table, tested against authoritative
colliders. The south-west trail goes around the existing house and ends before the den rock.

**Reason**
The repository already had working persistent game systems. The gaps were player readability,
placeholder figures/scenery and an unguided opening. Rebuilding the server would duplicate completed
work. A clear village → weapon → Maren → wolf hunt loop makes the existing systems accessible.

**Alternatives considered**
Replace the world/combat architecture; wait for generated production art; add a large skill tree;
make cosmetic loot or client-owned rewards. None addresses this slice's immediate needs.

**Consequences**
No server schema, protocol or economy changes. Existing characters retain their state. Cosmetic
animations never determine damage. Geometry is deliberately simple; remote weapon appearance is not
yet replicated. First-damager ownership remains explicit until a scoped party/shared-hunt milestone.
Physical phone performance and public hosting are separate follow-ups, not development gates.

## 2026-10-04 — Zone-owned parties and atomic shared hunt rewards

**Date**: 2026-10-04

**Decision**
Keep parties inside the exclusively owned zone simulation and its durable checkpoint. Five members,
leader invites/disbands, 20 m invitation/acceptance range, 30 s single-use invitations, two-minute
membership grace after disconnect. Restore the full party snapshot on reconnect; after host recovery
members start offline and invitations are cancelled. Party IDs fence stale leave/disband requests.

Capture the tagger's party cohort on first damage. At death, intersect it with the tagger's current
party and living, online members within 40 m. Divide each eligible character's level-adjusted solo XP
by recipient count (floor), advance everyone's active kill objectives, and allocate the single normal
loot roll including coins round-robin among eligible members. Zero eligible group members means no
reward. Solo/disbanded tags retain the original tagger rule. Freeze recipients/loot owner in the death
checkpoint and durable kill event; apply the whole group's rewards in the existing outbox transaction,
locking characters in ID order. Keep the per-kill/per-character and item source-reference dedupe keys.

**Reason**
Players need a reason to hunt together without multiplying loot or adding a second reward pipeline.
The existing checkpoint and outbox already provide ownership, recovery and exactly-once boundaries.

**Alternatives considered**
Full XP/loot per member; client-reported contribution; a new persistent social microservice; loot voting;
party membership queried later by the reward worker. These either inflate rewards, trust the client,
add unnecessary scope, or let a delayed reward change recipients after the fight.

**Consequences**
Parties are currently zone-local; cross-zone travel needs an explicit handoff later. Pelts remain
personal inventory items, so a group may hunt longer to satisfy everyone's collect objective. Round-robin
is fair turn-taking, not equal item value. A full reward recipient mailbox delays the group's atomic
payout. Offline/dead/distant members are ineligible for new group kills; already-frozen rewards persist.
No guilds, party chat, trading, raids, loot voting or new infrastructure are added.

## 2026-10-04 — Short Old Waystone follow-on and additive content recovery

**Date**: 2026-10-04

**Decision**
Add one level-two follow-on after the wolf hunt: Maren sends the character to Keeper Rill at the
Old Waystone, then pays an existing Copper Band plus 150 XP/75 copper on return. Implement only
idempotent NPC-talk progress in the existing objective grammar and transaction framework. The
realtime gateway validates the actual living speaker and NPC range; talks are personal, not party
credit. No generic event bus, branching engine or new quest persistence model.

Add Rill after deterministic prop generation so no existing obstacle changes. An explicit SQL
content-hash migration permits exactly this additive Greenvale upgrade while preserving the saved
checkpoint. Recovery adds missing static NPCs after restoring existing entity IDs. Party checkpoints
write simulation format 2 (and can read legacy format 1), so old binaries refuse new recovery state.

**Reason**
A short journey and warning about the Hollow give the existing hunt narrative purpose. Reusing the
quest/reward framework minimizes duplication; preserving the saved world avoids resetting players'
health, positions, cooldowns, enemy deaths or pending group rewards to add an NPC.

**Alternatives considered**
Another kill-only quest; a new quest engine; client-reported NPC visits; dropping checkpoints when
content changes; procedural-world regeneration around the new NPC. None is required for this story.

**Consequences**
Each party member talks/turns in individually. The quest is non-repeatable and has no new combat or
special quest inventory. This is a narrow additive migration, not automatic arbitrary content
compatibility. Unknown content hashes still fail closed. Stop hosts for migrations and roll forward;
pre-party binaries cannot safely process new group reward events.

## 2026-10-05 — Hollow packleader with a persistent melee warning

**Date**: 2026-10-05

**Decision**
Continue Rill's warning with one prerequisite-gated kill-and-return quest, a short marked trail,
and Brackenmaw. Add only an optional per-enemy melee wind-up. The enemy holds position, publishes
an entity attack cue through existing AOI/upserts, and rechecks range/line of sight at resolution.
The cue survives in the existing checkpoint/snapshot. Death or disengagement clears it. No new
ability engine, reward path or party rules. Use an existing cap as the single rotating kill drop
and a modest class-neutral bound trinket as each character's one-time quest reward.

**Reason**
A readable, avoidable bite gives the small encounter a player decision without expanding the
combat architecture. Persistent cues keep reconnect and ordinary replication consistent. The
existing kill outbox and quest transaction already enforce group credit and reward deduplication.

**Alternatives considered**
An instant high-damage wolf (no new decision); a scripted multi-phase boss/AoE engine (excess scope);
client-timed damage (untrusted); clearing world saves to add a spawn (unacceptable state loss).

**Consequences**
The cue is optional; existing enemies behave unchanged. This is a single-target encounter, not
an AoE/raid framework. Balance needs player feedback. Explicit content migration preserves the
checkpoint and terrain; recovery adds an ungrouped spawn only if neither its enemy state nor
pending respawn exists. Deploy client/server content together after stopping owners and migrating.
The new quest requires each member to accept and turn in individually; existing shared eligibility
and one-roll loot rules apply. Physical-device and hosting follow-ups remain external.

**Verified deployment follow-up (2026-10-05)**
The populated preview exposed a missing item-catalog synchronization step: the new token's foreign
key prevented turn-in, and the transaction rolled back without partial rewards. Expose the existing
`syncItemTemplates` function as `pnpm db:sync-content`, safe in production and separate from demo seeding.
Run after migrations before restarting hosts. Actual retry/reconnect/equipment proof passed for both
characters. This adds a deployment entry point, not a new content or economy architecture.

## 2026-10-05 — Persistent public development preview behind the shared front

**Date**: 2026-10-05

**Decision**
Serve Broken Odyssey at its apex domain using the existing shared buildr-caddy, explicit apex/www
sites and automatic TLS. Add only this site's block and reload gracefully. Built releases live
under /srv/brokenodyssey; unprivileged systemd API/RT and private static ingress bind to loopback.
A socket proxy on the existing Docker bridge connects shared Caddy to private ingress. Keep an
isolated persistent PostgreSQL cluster and password accounts; production runtime guards remain on.
The client is clearly labelled DEVELOPMENT PREVIEW. Routine deploys fetch verified main, build,
dump the preview DB, migrate/sync content and restart only these services, then check the public SHA.

**Reason**
Gameplay needs a stable public preview without transient Vite processes, public username impersonation,
or disruption to other apps. Existing auth, migration, checkpoint and Caddy systems already suffice.

**Alternatives considered**
Expose the local Vite/dev-login instance (transient and unsafe publicly); move shared Caddy to host
networking (affects unrelated services); reuse the temporary test PostgreSQL cluster (not persistent
hosting); introduce containers/orchestration for the whole game (unnecessary for this deployment).

**Consequences**
The preview is persistent but is not a production launch/capacity claim. Five connections remain the
configured limit. Password accounts are operator-provisioned, no public signup or admin demo account.
Preview data is separate from prior local playthroughs. Local deployment dumps/releases need periodic
pruning; off-host backup and alert operations remain follow-ups. Failed migrations leave only this
preview stopped for inspection. No automatic backward database/checkpoint rollback.

## 2026-10-05 — Mobile display is optional and gesture-driven

- **Decision:** Offer touch-first players Start / Enter Fullscreen after character selection, before connecting to the world. Request document fullscreen from that click, then best-effort landscape lock. Browser continuation and an unobtrusive re-entry button remain available. Use dynamic viewport height and a safe-area HUD, including compact landscape controls.
- **Reason:** Browser and Android bars otherwise consume playable space; web pages cannot guarantee immersive mode or force orientation.
- **Alternatives considered:** Automatic fullscreen (blocked without activation), repeatedly reopening a modal (disruptive), requiring installation (unnecessary barrier).
- **Consequences:** Installable standalone manifest and icons reduce browser chrome. The service worker is online-only: no account/game data or stale release caching, no offline-play promise. Browser/system navigation remains user-controlled; physical Samsung verification is still required. Desktop has no entry prompt or fullscreen control.

## 2026-10-05 — Root-Wound ranged encounter through existing combat rules

**Date:** 2026-10-05

**Decision:** Add a slow, ranged Hollow Lantern and one prerequisite-gated Rill kill-and-return
quest beyond Brackenmaw. Reuse the existing attack-range, wind-up and resolution-time line-of-sight
checks. Render a distinct floating ward-light, violet reach warning and cosmetic server-hit projectile.
Use an existing terrain boulder for cover. Add a class-neutral bound cloak as the personal quest
reward; retain shared party kill credit, divided XP and one rotating loot roll unchanged.

**Reason:** The next short progression beat needs a different positioning decision and a payoff to
the wounded-root story. The existing simulation already supports the required ranged timing and cover.

**Alternatives considered:** Another fast melee wolf; a new spell/projectile simulation or boss
phase engine; bespoke party rewards; regenerating terrain. These add scope or repeat the previous encounter.

**Consequences:** Single-target ranged strikes still use current armour/hit rules, not a new elemental
resistance system. Projectiles are cosmetic, not dodgeable after damage resolution. The additive
content-hash migration preserves all prior checkpoint fields; ungrouped recovery creates the Lantern
only when no saved enemy/pending respawn exists. No new protocol or persistence schema is required.

## 2026-10-05 — Stillwater uses one durable ground-strike cue, not a new ability engine

**Decision:** Continue Greenvale through Maren's existing dialogue/quest flow to Stillwater Steps.
Extend the existing optional enemy wind-up with a validated `groundStrikeRadius` and optional
`attackCue.groundPosition`. The authoritative simulation freezes the target's ground position at
wind-up start and uses current player positions/LOS/armour at resolution. Reuse existing damage,
health, death, party, kill outbox, inventory and quest transactions. Existing attacks are unchanged.

**Reason:** A contrasting “move out and spread out” encounter creates a new playable decision for
both melee and ranged characters without adding casts, resources, buffs or a general effect system.
The warning must survive snapshots and checkpoint recovery and must be identical for spectators.

**Alternatives considered:** Another wolf or recoloured ranged Lantern (little gameplay contrast);
a general AoE/spell framework (too much scope); client-authoritative hazard hits (unacceptable);
new zone/server or phased expedition (unnecessary for one small route).

**Consequences:** Ground strikes require a wind-up. All living players in the marked radius and
line of sight can be hit, including bystanders; moving outside dodges with no extra radius slack.
Removing the target, leashing or killing the enemy cancels its committed strike. The new NPC and
Warden are additive ungrouped spawns: an exact content-hash migration preserves the old checkpoint
and recovery creates only missing new spawns. Original terrain, four quests and rewards stay intact.
Talk and kill objectives remain independent under the existing quest engine; each player must talk
and turn in personally, while eligible party kills share credit and rotate only one loot award.
Physical-device performance and broad encounter balancing remain player-feedback follow-ups.

## 2026-10-05 — Content-driven quest guidance and personal exploration visits

**Date:** 2026-10-05

**Decision:** Derive north-up quest compass/minimap destinations from quest definitions, authored
NPC/enemy/pickup spawns, known replicated entities and zone landmarks. Add server-only personal
exploration credit within four metres of a referenced landmark, reusing persisted quest counters
and the existing reward transaction. Use it for Maren's well/culvert continuation.

**Reason:** Live playtesting found that handoffs and objectives disappear too easily. All quests
need the same guidance, including newly unlocked offers and turn-ins. Exploration is the next
unchecked quest capability and fits the recorded old-well investigation without another kill grind.

**Alternatives considered:** Per-quest hard-coded pointers; client completion packets; shared
party visit credit; a navigation/pathfinding or branching quest engine. Each adds avoidable
coupling, trust issues or scope for this milestone.

**Consequences:** Guidance is advisory and does not change authority. Coordinates are direct
compass bearings, not paths through obstacles. Collection guidance names possible sources, not
promised drops. Visits are personal, idempotent, alive/same-zone/range validated, bounded and
committed before publication. Existing reward and party rules stay intact. No repeatables, dailies,
escorts or abandonment are claimed. An exact additive hash migration preserves live checkpoints.

## 2026-10-05 — Additive keeper outpost and frozen directional warning

**Date:** 2026-10-05

**Decision:** Continue the Last Door story with one existing explore/kill/return quest and an
optional frozen sector on the existing durable enemy attack cue. Store its origin, heading and
width when the wind-up starts; resolve against authoritative current player positions and LOS.
Share pillar geometry between client dressing and authoritative colliders. Append an exact
predecessor-hash checkpoint migration without replacing its live payload.

**Reason:** A directional flank encounter contrasts with the Warden's ground circle while keeping
working party eligibility, kill outbox, health, respawn and quest reward transactions intact.

**Alternatives considered:** Reuse the circle unchanged; introduce a general boss/ability engine;
let the cue track the target during wind-up; recreate terrain/checkpoints for the new outpost.

**Consequences:** Existing attacks are unchanged; new optional fields preserve historical content.
Survey and turn-in remain personal; existing eligible party kill sharing and one-owner loot remain.
This is a single non-repeatable expedition, not a dungeon or a spell-effect framework.
Verification evidence is recorded in PROGRESS and the keeper-outpost gameplay document.

## 2026-10-05 — Inventory sorting is an authoritative-slot-preserving view

**Date:** 2026-10-05

**Decision:** Complete inventory sorting/filtering as presentation over server-provided items:
name search, rarity filter and slot/name/rarity/item-level order. Use unique instance IDs for
selection/actions and always display real container occupancy; Reset restores the slot grid.

**Reason:** Players can find and compare their earned rewards now without adding a bag mutation
endpoint, extra transactions, slot races or another item model.

**Alternatives considered:** Rewrite bag slots on the server for automatic packing; leave the
existing unused filter helper disconnected; add favourites/junk/vendor flows in the same batch.

**Consequences:** Sorting does not reorganise persisted slots or free capacity. Filters apply only
to the chosen backpack/materials/recovered tab. Existing vault grids and item action authority
remain unchanged. Mutation/favourites/junk systems are deliberately outside this milestone.

## 2026-10-05 — Versioned authored packs compile to the existing GameData registry

- **Date:** 2026-10-05
- **Decision:** Introduce strict schema-version-1 JSON packs for quests, NPCs/placements, single-enemy
  encounters and named quest/loot rewards. A pure adapter resolves explicit manifest references and
  runs existing whole-catalog validation before any runtime consumes the data. Stable IDs and
  definition order remain unchanged; Stillwater is the representative migration.
- **Reason:** Content needs reusable validated authoring without rebuilding working authoritative
  quest/combat/party/reward handlers. Explicit registration prevents silent overrides and preserves
  seeded behavior and durable checkpoint hashes. Add iterative prerequisite cycle detection and
  impossible loot-bound checks for both legacy and pack content.
- **Alternatives considered:** Keep expanding inline TS; replace gameplay with a script interpreter;
  auto-merge packs with overriding IDs; migrate every definition/world asset in one batch.
- **Consequences:** Production/client use the same typed compiled catalog. Unsupported versions,
  unknown fields, conflicting IDs and invalid links fail startup. No hot reload/editor/remote pack
  endpoint, multi-stage encounter engine or gameplay additions. Future sections must define typed
  links and have real authoritative consumers. Stillwater preserves the deployed canonical hash;
  real semantic content changes still need the existing checkpoint migration procedure.

## 2026-10-05 — Five-continent atlas extends the existing content engine

- **Date:** 2026-10-05
- **Decision:** Keep Greenvale's deployed enclave unchanged; author five substantial continents
  with 24 adjacent regional simulation zones in a strict version-2 world pack. Use zone-local
  coordinates plus fixed continent-atlas bounds, stable places and reusable biome/monster/NPC/
  material/resource/loot/dungeon catalogs. Require overlapping neighboring progression bands,
  reciprocal node travel and reachable zones. No quest generation or bulk quest migration.
- **Reason:** Future content must reference real places and inhabitants. Multi-kilometre landmasses
  need bounded loading instead of growing Greenvale's all-chunk rendering/whole-zone navigation.
  The owner explicitly corrected the initial three-landmass plan to five without shrinking scale.
- **Alternatives considered:** One globally active enormous map; three tightly packed landmasses;
  quest-specific monsters/locations; replace the content engine; immediately build distributed
  zone handoff, final terrain, professions or a general dungeon engine.
- **Consequences:** The pure adapter appends to existing authoritative registries. The client streams
  at most 25 nearby chunks and disposes old geometry/resources. Sparse representative populations
  reuse existing AOI/combat/rewards; empty new regions sleep and local navigation is bounded.
  Scale is 6 m/s and 64 m chunks; continent straight crossings span 17–34 minutes per axis.
  Cataloged shops/professions/gathering/dungeon entrances remain explicit placeholders. Additional
  continents are data additions under the same contracts. Detailed terrain and dense habitats
  remain regional follow-ups; no claim of finished high-level content or measured player capacity.

## 2026-10-05 — Durable same-host node travel preserves character authority

- **Date:** 2026-10-05
- **Decision:** Add an authenticated, replay/rate-limited `world.travel` command at enabled nodes
  within 5 m. Require alive/out-of-combat state, no active enemy threat, unlocks and a hosted
  destination. Transfer the existing controller between owned zone simulations and atomically
  commit both recovery images with character zone/position/health/cooldowns before publishing.
- **Reason:** A client-provided zone/position write or independently committed transfer would
  permit stale recovery images, health/cooldown resets or two authoritative owners after a crash.
- **Alternatives considered:** Client teleports; separate DB writes around the transfer; reset
  character health on travel; broker-based cross-host handoff in this greybox milestone.
- **Consequences:** Existing inventory/equipment/XP/quests and economy transactions are retained;
  a failed write fences the host and recovery uses the last durable image. Existing zone parties
  leave cleanly when travelling. Same-host multi-continent players work now; cross-host transfer
  and cross-zone persistent parties are explicit later systems. Boat/road travel is instantaneous
  node interaction, not a ship simulation. Existing checkpoint hash migration is additive and exact.
