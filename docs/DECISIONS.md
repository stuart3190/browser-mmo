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

---

## Open questions

These are not yet decided. Record a dated entry above when one is.

- Browser 3D engine: Babylon.js or Three.js.
- ORM: Prisma or Drizzle.
- Realtime server design on top of WebSockets (library, tick model, zone/shard model).
- Authentication approach.
- How stackable items are represented relative to item instances.

The preferred technical direction (TypeScript, Node.js, pnpm workspace monorepo, PostgreSQL, Redis where useful, WebSockets, Zod or equivalent, Vitest or equivalent, ESLint, Prettier) is listed in `docs/MASTER_PLAN.md` as a preference. Record each choice here once it is actually adopted in the repository.
