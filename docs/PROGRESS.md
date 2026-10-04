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
"Update 2026-10-03 (Claude Opus 5.5), milestone "server-authoritative combat foundation": commits `14d19cf` (rules, data,
rewards, simulation), `4899c54` (realtime gateway), `5eb4651` (client HUD + docs). "Combat E2E" = headless Chromium against the
real stack, 19 checks: admin-granted sword equipped via API → walk to the Grey Wolf → tap-target it (target frame) → Attack →
wolf health falls monotonically, wolf hits back → wolf dies (Dead state) → loot toast → XP/level and kill_rewards match
PostgreSQL → UI items == DB items → looted Trapper's Cap equipped via the inventory UI raises armour → 390×844 touch: tap
wolf, tap Attack, health falls, frames don't overlap. Inventory E2E (24) and pickup E2E re-run green on the same build.

Update 2026-10-04 (Claude Opus 5.5), milestone "first server-authoritative quest loop": commits `7c6ab3b` (definitions, rules,
`character_quests`, domain), `e501a5b` (NPC interaction + quest protocol + gateway), `619d91a` (dialogue, tracker, quest log,
`scripts/e2e/quest.cjs`), `da2c57b` (docs, ADR 0018). "`pnpm verify`" = 94 unit + 80 integration tests (domain 48, api 5,
realtime 27) + format/lint/typecheck/build, all green. "Quest E2E" = `node scripts/e2e/quest.cjs <dir>`, 29 checks, all passing:
desktop — walk to Elder Maren (talk prompt), E opens dialogue, Accept, tracker 0/5, row `active` in PostgreSQL, logout/login keeps
it, real wolf hunting until the server reports 5/5 kills and 3/3 looted pelts (tracker updated live; kill count == rewarded
`kill_events`), "Return to Elder Maren", socket drop and full page reload keep progress, walk back, dialogue shows the completed
line, Complete quest → reward toast (+300 XP, 2s 50c, Wayfarer's Cloak, level-up), tracker cleared, no second turn-in action,
quest log Completed tab; DB: completed with rewarded_at, exactly 3 pelts consumed, +250 gold once, one cloak, UI == DB. Phone
390×844 — Talk/Accept/Complete by touch, tracker does not overlap the HUD, progress pushed live. Scaffolding: the desktop hunt
"travels" between village and dens (log out, wait out the 10 s linger, move the character in the DB, log in) because walking is
covered by the world E2E; the phone run credits its 5 kills through inserted `kill_events` rows (processed by the server's
recovery sweep) and an admin-granted 3 pelts. The world E2E (22/22) was re-run green on the same build. Screenshots inspected.

Update 2026-10-04 (Claude Opus 5.5), milestone "world population and movement quality": commits `6db82ba` (collision,
navigation, spawn groups, write-ahead death), `c350b18` (kill_events outbox, crash recovery, mailbox), `d33fab1` (touch
controls, client collision prediction, minimap, feedback, `scripts/e2e/world.cjs`), `b0ef3bd` (ADRs 0016/0017, docs).
"`pnpm verify`" now = 84 unit + 68 integration tests (api 5, domain 38, realtime 25) + format/lint/typecheck/build, all green.
"World E2E" = `node scripts/e2e/world.cjs <dir>` against the real stack, 22 checks, all passing: desktop 1400×900 — walk into
the village fence (blocked by client prediction), slide along it and past its end with zero server corrections, 8 wolves
replicated around the dens, minimap names the area, Tab-target + F kill with XP pushed and the `kill_events` row
`rewarded`, bags filled via admin API → next kill's loot lands in the mailbox with a "Recovered loot" toast → Recovered tab →
Take moves it into the bags once there is room; phone 390×844 (touch, CDP multi-touch) — joystick/buttons/minimap/frames/
action bar inside the viewport and non-overlapping, finger 1 holds the joystick while finger 2 drags the camera (player
moved 16 m and camera yaw changed), finger 3 taps a wolf while finger 1 is still down (targeted), Attack button, wolf
killed, no page errors. Screenshots were inspected. The earlier inventory E2E (17 checks in this run) and pickup E2E still
pass on the same build; the old combat E2E script is superseded (it assumed the single wolf at (2,14)).

Update 2026-10-03 (Claude Opus 5.5), milestone "playable inventory + equipment loop": commit `418b1fd`.
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
  - 2026-10-04: enabling re-attempted via `git push` and via the GitHub App — both refused for missing `workflow` scope. The exact CI command sequence passes locally with only the workflow's env (no `.env`). Template updated (runs on `main`, `claude/**`, PRs).
  - Workflow written (mirrors `pnpm verify` with a Postgres service) but kept as a template in `docs/ci/github-actions-ci.yml`: the pushing token lacked the GitHub `workflow` scope. Never run. See docs/ci/README.md to enable.

# Browser Game

- [x] 3D engine selected
  - Verified 2026-10-03 · Claude Opus 5.5 · Babylon.js (ADR 0002); renders with WebGL2 in Browser E2E · 0f0a413
- [x] Game shell boots
  - Verified 2026-10-03 · Claude Opus 5.5 · Browser E2E: login, character create, scene loads, no page errors · 0f0a413
- [x] Basic world renders
  - Verified 2026-10-03 · Claude Opus 5.5 · Browser E2E screenshots: 4 chunk grounds + placeholder props · 0f0a413
- [ ] Camera controls
  - Orbit camera (drag rotate, wheel/pinch zoom, follows player). Touch drag-rotate verified in World E2E (yaw changes while moving); mouse drag and zoom still not exercised by any automated check.
- [x] Character renders
  - Verified 2026-10-03 · Claude Opus 5.5 · Placeholder capsule visible in Browser E2E screenshots · 0f0a413
- [x] Movement
  - Verified 2026-10-03 · Claude Opus 5.5 · Browser E2E: WASD moves player ~10 m, server accepts (no correction); realtime test checks speed-hack correction · 0f0a413
- [x] Touch movement (virtual joystick)
  - Verified 2026-10-04 · Claude Opus 5.5 · joystick feeds the same analog input/prediction/server path as WASD; works simultaneously with camera drag and tap-targeting (per-pointer tracking); World E2E at 390×844 with CDP multi-touch; desktop shows no touch controls · d33fab1
- [x] Client movement prediction with collision
  - Verified 2026-10-04 · Claude Opus 5.5 · same `CollisionWorld.slide` as the server; World E2E: blocked by and slides along a fence with 0 corrections · d33fab1
- [x] Minimap / landmarks / combat feedback
  - Verified 2026-10-04 · Claude Opus 5.5 · minimap (landmarks, safe zone, replicated entities, area name), floating damage numbers, hit flash, death overlay names the respawn point; seen in World E2E screenshots (minimap area asserted) · d33fab1
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
- [x] Reconnect during combat
  - Verified 2026-10-03 · Claude Opus 5.5 · connection linger (10 s) re-attaches to the same in-world character with health/target/enemy state intact (realtime test) · 4899c54
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
- [x] XP
  - Verified 2026-10-03 · Claude Opus 5.5 · wolf kills award XP server-side (`xpForKill` unit tests; `awardKill` integration incl. 5 concurrent duplicate attempts → 1; realtime full-loop test; Combat E2E UI == DB) · 14d19cf
- [x] Levels
  - Verified 2026-10-03 · Claude Opus 5.5 · level-up persisted in the reward transaction and pushed (`character.progress`), max health raised live (domain + realtime tests) · 4899c54

- [ ] Abilities
  - Data definitions only; no combat.

# Combat

- [x] Melee combat
  - Verified 2026-10-03 · Claude Opus 5.5 · player melee auto-attack: server swing timer, range, hit/crit/damage from equipped weapon + effective stats, armour mitigation (unit, simulation, realtime tests; Combat E2E) · 14d19cf
- [x] Enemy combat
  - Verified 2026-10-03 · Claude Opus 5.5 · Grey Wolf AI: aggro, chase, attack, leash/evade, death, corpse, respawn (simulation tests; realtime full loop; Combat E2E) · 14d19cf
- [x] Damage validation
  - Verified 2026-10-03 · Claude Opus 5.5 · server-only outcomes; rejects no/invalid/dead target, out of range, attacking while dead, replayed seq; start spam cannot speed up swings (simulation + realtime tests) · 4899c54
- [x] Targeting
  - Verified 2026-10-03 · Claude Opus 5.5 · `target.set` validated server-side; tap/click/Tab targeting with target frame (Combat E2E desktop + touch) · 5eb4651
- [x] Player death and respawn
  - Verified 2026-10-03 · Claude Opus 5.5 · death blocks movement/attacks/pickups, server-gated respawn at the zone respawn point, no penalty; health persisted (simulation + realtime tests) · 4899c54
- [x] Kill rewards (XP, loot, gold)
  - Verified 2026-10-03 · Claude Opus 5.5 · exactly-once via `kill_rewards` PK + item `source_ref`; loot through `grantItemInTx` with provenance; loot reaches inventory via change feed (realtime test, Combat E2E) · 14d19cf
  - Re-verified 2026-10-04 · Claude Opus 5.5 · full bags now deliver to the mailbox instead of losing items (domain + realtime tests, World E2E) · c350b18
- [x] Durable, crash-safe kill rewards
  - Verified 2026-10-04 · Claude Opus 5.5 · write-ahead `kill_events` + `confirmKill`; `processKillEvent` under SKIP LOCKED; startup recovery + sweep; persisted respawn slots restored. Tests: domain (idempotent record, 6 concurrent processors → 1 reward, backoff on full mailbox, void on deleted character, respawn listing) and `durable-kills.test.ts` (crash before record, after record, after reward, two nodes recovering, lost write acks, full bags) · c350b18
- [x] Line of sight
  - Verified 2026-10-04 · Claude Opus 5.5 · attacks and idle aggro need LOS through `CollisionWorld`; trees/rocks/buildings block, fences don't (world-population tests: wall blocks swings) · 6db82ba
- [x] Enemy pathfinding / steering
  - Verified 2026-10-04 · Claude Opus 5.5 · straight-line when clear, else cached A* on a 1 m NavGrid; leash, stuck detection, give-up on unreachable, return home (navigation + world-population tests: around a fence, unreachable enclosure, leash) · 6db82ba
- [ ] Ranged combat
  - Bows/crossbows exist as items; only melee auto-attack is implemented.
- [ ] Magic combat
- [ ] Healing
- [ ] Abilities / resources (mana, rage)

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
- [x] Recovered loot (mailbox)
  - Verified 2026-10-04 · Claude Opus 5.5 · system-only `mailbox` container (200 slots, created lazily for old characters); overflow loot keeps provenance; players can Take but never place items in (domain tests; World E2E Recovered tab + Take) · c350b18
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
- [x] Collision / obstacle data
  - Verified 2026-10-04 · Claude Opus 5.5 · prop-shape table drives visuals + colliders; explicit chunk colliders; registry validation (no spawns/respawns inside geometry, no enemies in safe zones); server rejects moves into/through geometry (collision + world-population tests) · 6db82ba
- [x] Enemy population (spawn groups)
  - Verified 2026-10-04 · Claude Opus 5.5 · Greenvale: 3 wolf dens + roamers, maxAlive limits, randomised respawn windows, min player distance, tick-driven (no timers); restart restores pending slots (world-population tests; 8 wolves in World E2E) · 6db82ba
- [ ] Streaming
  - Per-chunk build/dispose exists; all chunks of the zone (now 4×4 × 64 m) load at once.
- [ ] Towns
- [ ] Wilderness
- [ ] Caves
- [ ] Dynamic events

# Quests

- [x] Quest model
  - Verified 2026-10-04 · Claude Opus 5.5 · data-driven definitions (giver/turn-in NPC, level, prerequisites, repeatable flag, kill/collect objectives with stable ids, rewards, per-state dialogue) cross-validated by the registry; `character_quests` per-character state; first quest "Wolves at the Edge" (unit + domain tests, Quest E2E) · 7c6ab3b
- [x] Quest states
  - Verified 2026-10-04 · Claude Opus 5.5 · unavailable / available / active / ready-to-turn-in / completed (derived from 2 stored statuses + rules); persisted across reconnect, reload and server restart (unit, realtime, Quest E2E) · e501a5b
- [x] Quest objectives (kill, collect)
  - Verified 2026-10-04 · Claude Opus 5.5 · kills counted inside the exactly-once kill-reward transaction (duplicate kill, concurrent processors, replays: once); collect derived from bags + Recovered loot, not vaults/locked (domain tests, Quest E2E with real loot) · 7c6ab3b
- [x] Rewards
  - Verified 2026-10-04 · Claude Opus 5.5 · turn-in = one transaction (consume pelts, XP, gold ledger, reward item with Recovered-loot overflow, complete); 5 concurrent turn-ins → 1; crash mid turn-in rolls back; full mailbox → atomic failure (domain + realtime tests, Quest E2E DB checks) · 7c6ab3b
- [x] NPC interaction + dialogue
  - Verified 2026-10-04 · Claude Opus 5.5 · server validates NPC entity/zone/range/alive; dialogue per quest state with the single allowed action; desktop E, tap and touch Talk button (world sim + realtime tests, Quest E2E desktop + phone) · 619d91a
- [x] Quest tracker and quest log UI
  - Verified 2026-10-04 · Claude Opus 5.5 · compact tracker (counts, "Return to Elder Maren"), log window with Active/Completed, details, rewards; phone layout checked (Quest E2E) · 619d91a
- [ ] Repeatable / daily quests, talk/explore objectives, abandoning, quest chains UI
  - Schema flag/shapes only; rejected by content validation for live quests.

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
  - Re-verified 2026-10-04 · Claude Opus 5.5 · 84 tests (`pnpm verify`) · b0ef3bd
- [x] Integration tests
  - Verified 2026-10-03 · Claude Opus 5.5 · 33 tests (domain 24, API 5, realtime 4) on PostgreSQL 16 · 0f0a413
  - Re-verified 2026-10-04 · Claude Opus 5.5 · 68 tests (domain 38, API 5, realtime 25) · b0ef3bd
- [x] Quest tests
  - Verified 2026-10-04 · Claude Opus 5.5 · 9 unit, 10 domain integration, 2 realtime integration, 29-check browser E2E · da2c57b
- [x] Crash-recovery tests
  - Verified 2026-10-04 · Claude Opus 5.5 · fault hooks + `simulateCrash()` restart tests at every kill-pipeline boundary (`services/realtime/test/durable-kills.test.ts`) · c350b18
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

Nothing in progress. Milestone "first server-authoritative quest loop" is complete on branch `claude/great-brahmagupta-h834j7` (commits `7c6ab3b`, `e501a5b`, `619d91a`, `da2c57b` + this PROGRESS update), awaiting owner review; not merged to `main` (main is at `be485ad`, the world population milestone).

## Known Issues

1. **CI not enabled and never executed on GitHub.** The workflow is a template at `docs/ci/github-actions-ci.yml`; on 2026-10-04 both `git push` and the GitHub App were refused for missing `workflow` scope. A maintainer must move it into place (see docs/ci/README.md); its command sequence passes locally.
2. **WebGPU unverified.** `?renderer=webgpu` path compiles but was never run on real GPU hardware; WebGL2 is the default.
3. **Single realtime process per zone.** Two realtime processes hosting the same zone would run divergent simulations. No zone registry yet. (The change feed itself works with several processes.)
4. **Change feed is not durable.** NOTIFY events emitted while the listener is disconnected are lost; correctness relies on the full resync after reconnect (tested). Needs a direct DB connection (not PgBouncer transaction mode).
5. **Reconnect = full snapshot.** No session resume/replay buffer; an expired session cannot reconnect (client shows "Disconnected"; reload to log in). The game client keeps the token in memory only.
6. **Bank opens anywhere.** No banker NPC/proximity rule yet (server would need the player's position from the realtime service).
7. **No drag-and-drop, sorting, search, split-stack or loadout UI.** Actions are via the details sheet. Icons are text placeholders.
8. **Main game JS chunk grew ~44 → ~181 KB gzip** with React + UI (measured, not analysed); Babylon chunk ≈1.9 MB minified still dominates; lazy shader chunks are merged into it by `manualChunks`.
9. **One-handed weapons always equip to the main hand.** Off-hand one-handers are possible via the API but not from the UI; dual-wield rules are undesigned.
10. **Expired listings with a full bag** stay in escrow until the seller has space (the mailbox exists now but the marketplace does not use it yet). The expiry sweep runs in every API process (safe, wasteful with replicas).
11. **Lock-order inversion between grant and move** (grant locks container then stack items; move locks item then containers) can deadlock under contention; PostgreSQL detects it and `inTransaction` retries, but it is not eliminated.
12. **`item_instances.listing_id` has no foreign key** (circular with listings); escrow consistency is enforced in domain code and checked on cancel/buy.
13. **Position persistence untested.** Positions are saved every 15 s and on disconnect, but no test asserts it.
14. **Stack-merge rows accumulate** (`destroyed/stack_merged`); archiving needed eventually.
15. **Dev auth only.** Anyone can log in as any username when `AUTH_DEV_LOGIN_ENABLED=true`. Usernames in `AUTH_DEV_ADMIN_USERNAMES` become admins on first login.
16. **Mouse camera drag and zoom** still not covered by an automated check (touch drag is).
17. drizzle-kit pulls deprecated `@esbuild-kit/*` sub-dependencies (warning only).
18. **A full mailbox delays the whole kill reward** (XP included) until there is room; the event retries with backoff (capped at 5 min). No UI tells the player their mailbox is full.
19. **Navigation limits.** 2D collision only (no terrain height/levels), static obstacles only, enemies do not collide with each other or with players; NavGrid is rebuilt per zone load (fine at 256 m, not for very large zones).
20. **`kill_events` grows forever.** Needs a retention/archive job for rewarded rows older than the longest respawn window.
21. **Deaths are announced one DB write later** (enemy is `dying` meanwhile); if the DB is down, enemies stay `dying` until it recovers. Kill credit goes to the first damager only (no parties).
22. **Combat balance is placeholder.** Formulas and numbers are first-pass and have had no design or balance review; armour comes only from gear today.
23. **Lingering characters stay attackable for 10 s after disconnect** (intended anti-combat-logging behaviour; may need tuning). This also means a DB-side teleport of a character is ignored while it lingers.
24. **World E2E depends on a globally installed Playwright** (`/opt/node22/...`, override with `PLAYWRIGHT_PATH`) and on dev-only debug hooks (`window.__mmo`, incl. `lookAt` used to aim the camera before the multi-touch tap). It is not part of `pnpm verify`.
25. **Minimap labels can clip** at the circle edge, and landmark names overlap when close together (cosmetic).
26. **Quest scope is deliberately small.** One quest; no repeatable/daily quests, abandoning, talk/explore objectives, quest items or party credit (only the tagging character's kills count). Selling/vaulting pelts lowers collect progress (intended, documented).
27. **A full Recovered loot box blocks quest turn-in** (atomic failure, nothing lost) and the error does not explain how to fix it.
28. **Dens respawn only with no player within 18 m**, so a player camping one den waits; the quest needs travelling between dens (intended anti-camping, may need tuning for the first quest's pacing).
29. **Quest E2E uses scaffolding** (DB "travel" between village and dens after the linger window; phone run credits kills via inserted kill events) and dev-only `window.__mmo` hooks; not part of `pnpm verify`.
30. **Dialogue panel does not close automatically when walking away** (the server re-validates range on every action).

## Next Recommended Task

**Milestone: second activity loop — gathering and a short quest chain** (reuses the quest foundation):

1. Owner enables CI (move `docs/ci/github-actions-ci.yml` into `.github/workflows/`) and fixes anything the first run finds.
2. Gathering from the existing ore spawn points (server-timed gather action, durable like pickups) feeding a collect objective.
3. A follow-up quest gated by `prerequisites` (e.g. "deliver ore to the smith"), adding `talk` objectives to the runtime.
4. Small quality items: close dialogue when out of range, clearer full-Recovered-loot message, `kill_events` retention job.

Keep crafting, professions, reputation, repeatable/daily quests and social systems for later milestones.
