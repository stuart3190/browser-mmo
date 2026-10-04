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

Update 2026-10-04 (Claude Opus 5.5), milestone "first playable class + ability system": commits `3c2ddca` (data, rules,
simulation, persistence, protocol, gateway), `9ea8315` (ability bar, touch buttons, effects, `scripts/e2e/abilities.cjs`),
`5cf938d` (docs, ADR 0019). "`pnpm verify`" = 111 unit + 85 integration tests (domain 49, api 5, realtime 31) +
format/lint/typecheck/build, all green. "Ability E2E" = `node scripts/e2e/abilities.cjs <dir>`, 36 checks, all passing: for a
Warrior (Heavy Strike in melee) and a Mage (Firebolt at ~10 m): class persisted in DB and drives the bar, level-2 ability shown
locked, target a real wolf, ability damage applied by the server, cooldown overlay, 5 spammed uses during cooldown execute
nothing ("not ready"), locked ability refused, socket drop rebuilds the bar, a kill levels to 2 → "New ability unlocked" toast,
DB level 2, the new ability is then used; phone 390×844: ability buttons ≥ 44 px and not overlapping joystick/target/minimap/
frames/action bar, Firebolt cast by touch while another finger holds the joystick (player moved), cooldown overlay. Scaffolding:
characters start next to a den with XP 3 short of level 2. World E2E (22/22) and Quest E2E (29/29; one earlier run timed out in
the scripted hunt, re-run green) pass on the same build. Screenshots inspected.

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
- [x] CI workflow installed and locally validated
  - Verified 2026-10-04 · Codex · actionlint 1.7.7; successful GitHub push of `.github/workflows/ci.yml`, including backup/restore step · `cf3bc1e182b5ef3debfe6774052f9bda6f4e3d9b`
- [ ] Hosted CI result for the latest hardening commit
  - Actions status could not be retrieved (connector returned Unknown tool). Do not claim a hosted pass; owner must check Actions before merging.

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

- [x] Abilities (Warrior, Mage)
  - Verified 2026-10-04 · Claude Opus 5.5 · data-driven abilities (class, unlock level, range, cooldown, damage scaling); Warrior Attack/Heavy Strike/Battle Strike (L2), Mage Attack/Firebolt/Flame Burst (L2); server validates class, level, alive, cooldown + 1 s GCD (server clock), target, range, LOS; level-up unlocks pushed live (unit, simulation, realtime tests; Ability E2E) · 3c2ddca
- [x] Playable class persistence
  - Verified 2026-10-04 · Claude Opus 5.5 · class set at creation (only `playable` classes), drives profile + bar, never client-supplied during play (domain + realtime tests, Ability E2E DB check) · 3c2ddca
- [x] Ability bar UI (desktop + touch)
  - Verified 2026-10-04 · Claude Opus 5.5 · keys 1–3/click, locked state, cooldown countdown; touch buttons usable while moving (pointerdown) (Ability E2E) · 9ea8315
- [ ] Ranger / Cleric, specialisations, talents
  - Placeholder data only; not creatable.

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
- [ ] Resources (mana, rage)
  - Deliberately not built: cooldowns pace combat (ADR 0019).

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
- [x] Talk objective and one prerequisite-linked Old Waystone follow-on
  - Verified 2026-10-04 · Codex · data/domain/gateway/recovery tests and seven browser checks;
    real NPC range, personal idempotent progress, touch dialogue/turn-in, persistent reward identity.
    Commit: the implementation commit containing `packages/game-data/src/waystone.test.ts`.
- [ ] Repeatable / daily quests, explore objectives, abandoning, general quest-chain UI
  - Repeatables/exploration remain rejected by content validation; the two-quest chain uses existing dialogue.

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
- [x] Zone-local parties and shared hunts
  - Verified 2026-10-04 · Codex · world/domain/gateway regressions and two-client browser hunt:
    invitations, roles, reconnect/recovery, shared XP/quest kills, one rotating loot allocation;
    touch accept/leave/disband and reachable panel controls. See Current Work and `gameplay/parties.md`.
    Commit: `2f3aaeab5169d628c750bcf00a1b101e46364a84`.
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
- [x] Production startup guards and deployment/recovery runbook
  - Verified 2026-10-04 · Codex · production auth/config tests; `docs/deployment/PRE_ALPHA.md` and TLS ingress template · `cf3bc1e182b5ef3debfe6774052f9bda6f4e3d9b`
- [x] Isolated production-mode TLS/ingress qualification
  - Verified 2026-10-04 · Codex · production password login, private metrics/health, restricted DB role, actual process takeover/session checks; sanitized evidence under `docs/hardening/evidence/production-qualification` · `7748e7e4722edbf683ed2a3a4f9f14c3623af994`
- [ ] Public production deployment, DNS/certificates and persistent monitored service operation
- [x] Health endpoints
  - Verified 2026-10-03 · Claude Opus 5.5 · /health/live + /health/ready on API and realtime (API test; curl against running services) · 0f0a413
- [x] Logging
  - Verified 2026-10-03 · Claude Opus 5.5 · pino JSON with requestId/connectionId/accountId/characterId (observed in realtime logs) · 0f0a413
- [x] Metrics-ready architecture
  - Verified 2026-10-03 · Claude Opus 5.5 · Prometheus-text /metrics on both services (unit + API test) · 0f0a413
- [x] Backup/restore tooling and disposable restore proof
  - Verified 2026-10-04 · Codex · consistent snapshot, 18 matching table counts, ledger/escrow/constraint checks, session revocation, occupied-target refusal · `cf3bc1e182b5ef3debfe6774052f9bda6f4e3d9b`
- [ ] Scheduled encrypted off-host backups, retention, monitoring and deployment restore drill

## Pre-alpha hardening — 2026-10-04

Implementation commit: `7eae981189ef5b95f4a8cbc16751878e6ec63191`. Branch: `codex/pre-alpha-hardening`.
Verified by Codex against Node 22.23.2, pnpm 10.28.0 and an isolated PostgreSQL 17.11 database.

- [x] Movement credit is elapsed-time based; message frequency cannot generate extra distance.
  - Verified 2026-10-04 · Codex · world tests: same-timestamp burst, sustained 20 Hz exploit, legal 10 Hz movement, bounded idle credit · `7eae981189ef5b95f4a8cbc16751878e6ec63191`
- [x] One controller per character within a realtime process, including overlapping asynchronous admissions.
  - Verified 2026-10-04 · Codex · simultaneous real WebSocket logins; existing replacement/reconnect tests · `7eae981189ef5b95f4a8cbc16751878e6ec63191`
- [x] Live connections enforce logout, bans and session expiry; failed/stale session checks fail closed.
  - Verified 2026-10-04 · Codex · idle socket revocation/ban/expiry and failed-query tests · `7eae981189ef5b95f4a8cbc16751878e6ec63191`
- [x] Position, health and cooldowns persist in one atomic statement; re-entry waits for departure persistence and retries retained failed saves.
  - Verified 2026-10-04 · Codex · real PostgreSQL row-lock test blocks departure/re-entry, checks restored state; injected failed-save retry; existing combat/ability reconnect tests · `7eae981189ef5b95f4a8cbc16751878e6ec63191`
- [x] Outbound WebSocket buffers and connection admission are bounded.
  - Verified 2026-10-04 · Codex · socket terminates before an outbound frame exceeds its configured budget; bounded keyed rate-limiter unit test · `7eae981189ef5b95f4a8cbc16751878e6ec63191`
- [x] HTTP and WebSocket expensive-work admission is limited before database work; database waits have timeouts.
  - Verified 2026-10-04 · Codex · API rate/concurrency tests assert rejected requests never resolve sessions; WS action burst test; all database integration suites · `7eae981189ef5b95f4a8cbc16751878e6ec63191`
- [x] Failed or missed change notifications trigger reconciliation of inventory, wallet, quests and simulation combat profile.
  - Verified 2026-10-04 · Codex · terminated LISTEN connection plus gear change; injected fan-out query failure without a subsequent item event; serialized snapshots/deltas and coalesced work · `7eae981189ef5b95f4a8cbc16751878e6ec63191`
- [x] Equipment operations lock the character before inspecting slots, including an empty equipment set.
  - Verified 2026-10-04 · Codex · concurrent two-handed/off-hand equips from distinct containers: exactly one succeeds · `7eae981189ef5b95f4a8cbc16751878e6ec63191`

Verification: full `pnpm verify` run completed format, lint, typecheck, 114 unit tests, API (6)
and domain (50) integration tests. Realtime initially passed 41/42: its duplicate quest-turn-in
assertion expected a domain rejection where the new work guard correctly returns `RATE_LIMITED`.
Updated that assertion and added a subsequent retry asserting `QUEST_ALREADY_COMPLETED`, retaining
all wallet/item single-reward assertions. The affected quest suite then passed 2/2; all 98 integration
tests are now verified. `pnpm build` passed for all four apps/services. Final added tests received
realtime typechecking and targeted lint/format checks. No browser E2E, load test, hardware/mobile
benchmark, production-auth replacement, CI activation or backup work was performed.

## Pre-alpha hardening continuation — 2026-10-04

Implementation commit: `cf3bc1e182b5ef3debfe6774052f9bda6f4e3d9b`. Agent: Codex. Continued the existing clean branch at
`80b99e9903e359ebe40d5db0f895c62128e36246`; remote main remained
`d564ab785069047c97062368f42019856738d0c6`. No gameplay/content or merge.
Each checked entry below was verified on 2026-10-04 by Codex at the implementation commit above.

- [x] Exclusive zone ownership, fail-closed publication and safe recovery.
  - Proof: duplicate-host rejection, actual PostgreSQL owner-session termination, stopped ticks/readiness 503, blocked checkpoint with no unpublished pong, startup migration lock and corrupt-checkpoint rejection; ownership suite 5/5 · `cf3bc1e182b5ef3debfe6774052f9bda6f4e3d9b`.
- [x] Durable published character/world state and pending-kill recovery.
  - Proof: crash/restart restores position/health/cooldowns; failed checkpoint recovers last committed position; all seven crash/reward scenarios pass, including a checkpointed kill before its separate kill record; normal departure/reconnect tests · `cf3bc1e182b5ef3debfe6774052f9bda6f4e3d9b`.
- [x] Repeated-hit authoritative health reaches local HUD state.
  - Proof: consecutive-hit world regression, real-protocol damage/vitals matching, existing death/respawn/regen/reconnect checks; client reconciles damage and vitals · `cf3bc1e182b5ef3debfe6774052f9bda6f4e3d9b`.
- [x] Provisioned production password authentication; dev auth gated out of production.
  - Proof: password HTTP login, wrong/unknown credentials, rotation/revocation, two-hash concurrency ceiling, insecure production startup rejection; browser/admin provider-aware builds · `cf3bc1e182b5ef3debfe6774052f9bda6f4e3d9b`.
- [x] Remaining queue/ingress/migration hardening.
  - Proof: slow-client direct-error bound, previous rate/reconciliation/equipment suites; opt-in loopback trusted forwarding; applied migration tamper/concurrent runner rejection and migration/zone startup exclusion · `cf3bc1e182b5ef3debfe6774052f9bda6f4e3d9b`.
- [x] CI workflow installed; backup/restore tooling actually exercised.
  - Proof: workflow push succeeded, actionlint passed; isolated source/restore databases with real account/session/character/escrow/ledger/history data passed integrity checks and were cleaned up · `cf3bc1e182b5ef3debfe6774052f9bda6f4e3d9b`.
- [x] Realtime/API/database capacity observations and sustained production-browser measurements recorded.
  - Proof: real PostgreSQL + WS + authenticated HTTP at 5/10/25/50 players; three 120-second browser profiles and screenshots, no debug hook/page errors; raw evidence in `docs/hardening/evidence` · `cf3bc1e182b5ef3debfe6774052f9bda6f4e3d9b`.
- [ ] Production-host capacity/headroom qualification and physical-phone performance acceptance.
  - The shared-host runs averaged 17.1–18.05 Hz, below the 20 Hz target. Five-player default is a pilot ceiling, not certified safe capacity. SwiftShader frame tails were poor; no phone FPS/battery/thermal claim.
- [ ] Latest hosted CI green, real TLS/ingress/account provisioning, off-host backups and deployment restore drill.

Verification: one full `pnpm verify` run passed formatting, lint, typechecking, all 116 unit tests,
54 domain + 7 API integrations and 46/47 realtime tests. One new test incorrectly treated socket
closure as proof that PostgreSQL had released ownership. Corrected it to assert confirmed lock
release before replacement; the full ownership suite then passed 5/5. All 108 integration tests are
verified across these runs. The aggregate verify command did **not** exit green; no second expensive
full run was performed. All four builds and assets check then passed. Final touched-test typecheck,
lint and formatting passed. Full evidence and limitations: `docs/hardening/2026-10-04.md`.

## Release qualification — 2026-10-04

Branch: `codex/pre-alpha-hardening`. Implementation/evidence commit: `1315c8a56af6b6567430fb42c285ddb00a6894ae`.
All checked entries below were verified 2026-10-04 by Codex; each proof refers to that commit.
Detailed results and raw evidence: [release qualification](hardening/release-qualification-2026-10-04.md).

- [x] Correct accumulated tick-timer drift without catch-up simulation or weaker validation.
  - Proof: three scheduler regressions; paired timer control; skipped-slot metric; full world/realtime suites.
- [x] Qualify exclusive ownership and crash durability with actual OS process termination.
  - Proof: seven SIGKILL/SIGSTOP tests, concurrent takeovers, stale-owner fencing, movement/health/cooldowns, three reward boundaries, equipment rollback and session revocation.
- [x] Verify browser health reconciliation and reconnect against the production client.
  - Proof: consecutive hits have matching vitals; dropped health leaves HUD stale, periodic reconciliation and reconnect restore authoritative zero; no production debug hook.
- [x] Reject development-mode release artifacts and correct CI's build environment.
  - Proof: actual NODE_ENV=test artifact rejected; production artifact check passed; actionlint passed and workflow/template match. Hosted execution is still unverified.
- [x] Expand and repeat the disposable restore integrity exercise.
  - Proof: equipped items/materials, quests, wallets/ledger, escrow and completed sale, kill/rewards, final migrations and revoked sessions; occupied target refused. Checkpoint fixture is empty; process tests cover populated checkpoint recovery separately.
- [x] Profile tick work, kernel scheduling, DB latency and final browser resources.
  - Proof: method timings, Linux perf sched control, quiet five-player load, three production-browser traces and separate development scene counts; raw evidence retained.
- [x] Complete final local verification after the release-build fix.
  - Proof: complete pnpm verify exited 0; format/lint/typecheck, 119 unit and 115 PostgreSQL integration tests, four builds and production-artifact gate. Assets/restore/browser checks passed separately.
- [ ] Hosted GitHub Actions green for the final branch SHA.
- [ ] Capacity gate with safety headroom on the intended production host.
- [ ] Physical Android/iOS acceptance and operated production ingress/recovery.

## Production-mode qualification verification — 2026-10-04

Implementation/evidence commit: `7748e7e4722edbf683ed2a3a4f9f14c3623af994`. Verified by Codex.

- [x] Password-only production TLS deployment, restricted runtime DB permissions, private health/metrics, and actual owner/session/crash checks.
  - Proof: `deployment-faults.json`, `database-role.json`, `http-security.json`, startup guards; exactly one of three takeover candidates owns the zone; cooldowns and damaged state survive.
- [x] Populated 0005→0006 migration and encrypted local deployed-database restore/startup.
  - Proof: unchanged fixture counts, economy integrity, revoked restored sessions, restored checkpoint and healthy replacement world; off-host storage remains unconfigured.
- [x] Final full local verification and production-browser health regression.
  - Proof: one `pnpm verify` exit 0, 119 unit + 116 PostgreSQL integration tests, four builds/artifact gate; HUD repeated-hit, missed-message and reconnect proof. Asset validation and local actionlint passed separately.
- [x] Representative production combat/economy measurements recorded honestly.
  - Proof: final restricted-role five-player run, 120 s, 19.37 Hz / p95 RTT 252 ms / 76 skipped slots; 195 equipment/vault transfers and five sales. This is a failed capacity gate, not a certified player cap.
- [ ] Hosted CI green for the final branch SHA (Actions read access unavailable).
- [ ] Capacity with safety headroom, physical Android acceptance, and operated off-host disaster recovery.

All proof files are under `docs/hardening/evidence/production-qualification`; full limitations and
external actions are in `docs/hardening/production-qualification-2026-10-04.md`. Main is unchanged.

## Merge gate follow-up — 2026-10-04

- [x] Recheck CI access paths and run an isolated 180-second production combat/economy capacity stage.
  - Verified: 2026-10-04; agent/model: Codex; tested commit: `100d6c50514787a6bd19ed1639a3223355c86d81`.
  - Proof: [merge gate report](hardening/merge-gates-2026-10-04.md) and sanitized raw evidence.
  - Five players: 19.4405 Hz, 100 skipped slots, RTT p95 152 ms, zero HTTP errors/disconnects.
    Tick-rate gate failed; higher concurrency was not attempted. CPU affinity control worsened timing.
- [ ] Hosted Actions success for the final branch SHA: CLI token invalid, API 401/404,
      alternative connector/browser paths unavailable; owner device authorization required.
- [ ] Stable capacity with headroom: not certified. No new code or architecture changes justified.

## Hardening merge verification — 2026-10-04

**Hardening locally verified and ready for fast-forward merge; external qualification is not a development/merge gate.** The owner's
latest instruction supersedes earlier DO NOT MERGE recommendations based solely on hosted CI
visibility, VPS capacity or physical-device availability. Merge requires local verification and no
known actionable CRITICAL/HIGH in-repo correctness/security issue. Historical qualification reports
retain their measurements; they do not override this updated policy or claim external release readiness.

- [x] Close password-rotation versus session-issuance race.
  - Verified 2026-10-04 · Codex · three password-domain tests and the targeted production HTTP
    rotation regression passed against disposable PostgreSQL. Full verification recorded below.
  - Session creation locks the account shared with password rotation and rechecks the authenticated
    identity/hash before insertion. An old in-flight password login cannot outlive rotation revocation.
    HTTP requires the verified credential and never returns it to the client.
  - Implementation/proof commit: the commit containing this entry (resolve with `git log -1 -- packages/domain/src/auth.ts`).
- [x] Final complete local verification.
  - Verified 2026-10-04 · Codex · final `NODE_ENV=production pnpm verify` exited zero:
    format, lint, all workspace/script types, 119 unit tests, 118 real-PostgreSQL integration tests
    (55 domain, 55 realtime, 8 API), all four builds and production debug-artifact rejection check.
  - Final reconnect replacement regression passes and teardown completes. No known actionable
    CRITICAL/HIGH in-repo blocker remains from this review; external outcomes remain unclaimed.
  - Proof commit: the commit containing this verification entry; same implementation as the run.
  - First full attempt passed format/lint/typechecks, 119 unit tests, 55 domain integrations and
    54/55 realtime tests. The session-replacement test used a 200 ms sleep after socket-open;
    it raced incomplete admission and then leaked a client on failure, timing out teardown.
    Replace the sleep with the final admission message (`character.progress`) and guaranteed cleanup.
    No runtime admission guard is relaxed. The final full run after this correction passed.

## Greenvale playable slice — 2026-10-04

**Greenvale playable slice completed.** Continues main `2bec69c004d772a776f13a80f163aeba2975957c`;
implementation/proof commit is the commit containing this entry (resolve with
`git log -1 -- apps/game-web/src/game/actor-model.ts`). Verified 2026-10-04 by Codex.

- [x] Procedural articulated adventurer/NPC and wolf models, movement/idle states, server-driven
      attack animation, corpse pose, contact shadows, and a visible locally equipped weapon.
  - Proof: browser combat/death/respawn; NullEngine child-picking, rotation-seam and rig disposal regression.
- [x] Coherent starter village and wilderness routes: pitched roofs/timber details, textured ground,
      signed north/east/south-west roads, village square and waystone route; routes also drawn on minimap.
  - Proof: screenshots and every road centreline checked against the existing authoritative collision world.
- [x] Opening equipment/quest guidance, dismissible guide, in-game Controls, health/target/XP HUD,
      XP feedback, inventory/gear/vault/quest access; verbose event journal collapsed by default.
  - Proof: fresh Warrior obtained a real world sword, equipped through the Bag, accepted Maren's quest;
    390×844 touch input/controls and screenshot inspection. No renderer/debug labels in the normal HUD.
- [x] Existing persistent gameplay exercised end-to-end without admin grants or teleports:
      normal movement to Northwood, shared enemy damage/death, real unique loot and XP, reload/login persistence.
  - Proof: two browser clients received identical four-hit health sequences and the same death;
    credited player earned 50 XP plus real items; the same item IDs and XP survived re-login.
    Separate touch run took actual wolf damage, died and respawned via UI at the village with full health.
  - Existing server authority, collision/bounds, enemy AI/respawn, cooldowns, first-tagger rewards,
    levels and quests are reused, not rebuilt. No party/shared-credit system is claimed.
- [x] Focused verification: 2 client rendering/route tests, 46 game-data tests, 40 world tests;
      client typecheck, repository lint, four application/service builds and production debug-artifact check.
  - Browser proof: 9 desktop/two-client checks + 5 touch/death checks, all pass; no browser exceptions.
    Read-only development observations locate entities; actual keyboard/UI/touch input drives gameplay.
    No new full infrastructure qualification, capacity benchmark or hosted-CI polling.
  - Full quest turn-in/levelling persistence retains its existing domain/realtime proof from the prior
    verified main; this browser run verifies the fresh opening hunt and persistence, not the full five-kill quest.

See [slice design and controls](gameplay/vertical-slice.md) and
[playthrough evidence](gameplay/evidence/greenvale-slice/playthrough.json).
Preview: `http://127.0.0.1:5178/` on this VPS only, isolated development DB `mmo_slice`, API 4450,
realtime 4451. Local dev auth remains development-only. This is not a public hosted release.

## Party and Waystone milestone — 2026-10-04

**Party/shared-hunt and short Old Waystone quest complete; local verification green.**
Verified 2026-10-04 by Codex. Party implementation commit: `2f3aaeab5169d628c750bcf00a1b101e46364a84`.
Waystone and final verification: the commit containing `packages/game-data/src/waystone.test.ts`. Continued verified main `e1b48acf8eaab44607c6143e64be6c61d2f72b9a`.

- [x] Invite/accept/decline/leave/disband, five-member cap, leader handoff, range/expiry/role checks,
      realtime roster/health, two-minute offline grace, reconnect and checkpoint recovery.
  - Proof: 44 world tests including party eligibility/recovery and a real simulated group kill;
    targeted gateway test passes sequence/invite replay, stale party ID, roles, reconnect and host restart.
- [x] Server-owned shared XP and quest kill credit; single loot-table evaluation allocated round-robin.
      Frozen recipients/owner survive retries. Existing atomic outbox and item provenance remain in use.
  - Proof: four PostgreSQL party reward tests: concurrent processing, exact XP/quest counts,
    one loot owner, malformed/empty eligibility, rollback after an injected mid-group failure and retry.
- [x] Browser Party panel and health roster with functional touch actions.
  - Proof: two real clients invited/accepted, killed two actual wolves for 25 XP each per kill,
    alternating item/coin ownership, exactly two quest kills each, and retained party/50 XP after re-login.
    Phone follow-up passed actual touch accept/leave, leader disband and reachable 44 px-high actions.
    No browser exceptions in the passing follow-up. Fixed sheet overflow and combat-control interception.
    The first playthrough was interrupted by development HMR; resumed its pre-hunt characters without
    grants/teleports. After the phone-only CSS fix the hunt was not needlessly repeated.
- [x] Changed packages typecheck, repository lint, focused world/domain/gateway checks pass.
- [x] A Whisper at the Waystone: Maren → south road → Keeper Rill → return to Maren.
  - Proof: two new game-data tests, a PostgreSQL quest test, gateway range/personal-progress test,
    legacy checkpoint recovery regression and seven real browser checks. Touch acceptance/turn-in;
    150 XP, 75 copper and one Copper Band; no repeat claim; progress/item identity survive login.
    Existing wolf-quest prerequisite was fixture-prepared through domain APIs; the entire new quest
    used real movement and UI. Static terrain/collision unchanged, exact prior-content hash verified.
  - Populated content migration changed only the checkpoint content hash; other saved fields identical.
    Details and screenshots: [Waystone](gameplay/waystone.md).
- [x] Complete local verification of the combined candidate.
  - Verified 2026-10-04 · Codex · repository format/lint, all workspace and script typechecks,
    128 unit tests; 125 PostgreSQL integration cases (60 domain, 57 realtime, 8 API);
    four production builds and production debug-artifact check. No known CRITICAL/HIGH regression found.
  - Full verification initially stopped on two new test-only typing mistakes, corrected using WebCrypto
    and the public GameData.load factory. Continued from typechecking, without repeating passing phases.
    One existing process-crash fixture then raced its injected weapon against login's equipment refresh;
    it timed out before reaching the crash hook (zero kill events). The fixture now waits for final
    character.progress admission before injection. Other 56 realtime tests passed; the failed case
    passed its targeted rerun with the readiness fix. Remaining domain suite and builds then passed.
  - Browser proof: shared hunt/alternating loot/shared quest kills; separate corrected touch panel
    accept/leave/disband; seven Waystone journey/persistence checks. Evidence: `gameplay/evidence/party-waystone`.
  - AGENTS.md and MASTER_PLAN.md unchanged. No infrastructure redesign, hosting qualification or
    claims of hosted CI/physical-device testing. Migrations were exercised on the populated isolated preview.

Rules and deployment compatibility: [parties](gameplay/parties.md). No guilds, PvP, raids, voice,
trading, party chat, hardware qualification or infrastructure redesign.

## Current Work

**Hollow trail and Brackenmaw continuation complete.** Verified 2026-10-05 by Codex.
Implementation commit: `a02bde1296a0f73b64710824048b1a91a9fcfd16`; content-deployment command
and final evidence are in the following verification commit. Continued verified main
`3873659eadc9c028f58c49da4ac9a530a9eb50ef` without changing AGENTS.md or MASTER_PLAN.md.

- [x] Rill offers Teeth Beneath the Roots after the Old Waystone quest; marked westward trail,
      scarred roots, named level-three packleader, return to Rill and useful bound trinket.
  - Proof: actual two-client travel/acceptance, same enemy targeted and killed, both quests ready;
    both characters completed touch turn-in for 350 XP/125 copper/one token and equipped it.
- [x] Stationary authoritative bite wind-up, ground warning and target HUD cue; range/LOS rechecked;
      existing chase/leash/death/respawn and party outbox used unchanged.
  - Proof: four focused world tests cover timing, dodge, recovery, cancellation and unique respawn;
    both browsers received the cue. Live kill ledger: 88 XP each, one cap and 67 copper to one member.
- [x] Additive content recovery and migration preserve saved state; reward catalog deploy step available.
  - Proof: prior content hash reconstructed exactly, path collision tests pass, populated migration applied;
    exact SQL against a temporary populated copy preserves all fields except contentHash.
    `NODE_ENV=production pnpm db:sync-content` synced 16 templates using the existing idempotent
    upsert, without demo accounts/grants. Initial missing-template turn-in rolled back safely;
    after sync both actual retries completed once and reward items survived reconnect.
- [x] Full local verification and functional browser proof.
  - `NODE_ENV=production TEST_DATABASE_URL=.../mmo_party_test pnpm verify` passed format, lint,
    workspace/scripts typechecks, **133 unit + 126 PostgreSQL integration tests**, four builds,
    and production debug-artifact guard. Integration includes process crashes, ownership and economy races.
  - The subsequent deployment CLI wrapper and browser continuation harness received targeted formatting,
    lint/typechecking/syntax checks and actual populated production-mode sync + touch/reconnect/equip proof;
    gameplay code was unchanged after the full suite. No second expensive qualification cycle.
  - Browser hunt resumed after an automation target-ack race and a transient login timeout. The actual
    new quest objectives/rewards were never injected. Old prerequisite quests were fixture-prepared.
    Five hunt checks plus nine return/equipment checks, screenshots and limits:
    [Hollow evidence](gameplay/evidence/hollow/results.json), [playable route](gameplay/hollow.md).

The gameplay implementation also remains available in the local development preview at `http://127.0.0.1:5178/`. Software-rendered functional evidence is
not physical Android performance or public hosting qualification. No unrelated gameplay/infrastructure
systems added; external follow-ups remain separate from development and merge gates.

## Persistent public development preview — 2026-10-05

- [x] **https://brokenodyssey.com** serves the built playable client through shared buildr-caddy;
      www redirects to apex; valid Let's Encrypt TLS for both names.
  - Verified 2026-10-05 · Codex · public HTTPS browser login, character creation, WebSocket snapshot
    (14 entities), health HUD, real keyboard movement and persisted position after re-login.
    No browser exceptions, no production debug hook. Development banner and SHA release manifest visible.
  - Proof: [public preview](deployment/evidence/public-preview.json), screenshot in the same directory.
    Deployment implementation: `27727fb5ce0b914c03206f1744230afc5260e769` plus ingress/verification commits.
- [x] Isolated persistent PostgreSQL 17 preview cluster; unprivileged systemd API/realtime/web;
      loopback services and a private socket bridge to the existing Docker front.
  - Production runtime/password auth, dev auth disabled; fresh player-only operator account, no demo admins.
    Existing local preview DB/services unchanged. All prior shared Caddy configuration bytes retained;
    graceful signal reload kept the original container; Buildr/Thrallo returned 200 before and after.
- [x] Repeatable verified-main deployment: `sudo bash scripts/deploy-broken-odyssey.sh`.
  - Builds before downtime, locks concurrent deploys, dumps isolated DB, applies migrations/content sync,
    switches release symlink, restarts only this preview and checks public release SHA/readiness.
    Actual candidate builds, populated redeploy/migrations, Caddy validation, shell syntax, formatting and
    public browser smoke passed. Initial backup connection and Host-header mistakes were corrected.
    No gameplay changes and no claim of capacity certification/physical-device testing.
  - Operation, ports, credential location and bootstrap: [deployment instructions](../ops/broken-odyssey/README.md).

## Known Issues

### External follow-ups (not development or merge gates)

1. **Hosted CI visibility remains an external follow-up.** The actual workflow is now installed; no manual copy or credential-scope fix is required. Open the repository's Actions page and confirm the latest run is green. The available CLI credential is reported invalid and the private Actions endpoint returns HTTP 404; SSH push does not establish CI success. CI now builds with NODE_ENV=production and rejects development/debug artifacts.
2. **Capacity is not certified.** No measured size maintained 20 Hz on this shared VM. Five is the default connection ceiling; larger zero-error runs do not prove capacity. The latest restricted-role production-mode combat/economy run was 19.44 Hz / p95 RTT 152 ms with 100 skipped slots in 180 s. Earlier corrected runs failed at one and five players too; higher stages were intentionally stopped. Kernel timer-only tracing measured 55.5 ms p99 run-queue delay. Repeat on stable intended hosting with combat/economy traffic and explicit headroom before invitations; no safe cap is certified.
3. **Physical phone/GPU acceptance remains unverified.** Software-rendered desktop/phone viewports had poor frame times. Real iOS Safari/Android Chrome, touch conflicts, WebGPU fallback, cellular startup, thermal and battery tests remain required.
4. **Public development preview is now deployed.** DNS/TLS, password login and persistent supervision work at brokenodyssey.com on an isolated DB. Scheduled encrypted off-host backups, alert delivery and production launch qualification remain follow-ups. Deployment dumps are local recovery copies, not an off-host backup service. Reconcile bans/credential changes newer than a restored backup before reopening ingress.

### Remaining debt and product limitations (not newly claimed high-risk fixes)

1. **WebGPU unverified.** `?renderer=webgpu` path compiles but was never run on real GPU hardware; WebGL2 is the default.
2. **Change feed is not durable.** Reconnection and failed queries now request full reconciliation, including simulation gear; a 30 s reconciliation sweep covers otherwise missed notifications. Delivery is eventually consistent, not instantaneous. Needs a direct DB connection (not PgBouncer transaction mode).
3. **Reconnect = full snapshot.** No session resume/replay buffer; an expired session cannot reconnect (client shows "Disconnected"; reload to log in). The game client keeps the token in memory only.
4. **Bank opens anywhere.** No banker NPC/proximity rule yet (server would need the player's position from the realtime service).
5. **No drag-and-drop, sorting, search, split-stack or loadout UI.** Actions are via the details sheet. Icons are text placeholders.
6. **Client bundle remains substantial.** Current measured main chunk 456.56 kB raw / 140.32 kB gzip; Babylon 1,952.23 kB raw / 461.57 kB gzip. See the sustained browser evidence; no hardware-phone performance pass is claimed.
7. **One-handed weapons always equip to the main hand.** Off-hand one-handers are possible via the API but not from the UI; dual-wield rules are undesigned.
8. **Expired listings with a full bag** stay in escrow until the seller has space (the mailbox exists now but the marketplace does not use it yet). The expiry sweep runs in every API process (safe, wasteful with replicas).
9. **Lock-order inversion between grant and move** (grant locks container then stack items; move locks item then containers) can deadlock under contention; PostgreSQL detects it and `inTransaction` retries, but it is not eliminated.
10. **`item_instances.listing_id` has no foreign key** (circular with listings); escrow consistency is enforced in domain code and checked on cancel/buy.
11. **Stack-merge rows accumulate** (`destroyed/stack_merged`); archiving needed eventually.
12. **Camera tests:** desktop drag is now asserted in the slice browser run; wheel input is exercised but zoom distance is not numerically asserted. Physical-device pinch usability remains external.
13. drizzle-kit pulls deprecated `@esbuild-kit/*` sub-dependencies (warning only).
14. **A full mailbox delays the whole kill reward** (XP included) until there is room; the event retries with backoff (capped at 5 min). No UI tells the player their mailbox is full.
15. **Navigation limits.** 2D collision only (no terrain height/levels), static obstacles only, enemies do not collide with each other or with players; NavGrid is rebuilt per zone load (fine at 256 m, not for very large zones).
16. **`kill_events` grows forever.** Needs a retention/archive job for rewarded rows older than the longest respawn window.
17. **Durable feedback includes database latency.** Death/reward feedback waits for checkpoint/kill writes; failed ownership/checkpoint writes fence the gateway and require recovery. First-hit tags now freeze eligible party credit under the documented shared-hunt rules.
18. **Combat balance is placeholder.** Formulas and numbers are first-pass and have had no design or balance review; armour comes only from gear today.
19. **Lingering characters stay attackable for 10 s after disconnect** (intended anti-combat-logging behaviour; may need tuning). This also means a DB-side teleport of a character is ignored while it lingers.
20. **World E2E depends on a globally installed Playwright** (`/opt/node22/...`, override with `PLAYWRIGHT_PATH`) and on dev-only debug hooks (`window.__mmo`, incl. `lookAt` used to aim the camera before the multi-touch tap). It is not part of `pnpm verify`.
21. **Minimap:** in-map landmark text is replaced by route lines/markers and the nearest landmark caption to avoid overlapping names.
22. **Quest scope is deliberately small.** Three quests, including an idempotent NPC-talk follow-on and the Hollow packleader hunt; party-eligible kills share kill credit. No repeatables, abandoning, exploration/escort objectives or branching engine. Collection items remain personal; selling/vaulting pelts lowers progress.
23. **A full Recovered loot box blocks quest turn-in** (atomic failure, nothing lost) and the error does not explain how to fix it.
24. **Dens respawn only with no player within 18 m**, so a player camping one den waits; the quest needs travelling between dens (intended anti-camping, may need tuning for the first quest's pacing).
25. **Quest E2E uses scaffolding** (DB "travel" between village and dens after the linger window; phone run credits kills via inserted kill events) and dev-only `window.__mmo` hooks; not part of `pnpm verify`.
26. **Dialogue panel does not close automatically when walking away** (the server re-validates range on every action).
27. **Abilities are first pass.** Instant, single-target, hostile only; no casts, AoE, heals, buffs/debuffs, resources or talents; numbers unbalanced (a Mage out-damages a Warrior at range). Validation rejects unsupported features in data.
28. **Ranger and Cleric characters created before this milestone** (dev data only) still load but their bars show placeholder abilities that the server refuses.
29. **Scripted hunting in the quest/ability E2Es is timing-sensitive** when dens were just cleared (respawn needs no player within 18 m); one quest E2E run timed out and passed on re-run.

## Next Recommended Task

**Pay off the wounded-roots story with one short Root-Wound investigation and a contrasting enemy.**
First playtest the complete three-quest starter route with fresh solo/party characters to tune travel
and combat pacing. Then extend the Hollow locally with a second readable enemy behaviour and a small
quest payoff, reusing current world/party/reward systems. No guilds, raids, PvP, crafting or giant quest
engine. Hosting/CI/physical-device follow-ups remain separate from gameplay development.
