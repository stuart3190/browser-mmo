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

# Foundation
- [ ] Monorepo configured
- [ ] Package manager configured
- [ ] TypeScript configured
- [ ] Shared config packages
- [ ] Environment setup documented
- [ ] CI foundation

# Browser Game
- [ ] 3D engine selected
- [ ] Game shell boots
- [ ] Basic world renders
- [ ] Camera controls
- [ ] Character renders
- [ ] Movement
- [ ] NPC spawning
- [ ] Item pickup
- [ ] HUD foundation

# Backend
- [ ] API service
- [ ] Auth foundation
- [ ] Character persistence
- [ ] Item persistence
- [ ] Inventory persistence
- [ ] Equipment persistence
- [ ] Vault persistence

# Database
- [ ] Migrations
- [ ] Accounts
- [ ] Characters
- [ ] Item templates
- [ ] Item instances
- [ ] Inventories
- [ ] Equipment
- [ ] Vaults
- [ ] Marketplace tables
- [ ] Item history

# Realtime Multiplayer
- [ ] WebSocket connection
- [ ] Authentication
- [ ] Presence
- [ ] Player movement replication
- [ ] Entity spawn
- [ ] Entity despawn
- [ ] World state updates
- [ ] Chat protocol

# Characters / Classes
- [ ] Character model
- [ ] Class architecture
- [ ] Specialisation architecture
- [ ] Stats
- [ ] XP
- [ ] Levels
- [ ] Abilities

# Combat
- [ ] Melee combat
- [ ] Ranged combat
- [ ] Magic combat
- [ ] Healing
- [ ] Enemy combat
- [ ] Damage validation

# Items
- [ ] Item templates
- [ ] Item instances
- [ ] Unique IDs
- [ ] Rarity
- [ ] Stats
- [ ] Modifiers
- [ ] Durability
- [ ] Binding
- [ ] Provenance/history

# Equipment
- [ ] Equipment slots
- [ ] Equip
- [ ] Unequip
- [ ] Validation
- [ ] Stat application

# Inventory
- [ ] Backpack
- [ ] Material pouch
- [ ] Stacking
- [ ] Sorting
- [ ] Filtering
- [ ] Locking
- [ ] Favourites
- [ ] Junk marking

# Storage
- [ ] Character vault
- [ ] Account vault
- [ ] Guild vault

# Economy
- [ ] Currency model
- [ ] Currency transactions
- [ ] Audit trail

# Trading
- [ ] Player trade
- [ ] Trade validation
- [ ] Atomic exchange
- [ ] Exploit protection

# Marketplace
- [ ] Listings
- [ ] Buy
- [ ] Sell
- [ ] Cancel
- [ ] Expiry
- [ ] Fees
- [ ] Transaction history
- [ ] Duplication protection

# World
- [ ] Region model
- [ ] Zone model
- [ ] Chunk model
- [ ] Streaming
- [ ] Towns
- [ ] Wilderness
- [ ] Caves
- [ ] Dynamic events

# Quests
- [ ] Quest model
- [ ] Quest states
- [ ] Rewards

# Dungeons
- [ ] Dungeon architecture
- [ ] Instance architecture
- [ ] Boss encounters

# Crafting / Gathering
- [ ] Materials
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

# Art Pipeline
- [ ] Naming conventions
- [ ] Concepts folder
- [ ] Models folder
- [ ] Textures folder
- [ ] Icons folder
- [ ] Generated assets rules
- [ ] GLB/GLTF pipeline
- [ ] AI-assisted generation pipeline
- [ ] Blender automation

# Security
- [ ] Threat model
- [ ] Item duplication protection
- [ ] Currency protection
- [ ] Trade protection
- [ ] Marketplace race-condition protection
- [ ] WebSocket validation
- [ ] Admin permissions

# Testing
- [ ] Unit tests
- [ ] Integration tests
- [ ] Item ownership tests
- [ ] Inventory transfer tests
- [ ] Vault transfer tests
- [ ] Marketplace tests
- [ ] Realtime protocol tests

# Deployment
- [ ] Development deployment
- [ ] Production strategy
- [ ] Health endpoints
- [ ] Logging
- [ ] Metrics-ready architecture
- [ ] Backups

## Current Work

Nothing is in progress.

The only work done so far is the creation of the project memory files (`AGENTS.md`, `docs/MASTER_PLAN.md`, `docs/PROGRESS.md`, `docs/DECISIONS.md`) on 2026-10-03 by Claude (Opus 5.5). No game code, tooling, or configuration exists yet.

## Known Issues

None recorded. There is no implementation yet to have issues.

## Next Recommended Task

Set up the Foundation section: a pnpm workspace monorepo with TypeScript, shared config (ESLint, Prettier, tsconfig), Vitest, a documented environment setup, and a basic CI workflow that runs typecheck, lint, and tests.

Record each tooling choice in `docs/DECISIONS.md` as it is adopted. Do not start gameplay systems until this foundation is verified.
