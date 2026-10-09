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
- [x] Sorting (inventory view only; persisted bag slots are unchanged)
  - Verified 2026-10-05 · Codex · name/rarity/item-level/slot ordering over unique server items;
    pure no-mutation test and desktop/touch filtered-view equip, portrait/landscape UI proof.
    Implementation commit: **6094e151bf89c57f93511ee1a9360f08815973de**.
- [x] Filtering
  - Verified 2026-10-05 · Codex · name search + rarity on backpack/materials/recovered, empty-result
    explanation, Reset and true occupied/capacity counts. Existing `filterItems` reused; pure test
    and actual touch material-pouch/search/reset checks at 390×844 and 844×390. Same commit as above.
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
- [x] Bounded client chunk streaming for atlas regions
  - Verified 2026-10-05 · Codex · WorldView regression: at most 25 chunks, distant ground removed, zone changes release meshes/materials/textures. Greenvale keeps its original 16 chunks. Commit: `573a07b3f74454e7f2481a790d42ca9d4fbce3e5`.
- [x] Greybox towns and reusable settlement inhabitants
  - Verified 2026-10-05 · Codex · catalog tests: 24 named settlements/ports, 240 real NPC placements, stable role/service/stock references. Shops/lodging/training remain placeholders. Commit: `573a07b3f74454e7f2481a790d42ca9d4fbce3e5`.
- [x] Greybox regional wilderness habitats
  - Verified 2026-10-05 · Codex · 24 regions, 72 actual creature placements from 10 families/72 variants; existing authoritative combat/rewards. Detailed terrain/density remain unfinished. Commit: `573a07b3f74454e7f2481a790d42ca9d4fbce3e5`.
- [x] Shared-world Broken Vault entry and catalog encounter foundation
  - Verified 2026-10-05 · Codex · validated placed stonekin, atlas entry and personal exploration; latest Current Work.
- [x] Private Broken Vault instance framework (2026-10-09 qualification below)
- [ ] Remaining catalog dungeon entrances
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
- [x] Reusable active-objective, turn-in and newly unlocked handoff navigation
  - Verified 2026-10-05 · Codex · content-driven north-up HUD/minimap bearings and metres;
    kill/collect/talk/explore/NPC destinations, persistent local selection, desktop and touch UI.
    Unit rules, fresh opening-quest UI and real continuation playtests; full verification green.
    Commit: eb7c8a1a0968d5e077cd84f4729f27c3c513f52f.
- [x] Personal server-authoritative exploration objectives
  - Verified 2026-10-05 · Codex · living same-zone simulation position within 4 m of authored
    landmark; bounded/coalesced server-only writes, idempotent persisted counters, crash/reconnect
    recovery, no client completion packet. Domain/realtime/exploit tests and real well/culvert route.
    Commit: eb7c8a1a0968d5e077cd84f4729f27c3c513f52f.
- [x] Explicit daily contracts with transactional reacceptance and cycle-specific rewards
  - Verified 2026-10-05 · Codex · Greenvale contract domain/realtime tests; see latest Current Work.
- [ ] Quest abandonment and branching quest-map UI

# Dungeons

- [ ] Dungeon architecture
  - Placeholder schema only.
- [ ] Instance architecture
- [ ] Boss encounters

# Crafting / Gathering

- [x] Catalog materials and persistent material pouch
  - Ten world material templates; real Wild Herb harvesting and stack persistence verified.
- [x] First shared gathering interaction — Wild Herb
  - Verified 2026-10-05 · Codex · atomic grant/depletion, six competing claims, full-pouch rollback,
    stale recovery image, replay/reconnect, desktop + actual touch harvest and pouch persistence.
    Implementation commit: `d014293320384b94ca09ef9287128e290e624a8d`; see latest Current Work and `world/marches-gathering.md`.
- [x] Hardwood and iron-shard gathering using shared persistent resource nodes
  - Verified 2026-10-05 · Codex · catalog, competing claims and recovery tests; latest Current Work.
- [x] Three material-to-equipment workshop recipes (originally immediate; now timed jobs)
  - Verified 2026-10-05 · Codex · atomic NPC exchanges, rollback/receipt/provenance tests.
- [x] Tools and profession progression — verified Greenvale systems below (2026-10-09)
- [x] Durable single-job crafting, ranks and real consumable effects — verified Greenvale systems below
- [ ] Multiple queued craft jobs per character (current bound is one active paid job)

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

- [x] Persistent development deployment
  - Verified 2026-10-05 · Codex · public HTTPS gameplay, password login, supervised services and repeatable deploy; see Persistent public development preview below · a11e9ab7118c68d6af470a78105a661f9934904e.
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

## Hollow milestone verification

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
5. **No drag-and-drop, split-stack or loadout UI.** Sorting/name/rarity filtering is now implemented; mutations use the details sheet. Icons are text placeholders.
6. **Client bundle remains substantial.** Current measured main chunk 456.56 kB raw / 140.32 kB gzip; Babylon 1,952.23 kB raw / 461.57 kB gzip. See the sustained browser evidence; no hardware-phone performance pass is claimed.
7. **One-handed weapons always equip to the main hand.** Off-hand one-handers are possible via the API but not from the UI; dual-wield rules are undesigned.
8. **Expired listings with a full bag** stay in escrow until the seller has space (the mailbox exists now but the marketplace does not use it yet). The expiry sweep runs in every API process (safe, wasteful with replicas).
9. **Lock-order inversion between grant and move** (grant locks container then stack items; move locks item then containers) can deadlock under contention; PostgreSQL detects it and `inTransaction` retries, but it is not eliminated.
10. **`item_instances.listing_id` has no foreign key** (circular with listings); escrow consistency is enforced in domain code and checked on cancel/buy.
11. **Stack-merge rows accumulate** (`destroyed/stack_merged`); archiving needed eventually.
12. **Camera tests:** desktop drag is now asserted in the slice browser run; wheel input is exercised but zoom distance is not numerically asserted. Physical-device pinch usability remains external.
13. drizzle-kit pulls deprecated `@esbuild-kit/*` sub-dependencies (warning only).
14. **A full mailbox delays the whole kill reward** (XP included) until there is room; the event retries with backoff (capped at 5 min). No UI tells the player their mailbox is full.
15. **Navigation limits.** 2D/static collision only, no terrain height or actor collision. Atlas regions now use bounded local nav windows for short-leash enemies; long-leash encounters/dense populations need targeted extension, not a whole-continent grid.
16. **`kill_events` grows forever.** Needs a retention/archive job for rewarded rows older than the longest respawn window.
17. **Durable feedback includes database latency.** Death/reward feedback waits for checkpoint/kill writes; failed ownership/checkpoint writes fence the gateway and require recovery. First-hit tags now freeze eligible party credit under the documented shared-hunt rules.
18. **Combat balance is placeholder.** Formulas and numbers are first-pass and have had no design or balance review; armour comes only from gear today.
19. **Lingering characters stay attackable for 10 s after disconnect** (intended anti-combat-logging behaviour; may need tuning). This also means a DB-side teleport of a character is ignored while it lingers.
20. **World E2E depends on a globally installed Playwright** (`/opt/node22/...`, override with `PLAYWRIGHT_PATH`) and on dev-only debug hooks (`window.__mmo`, incl. `lookAt` used to aim the camera before the multi-touch tap). It is not part of `pnpm verify`.
21. **Minimap:** in-map landmark text is replaced by route lines/markers and the nearest landmark caption to avoid overlapping names.
22. **Quest scope remains bounded.** Seventeen playable definitions and one retained placeholder: original seven-story sequence, five Marches continuation quests, four side quests and one daily contract. Party-eligible kills share credit; talk, collection and exploration remain personal. No abandonment, escorts or branching engine. Compass directions are bearings, not obstacle-avoiding paths. Selling/vaulting pelts still lowers collection progress.
23. **A full Recovered loot box blocks quest turn-in** (atomic failure, nothing lost) and the error does not explain how to fix it.
24. **Dens respawn only with no player within 18 m**, so a player camping one den waits; the quest needs travelling between dens (intended anti-camping, may need tuning for the first quest's pacing).
25. **Quest E2E uses scaffolding** (DB "travel" between village and dens after the linger window; phone run credits kills via inserted kill events) and dev-only `window.__mmo` hooks; not part of `pnpm verify`.
26. **Dialogue panel does not close automatically when walking away** (the server re-validates range on every action).
27. **Abilities are first pass.** Instant, single-target, hostile only; no casts, AoE, heals, buffs/debuffs, resources or talents; numbers unbalanced (a Mage out-damages a Warrior at range). Validation rejects unsupported features in data.
28. **Ranger and Cleric characters created before this milestone** (dev data only) still load but their bars show placeholder abilities that the server refuses.
29. **Scripted hunting in the quest/ability E2Es is timing-sensitive** when dens were just cleared (respawn needs no player within 18 m); one quest E2E run timed out and passed on re-run.

## Next Recommended Task

**Finish the reusable private-party Broken Vault instance slice.**
Build admission, instance identity/ownership, lifecycle/reset, reconnect and completion reward rules
on the validated shared-world entrance/encounter foundation. Preserve the playable Greenvale route,
existing party/authority/persistence and world catalogs. Do not expand to another continent or mass
produce quests. Profession tools/ranks and timed crafting remain a separate later milestone.
See [Greenvale Complete](gameplay/greenvale-complete.md).

## Mobile display follow-up — 2026-10-05

- [x] Gesture-only touch entry fullscreen action, optional landscape lock, browser fallback and nonblocking fullscreen re-entry.
- [x] Standalone PWA manifest/icons and online-only worker; no authenticated/offline cache.
- [x] Dynamic viewport canvas, safe-area HUD and compact portrait/landscape controls; renderer follows canvas size.
- Verification: Codex, 2026-10-05. Client typecheck/unit tests/production build; repository lint/format; browser regression `scripts/e2e/mobile-display.cjs` at 390×844, 844×390, reduced-height 390×650 and desktop 1280×800. Checks visible control bounds/hit targets, fullscreen denial, native fullscreen/exit/re-entry and absence of desktop prompt. Commit: this mobile-display change (resolve with `git log -- apps/game-web/src/mobile-display.ts`).
- Known limitation: emulated Chromium is not a physical Samsung device. Android navigation bars, orientation permission and browser install UI remain controlled by the browser/OS. Test installation and bar transitions on a real phone; this does not block gameplay development.
- Next gameplay task remains the Root-Wound investigation above; no gameplay changed here.

## Completed Work — Root-Wound continuation, 2026-10-05

Continues verified main `02a721178587c92e8642c5097f7c55139d6f42af`. Agent: Codex.
Implementation/proof commit: the commit containing `packages/game-data/src/root-wound.test.ts`
(resolve with `git log -1 -- packages/game-data/src/root-wound.test.ts`). AGENTS/MASTER_PLAN unchanged.

- [x] Rill's prerequisite-gated **The Light Beneath**, marked continuation beyond Brackenmaw,
      distinct ranged Hollow Lantern, and persistent Rootward Mantle/450 XP/200 copper reward.
  - Verified 2026-10-05 · content/route tests, real PostgreSQL prerequisite/incomplete/duplicate-turn-in
    tests. Party rewards use the existing atomic outbox: 99 XP per level-two member, one kill loot stack.
- [x] Existing authoritative wind-up/range/LOS rules support the contrasting ranged encounter.
  - Verified 2026-10-05 · five focused simulation tests: delayed ranged damage, range evasion, cover
    evasion, target removal, warning recovery and unique death/respawn. Client picking/disposal regression.
- [x] Exact additive migration and populated content synchronization preserve existing progress.
  - Verified 2026-10-05 · old/current content hashes, populated development checkpoint compared before
    and after migration: all fields except contentHash identical; 17 catalog templates synchronized.
- [x] Mobile landscape party-invitation hit-target conflict corrected.
  - Verified 2026-10-05 · real two-client invitation accepted by ordinary touch before the shared hunt;
    pending invitation now clears the joystick. No forced input or server validation bypass.
- [x] Real desktop/touch shared quest, reward, level-up and equipment progression.
  - Verified 2026-10-05 · 15 recorded browser assertions: normal party invitation/acceptance, actual
    travel, both clients see the same Lantern/cue/death, one shared kill, one loot owner, quest
    reconnect, 450 XP/200 copper/one mantle each, both reach level 3, same unique item after reload,
    and desktop/portrait touch equip. No browser exceptions. Persisted DB rows agree with both clients.
  - Screenshot review also caught the fullscreen shortcut covering Goodbye; it now hides while
    panels/invitations are open. Separate portrait reload/Goodbye checks passed for both characters.
  - Evidence: `gameplay/evidence/root-wound`; the complete hunt harness saved all passing assertions
    but its launcher returned SIGTERM afterward. Independent completed-quest/equipped-item browser
    checks exited zero. No new quest progress/rewards were injected for this playthrough.
- [x] All final verification phases completed: format/lint, workspace/script types, **140 unit
      and 127 PostgreSQL integration cases**, four production builds and no production debug hook.
  - Verified 2026-10-05 · one full verification attempt followed by targeted corrections/continuation,
    not a claimed zero exit from the original aggregate command. The legacy pre-Rill fixture now
    omits the new dependent quest. Existing process-crash fixtures now equip persisted test power
    and await the durable enemy respawn instead of racing transient power/undefined targets;
    all three crash-boundary cases passed their final rerun. No production authority was weakened.
  - API 8/8, domain 62/62, realtime 55 initially passing plus the corrected crash cases (57 total).
    Final touched-test types/lint and CSS production rebuild passed. No hardware/CI detour.

Playable route, rewards and proof limitations: [Root-Wound](gameplay/root-wound.md).
Known limits: one non-repeatable quest, one ranged single-target enemy, simple procedural visuals,
no world phasing; existing party eligibility and loot rotation remain unchanged. Physical-device
performance and encounter balance need player feedback, not another hosting qualification cycle.

## Completed Work — Maren / Stillwater continuation, 2026-10-05

Continues verified main `3d69bcca31ef9a2a6c860d7afcdf53c229f778b4`. Agent: Codex.
Implementation/proof commit: the commit containing `packages/game-data/src/stillwater.test.ts`
(resolve with `git log -1 -- packages/game-data/src/stillwater.test.ts`). AGENTS/MASTER_PLAN unchanged.

- [x] Playtested the entire existing four-quest Greenvale route with a fresh Warrior.
  - Verified 2026-10-05 · actual browser movement, sword pickup/equip, six wolves, Brackenmaw,
    Lantern and all four normal quest turn-ins; no travel/progress/XP/power injection. No deaths or
    browser errors. Durable kill rows match the hunt; final character is level 3, 311/2320 XP.
    Acceptance-to-final-return: 567 seconds in emulated Chromium, not a phone performance result.
  - No numerical combat/reward/objective tuning justified from this one pass. Corrected the stale
    opening guide to point to each next quest giver, including Maren after Root-Wound.
- [x] Maren’s **What the Ward Held** debrief and small Stillwater expedition implemented.
  - Verified 2026-10-05 · content/route/persistence tests. Requires Root-Wound completion and level 3;
    personal Tess talk plus party-eligible Warden kill, returning to Maren for 600 XP/250 copper/
    one class-neutral, on-pickup-bound Stillwater Seal ring. Existing atomic reward pipeline reused.
- [x] Contrasting authoritative Warden ground-strike mechanic, warning and procedural rig.
  - Verified 2026-10-05 · five focused simulation tests: frozen mark, dodging/nearby-player damage,
    checkpoint recovery, cancellation/fresh re-aggro, additive spawns, solo death/pending respawn.
    Client test checks mark stays fixed as enemy moves, articulated picking and cleanup.
- [x] Exact additive migration preserves populated checkpoints and prior progression.
  - Verified 2026-10-05 · preview DB migrated after owner shutdown; all checkpoint fields except
    contentHash compared equal, 18 item templates synchronized. Historical content hashes still
    exact after removing only new additions. No existing props/colliders/quest rewards changed.
- [x] Desktop/touch party expedition, reconnect, personal rewards and equipment browser checks.
  - Verified 2026-10-05 · seven hunt/reconnect assertions and nine final return/reward assertions:
    same Warden/warning, personal Tess talks, shared kill credit, one loot stack, quest reconnect,
    600 XP/250 copper/one unique ring per member, completed quest/item reload and real equip.
    Mage turns in via actual touch in portrait. No browser exceptions.
  - Initial complete harness exposed a ridge-edge travel trap; fixed the new path to x=42 and tested
    both edges against the authoritative collider. The continuation used the same persisted ready
    characters without teleports/progress/reward injection and exited zero. Objective count wrapping
    and decorative-seal/warning colour ambiguity also corrected after screenshot review.
- [x] Solo Warrior expedition and portrait touch reward/equipment progression.
  - Verified 2026-10-05 · four browser assertions, exited zero: actual touch accept/target/attack/
    abilities/talk/turn-in/equip with existing ordinary sword/token/mantle stats. Warden killed solo,
    242 kill XP, 600 quest XP and one persistent ring. No injected new progress/rewards or deaths.
- [x] One complete final verification pass exited zero.
  - Verified 2026-10-05 · `NODE_ENV=production TEST_DATABASE_URL=…/mmo_party_test pnpm verify`:
    format, lint, all workspace/script types, **148 unit tests**, **128 PostgreSQL integration tests**
    (API 8, domain 63, realtime 57), four production builds and no production development debug hook.
    Includes movement/replay, sessions, ownership, crash/reward recovery and equipment regressions.
  - Browser evidence totals 20 assertions across the staged party hunt/return and complete solo
    touch run, plus the fresh complete four-quest playthrough. DB records agree with all three
    completed quests/equipped unique rings; two party rewards at 121 XP each, solo reward at 242 XP,
    one loot stack per kill. Screenshots and machine-readable proof: `gameplay/evidence/stillwater`.

Deployment uses `bash scripts/deploy-broken-odyssey.sh` after verified main is pushed; the public
`https://brokenodyssey.com/release.json` supplies the deployed commit independently of this file.

Playable route/rules and evidence limitations: [Stillwater](gameplay/stillwater.md).
Known limits: one non-repeatable expedition; independent talk/kill objectives, one ground-strike
mechanic rather than a general spell engine; decorative shallow water without swimming. Existing
party eligibility/loot rotation unchanged. Physical Android performance remains unmeasured.
Loot toasts currently show a merged stack’s total quantity rather than only that kill’s increment
(e.g. existing three ore plus four dropped displays seven); persistent quantity/reward integrity is
correct, but this existing presentation issue should be corrected during the next feedback pass.

## Current Work — completed quest guidance and well survey, 2026-10-05

- [x] General quest compass with active objective, distance/cardinal direction, minimap destination,
      turn-in and automatic available follow-on giver. Desktop/touch log selection, optional per-character
      stored preference, no fabricated coordinates or hidden moving-enemy positions.
- [x] Next unchecked quest capability: personal exploration, from the owned server simulation only.
      Four-metre 3D range and positive health; at most one task per connection/four globally, once per
      second when actually eligible/in range. Transactional counters and reconnect/reconciliation reused.
- [x] **The Water Remembers** after Stillwater: Maren's old well book/Last Door debrief, Old Well
      (8, 12), Spring Culvert (8, 110), signs/water/seal rings and clear road spurs. Level 3; both sites
      personally surveyed, either order; return to Maren. Reward: 450 XP, 150 copper, on-pickup-bound
      Springward Pendant necklace (+4 stamina/+3 armour before the existing modifier roll).
- [x] Playtest corrections: move the culvert beyond all three den spawn leash ranges so waiting
      companions are safe; restore pointer events on the compass; keep touch selection at least 44 px;
      separate portrait tracker/roster. No existing enemy stats, quest requirements or rewards changed.
- [x] Additive checkpoint migration, preserving simulation/player/party/pending reward payloads.
      `0012` and `0013` update only exact predecessor content hashes; applied migrations stay immutable.
- [x] Verification: 2026-10-05 · Codex · full `NODE_ENV=production TEST_DATABASE_URL=... pnpm verify`
      exit 0: format/lint/types, **151 unit + 130 PostgreSQL integration tests**, all production builds
      and production debug-hook guard. Targeted tests cover wrong zone/range/death, concurrent visits,
      personal credit, rollback/replay, persisted progress, crash/restart and forged exploration packets.
- [x] **25 recorded browser assertions** across two-client continuation, corrected solo route and fresh
      opening-quest guidance runs. Real travel plus actual touch joystick, selection, turn-in and equip;
      portrait 390×844 and landscape 844×390 bounds/hit targets. Three read-only database proofs: both
      surveys completed, exactly one pendant and 150-copper ledger reward per character; two UI equips.

Implementation commit: **eb7c8a1a0968d5e077cd84f4729f27c3c513f52f**.
Rules, route, proof files and honest resumed-run details: [quest guidance and well survey](gameplay/quest-guidance-and-well.md).
The first candidate's real visits survived the authored culvert relocation; a third character freshly
surveyed the corrected site, waited alive/out of combat at full health, then returned and equipped.
The full check initially caught a test-only Node-crypto typing error; the final content test uses
Web Crypto, and the complete final pass is green. Browser fixtures are previously played characters,
not grants of the new quest/progress/rewards. SwiftShader/touch emulation is not physical Samsung
performance proof. No gameplay work remains unfinished in this batch; continue with the outpost.

## Current Work — keeper outpost and inventory checklist continuation, 2026-10-05

- [x] **The Names Behind the Door** after The Water Remembers, level 3: Maren offers the keeper
      watchpost investigation; personal oath survey (24, 110), party-eligible Aster kill (33, 118),
      return debrief. North-road/culvert spur, ruined court, shared collision pillars, seal/oath/sign.
      The general compass guides survey, kill and return without new quest-specific UI logic.
- [x] Aster, Last Door Sentinel: authoritative 300-HP level-four construct with a 2.2-second,
      frozen-heading amber sector sweep; flank/behind/range dodge, LOS, existing chase/evade/death/
      60-second respawn. Optional durable cue fields reuse checkpoint/snapshot/health/damage paths.
- [x] Persistent, class-neutral rare Oathkeeper’s Mantle cloak; 700 quest XP/300 copper. Existing
      atomic quest reward/overflow/replay and party credit/XP division/one-owner loot rules preserved.
      DB proof: one party kill at 121 XP each/one owner; one solo kill at 242 XP/one owner; all three
      completed survey/kill counters and exactly one bound unique mantle each, genuinely equipped.
- [x] Additive `0014` exact predecessor content-hash migration. Populated preview migrated after
      owner shutdown: every checkpoint field except contentHash compared equal; 20 templates synced.
      Historical hash tests preserve all earlier terrain/content; old-checkpoint simulation test
      preserves the existing character/health/cooldown/entities and adds exactly one sentinel.
- [x] Inventory checklist sorting/filtering implemented and verified (presentation only).
      Actual desktop/touch equip via filtered unique ID; material pouch filtering, Reset, empty-result
      explanation and 44-pixel controls in bounds at 390×844 and 844×390. Vault grids unchanged.
- [x] Browser play: 17 recorded two-client assertions; complete solo touch run exited zero (5);
      corrected post-playthrough mobile inventory run exited zero (10). Real routes/acceptance/surveys/
      combat/turn-in/reconnect/equip; no new-quest rewards, progress, positions or stats injected.
      The party harness stopped only when tapping Reset behind the existing item-details sheet after
      both rewards/equips passed; corrected sequence closes the sheet, independently verified.
- [x] Screenshot-driven correction: desktop target health/warning placed below the quest compass.
      Functional outpost art and touch controls retained. Desktop bounds regression records proof
      separately (3 assertions, exit zero; compass bottom 60 px, target top 76 px). Emulated
      Chromium/SwiftShader is not physical Android performance evidence.
- [x] Final verification: one complete `NODE_ENV=production TEST_DATABASE_URL=... pnpm verify`
      exited zero: format/lint/types, **159 unit tests**, **131 PostgreSQL integration tests**
      (API 8, domain 65, realtime 58), all four production builds and production debug-hook guard.
      Final review then corrected a one-line client snapshot-facing omission; affected client format/
      lint/typecheck/**8 tests**/production build/debug-hook guard passed again. Server/schema/content
      were unchanged after the complete pass. Browser evidence totals **35 recorded assertions**.
- [x] Existing actor facing now follows authoritative full entity updates, with a rendering
      regression assertion independent of the frozen sector heading. This keeps pose/cue consistent.

Verified 2026-10-05 · Codex · targeted content/sector/checkpoint/client/inventory tests, workspace
typecheck and PostgreSQL outpost concurrent reward test passed. Rules/scripts/proof:
[keeper outpost](gameplay/keeper-outpost.md), `gameplay/evidence/keeper-outpost/`.
Implementation/proof commit: **6094e151bf89c57f93511ee1a9360f08815973de**.
AGENTS.md and MASTER_PLAN.md remain unchanged.

Known limits: one non-repeatable expedition, independent survey/kill order, existing first-hit party
eligibility and rotating loot unchanged; no new quest/effects engine. Sorting does not repack slots.
The existing merged-loot toast shows total ore in the resulting stack, not the four-ore increment;
DB rewards/quantities are correct. Physical Android/device performance remains an external follow-up.

## Current Work — content-engine core, 2026-10-05

- [x] Strict, typed schema-version-1 content packs: quests, NPC definitions/placements,
      single-enemy encounters/placements and reusable named quest/loot rewards. Schema version and
      authored revision are explicit; unknown versions/fields and malformed IDs fail validation.
- [x] Pure runtime compiler feeds the existing GameData registry used by API/realtime/browser.
      Explicit manifest references preserve ordering and reject missing/duplicate/conflicting IDs;
      no override merge, new gameplay handlers, remote upload endpoint or hot reload.
- [x] Full-catalog link validation for NPC/enemy/item/currency/zone/landmark references, placements,
      reward quantities and prerequisite chains. Added indirect quest cycle/duplicate prerequisite/
      unavailable placeholder dependency checks, and impossible loot quantity/currency bounds.
- [x] Representative deployed Stillwater migration: What the Ward Held, Tess/dialogue/spawn,
      Warden/combat/spawn, seal-ring quest reward and creature loot are JSON-authored. Exact parsed
      catalog matches deployed baseline byte-for-byte; canonical SHA-256 remains
      `fce8c1bf74e3e8e9fd3019432542026bb82f6a65060914ce468e9d255876ace1`.
      No database migration/reset/checkpoint rewrite or gameplay changes needed.
- [x] `pnpm content:validate` checks the shipped catalog and prints versions/revisions/counts/hash.
      Architecture and explicit future extension seams documented in [content-engine.md](content-engine.md).
- [x] **25 focused factory regression/failure tests**; final complete verification exited zero:
      format/lint/types, **184 unit tests**, **131 PostgreSQL integration tests** (domain 65,
      realtime 58, API 8), all four production builds and production debug-hook guard.
      Existing Stillwater DB test verifies prerequisite/personal dialogue/party kill credit and
      exactly-once persistent rewards through the new loader; existing crash/ownership suites pass.
- [x] Browser preview regression: real login/acceptance/movement/target/HUD/inventory (3 recorded
      desktop assertions); persisted reward/equipment and touch controls at 390×844 and 844×390
      (10 assertions). Evidence: `docs/gameplay/evidence/content-engine/`. Chromium touch emulation
      is functional browser proof, not physical-device FPS evidence.

Verified 2026-10-05 · Codex · implementation commit **69b0f4bfca52d6b2e10d63af59e19c3de9368836**.
Verification command: `NODE_ENV=production TEST_DATABASE_URL=.../mmo_party_test pnpm verify`;
disposable integration DB only. AGENTS.md and MASTER_PLAN.md unchanged.

Known limits: other Greenvale content remains legacy TS; items/classes/world geometry/procedural
art/formulas remain existing code. This core supports current objectives, rewards and single-enemy
mechanics, not multi-stage encounter scripts, repeatables, branching quests, content editors or
runtime reload. Stable persisted IDs must not be renamed; real semantic content changes still need
existing content-hash/checkpoint migration discipline. No new gameplay/content was added.
Deployment uses the existing script after merge; final deployed SHA/public proof is reported in the
completion message and `https://brokenodyssey.com/release.json`.

## Current Work — five-continent greybox world foundation, 2026-10-05

- [x] Owner-corrected five substantial landmasses / 24 named regions, stable IDs, atlas/local bounds,
      adjacency, overlapping neighbor bands, transition intent and preserved Greenvale enclave.
      64 m chunks / 6 m/s; straight continent-axis crossings 17.1–34.1 minutes (estimates, not timings).
- [x] Version-2 world pack extends the existing content compiler: 24 biome intents, 24 settlements,
      24 ports, 24 entrance POIs, camps/beacons/resource hollows/habitats; 10 monster families / 72
      variants and actual creature spawns; 10 NPC archetypes / 240 actual inhabitants; 10 material
      templates / 10 resource definitions / 10 loot profiles; four dungeon archetypes. No new quests.
- [x] Link/duplicate/global-ID/bounds/coverage/overlap/physical adjacency/progression/stock/loot/
      travel/reachability checks. Ordinary authored packs can use world NPC/enemy/material references
      and valid sparse chunk placements; five dedicated extension/failure tests prove these seams.
      Future quest-giver role promotion is authored data, preserving the inhabitant ID/placement.
- [x] 114 directed travel links: reciprocal boundary roads, coastal boat circuits and six
      intercontinental boat connections. World / M atlas, Guide compass/distance, real node departures.
      Existing quest handoffs route back through travel nodes; world destinations survive transfers.
      Desktop shortcut handler respects native atlas-select input. Touch targets remain at least 44 px.
- [x] Server validates authenticated/replay-limited range/alive/threat/combat/unlock/hosted destination;
      removes old controller and atomically commits source/destination recovery plus character zone,
      position, health and cooldowns before publication. Zone parties leave cleanly. Five PostgreSQL
      travel tests cover unhosted/range/death/replays, party/inventory, distinct continents, committed
      crash recovery and rejected durable transfer. Existing ownership/economy/reward suites pass.
- [x] Nearby client streaming capped at 25 chunks, clipped roads, geometry/label/material/texture
      disposal on movement/zone changes; old Greenvale presentation retained. Local nav capped at
      eight 192 m grids per region; actual pursuit regression. Empty new regions skip simulation;
      unchanged inactive recovery images avoid DB rewrites. Default/sample/deploy assignment hosts
      all catalog zones; explicit host subsets remain supported.
- [x] Additive `0015` exact predecessor checkpoint migration. Populated preview migrated after owner
      shutdown: every checkpoint field except contentHash compared equal; 30 item templates synced.
      Original definitions/chunks remain deep-equal and golden starter hashes remain unchanged.
- [x] Final full `NODE_ENV=production TEST_DATABASE_URL=.../mmo_party_test pnpm verify` exited zero:
      format/lint/types, **216 unit + 136 PostgreSQL integration tests** (realtime 63/domain 65/API 8),
      all four production builds, production debug-hook guard. First aggregate stopped early on a
      test-fixture typing error; schema-parsed fixture fixed before the complete passing aggregate.
- [x] Actual browser route: Greenvale gate, populated Marches, real Hart combat/Field Hide/23 XP,
      all five continents by boat, return/relog with the same unique loot/gear/XP. Two clients remain
      correctly isolated across zones then reconcile in the Marches. Real touch joystick; 390×844
      and 844×390 atlas/travel/control bounds. **31 tour + 4 final navigation assertions**, both final
      scripts exit zero; **six read-only PostgreSQL reward/ownership assertions**. No grants/teleports.

Verified 2026-10-05 · Codex · implementation commit: **573a07b3f74454e7f2481a790d42ca9d4fbce3e5**.
Layout/names/bands/catalogs/travel/loading/extension rules: [world foundation](world/world-foundation.md).
Evidence: `docs/world/evidence/`; repeatable playthrough: `scripts/e2e/world-foundation.cjs`,
`scripts/e2e/world-guidance.cjs`. AGENTS.md / MASTER_PLAN.md unchanged.

Known limits: intentionally sparse flat terrain, repeated settlement/prop/creature rigs, generic melee
variants and provisional higher-level balance. Shops, lodging, training, NPC healing, gathering,
professions and dungeon entry/instances are catalog placeholders. Same-host zone transfers only;
parties do not persist across zones. Dense server chunk activation/long-leash navigation remain future
work. No 54-level content or player-capacity/physical-device performance claim. Browser harness
resumed earned state after deadline/selector/ferryman-count corrections; the prefix failure is retained
in evidence and final flows pass. Current build: main JS 811.56 kB raw / 180.19 kB gzip, Babylon
1,952.23 kB / 461.57 kB gzip; not a hardware benchmark. Development preview deploys with the existing
script after merge; public final SHA is in `/release.json` and the completion report.

Next gameplay task: densify Greenvale Marches from these catalogs, improve bounded regional routes/
habitats, then one persistent resource interaction. WORLD FIRST; no mass quest generation yet.

## Current Work — Greenvale Marches population and persistent gathering, 2026-10-05

- [x] Catalog-backed Marches density pass: five two-creature habitat pockets, Roadhouse herb beds,
      Hollow access road, 25 authored tree/rock props plus ten habitat grove trees, three inhabitants,
      and local directions from named existing roles. 13 creatures / 13 inhabitants in the Marches.
      Original five continents, dimensions, progression bands, place coordinates and eight quests stay intact.
- [x] Optional typed location-relative dressing/resource nodes in the existing version-2 world pack;
      duplicate/reference/bounds/biome/yield checks. Repeated variants at independent habitats retain
      original spawn IDs and use distinct additional placement IDs without regional handler branches.
- [x] One genuine resource type: Wild Herb. Beds (290,400) yield two / regrow 60 s; Hollow patch
      (772,1008) yields three / regrow 90 s. E / touch Gather, green minimap dot, result feedback,
      real item provenance, stacked material pouch and persistence. No profession or combat XP.
- [x] Shared patch, one gatherer, no party material multiplication. Existing zone/range/life/threat/
      attack/replay/work-limit checks; short locked DB transaction commits item grant plus regrowth
      deadline atomically. Failure leaves the patch available. One durable row per authored node.
- [x] Resource recovery rebuilds only resource entities/timers from DB after the owned checkpoint,
      covering a grant committed before a stale recovery image. Fresh runtime IDs, replay protection,
      regrowth/reconnect and party visibility verified; working combat/economy architecture reused.
- [x] Additive 0016 migration: exact previous hash to new hash across all recovery images. Actual
      UPDATE checked against 25 populated preview checkpoints by zone ID; every other field equal.
      Three migration regressions and existing ownership/migration checks pass.
- [x] Full `NODE_ENV=production TEST_DATABASE_URL=.../mmo_party_test pnpm verify` exit zero:
      format/lint/types, **218 unit + 141 PostgreSQL integration tests** (domain 69/realtime 64/API 8),
      four production builds and production debug-hook guard. Final catalog/client delta also checked
      with 30 authoring tests, both package typechecks and another format/lint pass.
- [x] Actual two-client keyboard/touch browser flow: real north-gate entry, shared herb entity,
      one harvest, both-client depletion, pouch UI, actual regrowth + touch harvest, login retention,
      persistent party, road-to-meadow exploration and no browser exceptions. **12 assertions**;
      390×844 / 844×390 controls remain within viewport. No teleports or synthetic item grants.
      Read-only PostgreSQL proof: both earned totals equal distinct grant counts × two (**7 assertions**).

Verified 2026-10-05 · Codex · implementation commit: **d014293320384b94ca09ef9287128e290e624a8d**.
Architecture/coordinates/rules/extensions: [Marches gathering](world/marches-gathering.md).
Proof: `docs/world/evidence/marches-*`; repeatable browser flow: `scripts/e2e/marches-gathering.cjs`.
AGENTS.md / MASTER_PLAN.md unchanged. Existing deployment script deploys verified origin/main;
public release SHA/result are provided in the completion report and `/release.json`.

Known limits: only Wild Herb is harvestable; it is collectible stock until a later supply/recipe use.
Tools, profession levels, extra resources and crafting remain unchecked. Two patches share first-winner
rules, not combat-loot rotation. Beds are the browser-tested interaction; Hollow uses the same validated
runtime path with a different authored yield/deadline. Regional population/art remains greybox and most
of the multi-kilometre region is still reserved space. Browser proof resumed genuinely earned state
through harness selector/route corrections; ordinary collision requires walking around trees. Software
GPU/touch emulation is functional proof, not physical Android performance. External follow-ups remain
separate from gameplay development.

Next gameplay task: one compact catalog-backed Marches supply expedition and a practical herb sink,
using existing quest/reward/party/navigation systems. No mass quest generation or profession engine.

## Completed Work — Greenvale starter-region qualification, 2026-10-06

Agent: Codex. Baseline main/deployed: `138891dd19ed6932a50c32df3e050c7b9de55ce7`.
Feature branch: `codex/greenvale-complete`. AGENTS.md / MASTER_PLAN.md unchanged.
Design, scope and unfinished slices: [Greenvale Complete](gameplay/greenvale-complete.md).

- [x] Validated catalog-backed authored route: eight additional places, six inhabitants, outlaw/stonekin
      regional variants, river/vault roads and dressing. Marches totals: 26 places, 19 inhabitants,
      19 creatures. Five continents, region bounds/bands, old place coordinates and deployed quest IDs
      remain intact. Proof: 121 game-data unit tests, including full new road-corridor clearance.
- [x] Version-3 service/entry content schema and compilation checks: missing/duplicate references,
      impossible exchanges, input quantities and placed cave encounters. Earlier pack versions remain
      compatible. Atomic NPC buy/material sell/workshop exchanges and explicit backpack instance sales;
      ownership, locked/storage/equipment protection, optimistic versions, wallet/ledger/provenance and
      durable UUID receipts. Proof: 12 targeted domain + 3 realtime PostgreSQL tests, including competing
      requests, failed-cost rollback, replay and restart. Completion ACK now follows full reconciliation.
- [x] Three real gathering types on five shared persistent nodes: herbs, hardwood and iron shards.
      Three recipes produce actual cloak/sword/staff instances; vendor offers provide a material sink.
      Existing depletion/regrowth/one-gatherer authority reused. Proof: catalog integrity and competing
      hardwood/ore transaction/recovery tests; original gathering regressions remain green.
- [x] Persistent server-position discovery and atlas indicators, independent of quest acceptance.
      Alive/finite/range checks, insert deduplication and reconnect reconciliation verified in PG/realtime.
- [x] Five linked main-story definitions, four side quests and one daily contract authored in one pack.
      Existing main arc/rewards preserved. Repeat acceptance resets only after 24 hours, with cycle-specific
      reward source references. Two-player closure transaction test verifies personal supplies/visits and
      shared exact-once kills; its prerequisite setup is a domain fixture, not a claimed browser playthrough.
      Main-story browser qualification remains in progress below.
- [x] Shared-world Broken Vault entry/encounter foundation with actual catalog stonekin, personal boundary
      inspection and typed atlas description. No private instance or completion chest is claimed.
- [x] Staged genuine new-player completion of all original seven and five new main quests; actual
      movement/combat/collection/dialogue and earned equipment, no grants or teleports. Timber and ore
      side quests also complete. Saved screenshots and resumed-stage checks are in
      `gameplay/evidence/greenvale-complete/`. Agent: Codex; verified 2026-10-05.
- [x] Actual touch gathering/workshop, material sale, paid unique gear/exact-instance sale, banker,
      discovered atlas, 390×844 / 844×390 reachable controls, real joystick and crafted-item relog.
      Final touch-services script exited successfully without browser exceptions; saved checks/screenshots.
- [x] Staged two-client daily contract/shared hunt on preserved earned gatherers.
      Verified 2026-10-06 · Codex · 17 hunt-stage + 10 zero-exit closure assertions; two shared kills,
      17 XP per player per kill, two credits each, one alternating loot owner, personal turn-ins,
      cooldown and party/completion relog. Read-only PostgreSQL verifies unique kills and one reward
      ledger entry each. Waiting touch actor died at a respawn habitat; normal UI respawn retained
      credits and the closure continued without replaying kills/rewards. Harness-only route/focus/DPR/
      closure fixes; original earned-state evidence retained. See party evidence in the resume point.
- [x] River/quay return, remedy and daily solo browser completion plus desktop services/final relog.
      Verified 2026-10-06 · Codex · `desktop-qualified.json`: 18 assertions, exit 0, no browser
      exceptions; actual gathering, crafting, material/gear vendor exchange, banker/atlas and
      closure/crafted equipment relog. `story-db.json`: all 17 completed, one reward ledger row each,
      all 14 original completion timestamps unchanged. Original earned evidence retained.
- [x] Feature branch pushed at `e3265b2358beace3d3e79344ec1779153427c360` before this resume.
      VPS process/network access restored; SSH read confirms origin/main remains the baseline.
- [x] Qualification evidence committed/pushed, main fast-forwarded/pushed, deployed and publicly verified.
      Verified 2026-10-06 · Codex · `f47eff5d3eb7260a65e7781e4ae2c2b3360bd784`; existing deployment
      script exited 0 with backup/migrations/content sync and public SHA/readiness. Public browser:
      15 assertions, exit 0, real password/HTTPS, no production debug hook, herb/vendor/banker/atlas
      and persistent stock/sale/discovery; all 25 zones ready. Initial smoke harness waited before
      the touch-entry choice; corrected normal UI ordering passes. Public proof/screenshots preserved.
      Evidence release `826b8ba` also deployed and passed 15 public assertions after correcting the
      harness herb destination to the actual node center. Its failed four-assertion prefix was an
      out-of-range arrival (3.12 m), not a regrowth fault; read-only DB proof/failed prefix retained.
      The harness now saves credential-free failure diagnostics. Runtime gameplay remains unchanged.
      After archiving this first release, the final evidence commit receives the same deployment/
      browser checks; `/release.json` and `/tmp/greenvale-public-final/proof.json` identify its SHA.
- [x] Private dungeon admission, ownership/lifecycle/reset, reconnect and completion rewards — 2026-10-09 systems qualification below.
- [x] Profession ranks, tools, timed crafting and consumable effects — 2026-10-09 qualification below.
- [ ] Repair remains unsupported without authoritative wear.

Verified code evidence so far: 229 unit tests; 81 domain / 65 initially-passing realtime cases plus
10 corrected/targeted realtime cases; 8 API cases; production builds and debug-hook guard. The first
full verification exposed an early NPC-service completion ACK and a timing-sensitive crash-test health
bound. ACK ordering was fixed; the test-only no-regeneration fixture now verifies exact health
preservation rather than confusing legitimate regeneration with rollback. Focused reruns pass.
Resume checks on 2026-10-06: 121 game-data tests pass; browser scripts parse; local lint/format
rechecked. Resumed browser qualification now passes: 18 solo + 17 hunt-stage + 10 zero-exit party
closure assertions, plus read-only PostgreSQL proof and reviewed screenshots. Monorepo typecheck,
repository lint and all four production builds/debug-artifact guard pass. The original aggregate
suite was not repeated for browser-only harness corrections. No hosted CI/device performance is claimed. Public deployment/password/browser qualification now passes
separately in the archived release evidence (15 assertions; first release `f47eff5`).

Implementation commit: **1258bf5addb1346afaa9d6aebdc0927559458178**. Exact preserved actors, evidence and
qualification/deployment commands: [qualification record](gameplay/evidence/greenvale-complete/README.md).
At resume, remote main was confirmed at the baseline on 2026-10-06. GitHub write operations
were previously blocked by the execution profile. Access is restored and the feature branch was
already pushed at `e3265b2`; all remaining browser qualification now passes. Main fast-forward/push,
deployment and public browser checks pass at qualification release `f47eff5`; final evidence commit
receives the same deployment/browser checks, with SHA-bearing output retained at
`/tmp/greenvale-public-final/proof.json` and public `/release.json`. Next gameplay task remains
private-party Broken Vault lifecycle/admission/recovery/reset/completion rewards; profession
tools/ranks/timed crafting remain later.

## Current Work — Greenvale private runs and professions, 2026-10-09

Continues deployed baseline `eabb679` on `codex/greenvale-systems`; no next-continent work.
This section supersedes the previous private-run/profession next-task notes above.
Rules, architecture and repair rationale: [systems specification](gameplay/greenvale-systems.md).
Qualification evidence: [record](gameplay/evidence/greenvale-systems/README.md).

- [x] Private solo/frozen-party admission, child ownership and authoritative UUID routing;
      level/nearby/alive/leader checks, outsiders isolated, existing durable two-zone transfer reused.
      Focused gateway tests verify separate runtime identities, stale targets, frozen membership,
      full exit before reset, expiry and crash/reconnect routing. Domain tests serialize overlapping cohorts.
- [x] Two guardians and Bell Keeper, durable instance-scoped kill completion, personal supplies/copper
      for actual joined members only; atomic reward markers, provenance and ledger. Concurrent completion
      pays once; never-entered members receive nothing. Existing enemy XP/shared rotating loot retained.
- [x] Reusable Herbalism/Woodcutting/Mining/Fieldcraft XP and five ranks; inventory-backed field/fine
      backpack tools and Apprentice requirement for fine tier. Harvest XP/yield commit with depletion.
- [x] Durable timed crafting for existing equipment recipes and new remedy; one active job, exact-once
      costs/output/XP, reconnect/restart persistence and full-storage rollback/Recovered overflow.
- [x] Real remedy sink: owned unlocked backpack consumption, 60 health, persistent 30-second cooldown,
      receipt/checkpoint recovery, no resurrection. Domain concurrency and simulation checkpoint tests pass.
- [x] Skills progress/timers/result collection and dungeon guidance; actual desktop profession loop passes
      five assertions. Actual touch craft/relog/collection/joystick passes; overflow found and fixed,
      portrait/landscape continuation passes four assertions with reviewed screenshots.
- [x] Safe additive migration on restored earned data: all 25 checkpoint payloads semantically unchanged
      except catalog hash; checkpoint versions/timestamps preserved. Original preview/public data untouched.
- [x] Staged solo dungeon browser qualification: actual entrance movement, all three encounters,
      fresh-auth reconnect, death/normal threshold recovery, real crafted remedy use, completion,
      relog, exit/reset and fresh UUID with zero objectives. Read-only PostgreSQL proves three kills,
      one four-shard completion source/history grant and one correlated 150-copper ledger payment;
      reward/membership tombstones survive reset. Screenshots reviewed; saved run resumed after harness fixes.
- [x] Two-player touch dungeon qualification: real invitation/admission, same private UUID, all
      encounters, fresh-auth reconnect, completion, relog, exit/reset/new identity; 11 final assertions.
      An earlier live completion exposed a checkpoint/payout deadlock. Sorted character-first locks
      and first-join-only membership writes fixed it; six-payout/20-checkpoint regression passes.
      The original completed run survived host restart with no duplicate payout; a fresh full party
      run then passed with the fix. Final SQL: nine kills across three completed runs, five personal
      completion grants and five correlated 150-copper payments; zero private routes/pending effects.
- [x] Existing equipment recipe with actual 15-second timer: earned actor harvested two hardwood batches,
      paid for an Oak Staff, relogged and collected it with +20 Fieldcraft XP; seven browser assertions.
      The older workshop harness now collects its timed Sword result instead of assuming immediate output.
- [x] Full release gate: `NODE_ENV=production TEST_DATABASE_URL=<isolated test DB> pnpm verify`
      passes on 2026-10-10: 232 unit + 89 domain + 72 realtime + 8 API = 401 tests;
      14-package typechecking plus scripts, format/lint, four builds and production debug-hook guard.
      Legacy crash tests now await durable recovery completion instead of assuming idle queues mean
      expired worker leases are resolved. Immediate remedy vitals and expired orphan cleanup regressions pass.
- [ ] Clean feature commit/push, fast-forward main/deployment and public new-system smoke.
- [ ] Durability/wear/repair. Stored durability has no authoritative combat-wear bridge or broken-gear
      stat handling. A repair charge would be shallow and potentially race with future wear; deliberately
      unsupported. See specification and appended architecture decision for implementation prerequisites.

Known limitations: dungeon terrain is a functional greybox; parties remain zone-local outside runs and
must reform for a subsequent party reservation. Membership is frozen for each two-hour run. Fine tools
improve yield after Apprentice; old hand gathering remains possible. Persisted recipe IDs are immutable.
At most 64 child simulations are admitted per entrance host; no capacity/performance claim is made.
Emulated touch proves functional controls only. No physical-device performance qualification is claimed.

Next recommended task after this release: build authoritative durable combat wear and broken-item stat
reconciliation before enabling repair; continue Greenvale systems hardening rather than opening another continent.
