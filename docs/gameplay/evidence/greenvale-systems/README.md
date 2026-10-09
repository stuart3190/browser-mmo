# Greenvale systems qualification

Baseline: clean deployed main `eabb679`; feature branch `codex/greenvale-systems`.
Agent: Codex, 2026-10-09. Isolated preview database restored from the earned local preview;
no progression grants, teleports or resets were used for browser qualification. Original preview
and public databases remain separate. These are functional SwiftShader/Playwright checks,
including emulated touch; physical-device performance is unqualified.

- `desktop-professions/`: real purchased herbalism tool, harvest yield three, timed craft,
  password-free development relog, real output and Fieldcraft XP. Five passing assertions.
- `equipment-craft/`: actual herb/tool harvest and two hardwood harvests separated by normal regrowth,
  15-second Oak Staff job, relog, real result and +20 Fieldcraft XP. Seven passing assertions;
  screenshot inspected. `SYSTEMS_RECIPE` selects an existing authored recipe; missing gatherable
  inputs are obtained through real node interactions. The older full-story workshop script now
  collects its timed Sword output; only its syntax/format is rechecked here, not its entire old story run.
- `touch/craft-stage.json`: same gameplay with touch taps, timed craft/relog/collection and joystick.
  The final layout assertion failed because the Skills content overflowed its visible sheet.
  The panel height was corrected; `touch/proof.json` then passed joystick plus portrait/landscape
  layout checks with no browser exceptions. Both screenshots were inspected.
- `solo/`: staged genuine run. Entry/first guardian were saved before a reconnect-wait harness
  race; that stage's immediate reconnect observation is superseded by the resumed checks.
  Recovery stage verifies a fresh auth after disconnect, actual death/normal threshold respawn,
  second guardian and a crafted remedy restoring health. Closure defeats the Keeper, verifies
  completion/relog, exits, resets and creates a different UUID with zero objectives, then cleans up.
  An initial dodge harness repeatedly approached the boundary under software rendering; the closure
  used normal attacks/abilities in the same saved run. No boss state/progression was injected or reset.
  Death/completion screenshots were inspected.
- `party/encounters-stage.json`: genuine touch invitations/admission, both members in the same UUID,
  all three encounters and fresh-auth reconnect. A payout/checkpoint lock inversion fenced the host
  after the final kill. Atomic completion/rewards were retained. The corrected lock order has a
  dedicated six-payout/20-checkpoint regression; `party/restart-closure.json` verifies the same completed
  party state after host restart, relog, exit/reset and a new identity. Its screenshot was inspected.
  `party/final/` is the fresh full touch run after the fix: 11 passing assertions and reviewed screenshots.
- `local-db.json`: read-only durable kills, membership/reward markers, craft jobs/progression,
  consumed remedy receipt and reward provenance correlated with a single 150-copper ledger entry.
  Nine private kills in three completed runs; five personal grants each correlate to one 150-copper
  payment. Reset/restart retain those tombstones; after all cleanup there are no private character
  routes, private checkpoint images or pending effects. A final cleanup audit found an expired
  image left by a reset/checkpoint race; the host now drains captured writes after removing the
  child and recovers expired orphan images on startup. Five gateway regression tests pass, including
  reclamation after an injected late image. The earned preview was recovered by the real host,
  without a manual SQL deletion. A zero-regeneration remedy regression also verifies immediate
  vitals publication and exactly-once checkpoint recovery. A destroyed source grant represents ordinary stack merging, not discarded
  reward stock; the merge history is retained. `invariants.sql` provides read-only repeatable queries.
- `migration.json`: earned-backup migration preserves all 25 checkpoint payloads except the exact
  catalog hash, including version and timestamp. JSON key order is ignored for semantic comparison.

Commands use `PLAYWRIGHT_PATH=/opt/aria-browser/node_modules/playwright`,
`WEB_URL=http://127.0.0.1:5188`, `node --import tsx scripts/e2e/greenvale-systems.cjs`.
Modes: `professions`, `solo`, `party`, `touch-resume` (layout continuation), `approach` (earned movement).
`SYSTEMS_TOUCH=1` enables actual touch taps/joystick; actors come from the preserved earned preview.
Full verification uses a separate `mmo_systems_test` PostgreSQL database, not the browser preview.
Public smoke uses only the reserved password account and observes production transport; it never
uses a production debug hook. Credentials are neither committed nor included in the evidence.

Full release gate at `cb98b4b4b28fea4318e47897ac63d2bef0516daa` passes 401 tests,
14-package plus script typechecking, lint/format, four builds and the production debug-hook guard.
An initial public smoke proved harvesting and timed craft/relogs, but screenshot review exposed a
transient rate-limit toast that per-page transport logs had missed. Skills database polling was
removed because auth/gameplay already push authoritative state; only countdowns tick locally.
The public harness now aggregates protocol errors across every relog. UI tests (10), complete
typechecking, touched-file lint/format and all builds pass after that UI-only correction;
backend source remains the fully tested implementation. `public/` records 13 passing TLS/password smoke checks at
`a416fc9855a2523f9af7037b8eab9cfb32133280`: earned harvest XP, a real timed remedy job,
collection and +20 Fieldcraft across password relogs, authoritative inventory, touch Skills bounds,
dungeon guidance, absent debug hook, zero browser/protocol errors across every relog and 25-zone
readiness. API readiness also passes. Screenshots were inspected; the corrected sheet has no toast.
Read-only SQL preserves both original characters, all 39 original item identities and four completed
quests. Each of two completed jobs has one creation-history quantity of one; merged inventory holds
two remedies. Current stack quantities can grow through normal merging, so creation history proves
the original output quantity. No public dungeon combat qualification is claimed for the level-one
reserved account; full solo/party combat evidence is from the earned isolated preview.

Feature and correction were pushed, main fast-forwarded and deployed with
`bash scripts/deploy-broken-odyssey.sh` (database backup, additive migration, content sync, readiness).
Final documentation/evidence commit receives the same deployment and public checks. Its exact SHA
and complete 13-check browser proof remain at `/tmp/systems-public-final/proof.json` and public
`/release.json`, avoiding a self-referential commit ID inside committed evidence. Public command:
`PLAYWRIGHT_PATH=/opt/aria-browser/node_modules/playwright EXPECTED_DEPLOY_SHA=<release SHA>
node scripts/e2e/greenvale-systems-public.cjs /tmp/systems-public-final`.

Repair is deliberately unchecked; see `../../greenvale-systems.md` for the missing wear/repair boundary.
