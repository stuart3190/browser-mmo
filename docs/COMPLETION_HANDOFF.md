# Broken Odyssey completion handoff

Updated 2026-10-25 by Codex. Goal ACTIVE. Read AGENTS, MASTER_PLAN, PROGRESS and DECISIONS.
Owner authorizes sustained independent gameplay implementation, functional browser tests and
verified commits/push. GAME ONLY: zero performance optimisation, benchmarking, capacity tests,
infrastructure investigation, staging or backup planning. Never alter production or immutable
releases. Release safety validation is a separate later phase; do not claim shipping readiness.

## Source and current work

Editable `/root/browser-mmo`, branch `codex/shippable-completion`, origin
`git@github.com:stuart3190/browser-mmo.git`. Latest pushed **4225ba6** (Three-watch aftermath and recoverable controls).
Production initially observed at immutable 2c47b27; untouched. No subagents authorized.

**Committed/pushed 4225ba6, gameplay verified:** Three-watch aftermath. Forest pack rev3 adds once-only
Tamsin→Maren conclusion, bound both-class Watchkeeper's Compass and two optional 24h patrols.
Existing authoritative quest/reward/cooldown mechanisms, no schema migration. Exact repeat
availability shown in NPC dialogue/journal. 141 content/33 frontend tests, types/lint/build/content
validation pass. 43 actual both-class continuation checks pass plus 9 earlier Warrior checks before
a corrected driver-only crab-warning timeout. 11 final desktop/portrait dialogue review checks pass.
Sticky 44px NPC header and existing PNG browser icon linked. Evidence under
`docs/gameplay/evidence/three-watch-aftermath-2026-10-25/`. Screenshots reviewed. Actors originally
began as level-five focused fixtures; coast/forest/epilogue/patrol progress subsequently earned.
Never describe them as fresh level-one-to-six.

**Committed/pushed 4225ba6, controls verified:** Twenty fresh desktop/portrait camera checks pass. Existing
mouse drag/wheel and touch drag/pinch are preserved. New Reset camera view restores the starting
angle/distance without moving the character. Pinch driver failures traced to Playwright's one-touch
capability; corrected to five supported contacts before boot. Experimental zoom/CSS changes and
private input diagnostics removed. Evidence: camera-controls-2026-10-25, screenshots reviewed.
Types/lint/build pass. Controller 1147857 ended; `/tmp/bo-camera-multitouch.log` and iaQjr4/camera-multitouch.

**Committed/pushed 4225ba6, built client verified:** Nineteen actual desktop/portrait UI checks pass, with no
page exceptions or failed assets, using built files and no development hook. Saved chapter/patrol
states, exact timers, handbook, regional chart, camera reset and relogin. Evidence under
three-watch-aftermath-2026-10-25/built-client. Controller 1150309 ended; `/tmp/bo-built-game.log`.
All main-checkout browsers stopped. This is local functional gameplay verification, no deployment.

**Prepared, unverified continuity tooling:** coast.cjs explicit COAST___USER bypasses fixture
writes, preserves weapons, requires earned Marches closure/level 5 and walks back through actual
gate. forest.cjs accepts explicit FOREST___USER and validates class/earned weapon. Optional
EARNED_CHAPTERS=1 stages Tidewatch, Elderwood and Three Watches after the systems journey.
Keep these separate from verified gameplay until used. coast.cjs does not yet resume partially
completed chapters; fix from actual failures if necessary. No player grants/teleports allowed.

## Current visual milestone — verified, commit pending

Ferries replace generic brown boat boxes with pointed open skiffs, planking, benches, oars, flags,
ropes and regional colour. Existing chunk lifecycle, authority, collision and travel nodes preserved.
33 frontend tests, repository types/lint/build and eleven actual desktop/touch crossing checks pass.
Both earned actors return to Pinewatch with equipment/story intact. Screenshots reviewed. Evidence:
ferry-landings-2026-10-25. Main controller 1155320 stopped; `/tmp/bo-ferries-checks-browser.log`.
No main-checkout browser remains active. No content hash or fixture cache change needed.

## Independent full earned journey — ACTIVE

Detached test checkout `/tmp/bo-earned-gameplay-20261025`, **3f1e538**, owns its cached installed
dependencies. Controller **PID1097045**, `/tmp/bo-integrated-earned-browser.log`.
Fixture `/tmp/brokenodyssey-qualification.ACsH5X`; state `earned-journeys/result.json`, current
stage `earned-journeys/warrior-story/run.log`. Users **journeyw_mvmz9wvw** and **journeym_mvmz9wvw**.
Warrior story 52 checks and professions 5 checks PASS, archived in earned-journeys-2026-10-25.
Current stage warrior-solo-vault/run.log; ordinary walk from camp to entrance underway.
Remaining Warrior solo Vault, Mage story/professions/staff/solo Vault and mixed
class touch-party Vault are scheduled. This checkout's runtime must stay unchanged during run.
No grants, direct player writes or teleports; ordinary controls and genuine earned progression.

On failure retain evidence and resume appropriate stage using EARNED_FROM_STAGE and BOTH existing
EARNED_*_USER. Do not recreate earned actors. After original run succeeds, continue its same
fixture/users into new chapters from earned-tidewatch with EARNED_CHAPTERS=1 and newer tested source.
Keep staged evidence; don't claim an uninterrupted run. New quest catalog hashes require handling
only the disposable simulation cache, never deleting player state or applying test procedures live.

## Recent verified and pushed gameplay

| Commit  | Delivered                                                                      | Evidence directory under docs/gameplay/evidence                |
| ------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| fa972ab | Inspectable class/path handbook and reachable Character header                 | class-handbook-2026-10-25                                      |
| 2a02a70 | Regional field chart, separate zone frames, touch pins and guidance            | regional-chart-2026-10-25                                      |
| 63b0869 | Class-appropriate Fen trailwear, authoritative rewards, item-panel dismissal   | class-trailwear-2026-10-25                                     |
| 07c4087 | Shared inspectable quest/service equipment previews, opaque NPC dialogue       | reward-inspection-2026-10-25                                   |
| 62ef82b | Cantor Roots Reach/Bough Sweep rhythm, warning/recovery geometry               | cantor-rhythm-2026-10-24                                       |
| 09893fc | Equipped armour/cloak/buckler visuals and normal outfitter stock               | equipment-appearance-2026-10-24                                |
| a395cbb | Three Elderwood quests, forest art/creatures/boss/necklace/revival and journal | elderwood-living-seal-2026-10-24; adventure-journal-2026-10-24 |
| 358e314 | Practical passage guidance                                                     | passage-guidance-2026-10-24                                    |
| 6aa0342 | Optional combat/reward audio and settings                                      | combat-audio-2026-10-24                                        |
| 660f75e | Earned Tidewatch weapon commissions                                            | tidewatch-commissions-2026-10-24                               |
| 06fa657 | Class/path/weapon appearance and replication                                   | player-appearance-2026-10-24                                   |
| b6ad7c4 | H/touch quick remedy                                                           | quick-remedy-2026-10-24                                        |
| 45df411 | Four level-five specialisations/retraining                                     | specialisations-2026-10-24                                     |
| 8959ce7 | Three coastal quests, shore art/Bellkeeper/ring                                | amber-tidewatch-2026-10-24                                     |
| 229bf55 | Gear wear, broken consequences and paid repair                                 | gear-condition-2026-10-24                                      |
| 3e7eaa6 | Iron Guard/Frost Nova/status VFX/touch HUD                                     | tactical-abilities-2026-10-24                                  |

Earlier Greenvale/Marches story, professions, private solo/party Vault, economy/trade/marketplace,
chat/friends/DM/guilds and persistence are documented in PROGRESS. Preserve them. Additional
atlas regions/classes/paths, guild vault and broader art remain long-term incomplete.

## Test safeguards and retained state

- Private ignored .env points to owned PG17 port 55441 bo_completion_dev/test. Domain global setup
  drops/remigrates ONLY bo_completion_test; verify exact loopback URL before running it.
- `QUAL_BROWSER_SUITES=<explicit gameplay suites> bash scripts/qualify-local.sh --skip-checks`
  creates isolated fixtures. Never default/full/production/load/backup qualification.
- Chrome /usr/bin/google-chrome; Playwright /opt/aria-browser/node_modules/playwright.
- Run builds before same-checkout browsers. Long jobs use subprocess.Popen(start_new_session=True)
  and explicit logs. Own runners clean only their service groups and disposable cluster.
- iaQjr4 retains genuine earned coastal/forest/aftermath actors. Read-only lookup by earned weapon
  or completed epilogue; all gameplay mutations through controls. Prior local checkpoint images
  are archived privately in pre-aftermath-test-world.json; no pending rewards when reconstructed.
  NEVER rerun `/tmp/bo-prepare-aftermath-fixture.cjs` or delete these images. Never copy them to repo.
- 4YTXAT retains fresh trailwear Warrior trailw_mvmyhrzw and Mage trailm_mvmyrkcm. SpSdTx map,
  gM6Bsk handbook, WbH0Ok outfitter and 3OHuI9 armour fixtures stopped. Preserve earned records.
- Finish evidence, normalize archived text whitespace, git diff --check, commit/push incrementally.

## Known verification limitations

Earlier DEV bootstrap occasionally failed fetching /src/main.ts during concurrent same-checkout
build/browser activity. Cause unknown; failure and diagnostic rerun retained in reward-inspection
and handbook evidence. Later frozen-source browser runs pass. Do not claim root cause fixed.
Incidental404 conclusively identified as /favicon.ico; explicit icon link now browser-verified.
Touch evidence is browser emulation, not physical-phone signoff. No shipping-readiness claim.

## Temporary drafts

All source generators used so far are applied and obsolete, including bo-aftermath-finish.py,
bo-camera-patch.py, bo-camera-finalize.py, bo-aftermath-driver.py, bo-epilogue-draft.py and all earlier handbook/map/
trailwear/reward-preview/Cantor/forest/shop/audio/spec generators. Never rerun over corrected
source. Current runners are named above. Preserve separate output dirs on every continuation.

## Next actions

1. Commit/push verified ferry art and crossing proof. Aftermath/controls already pushed 4225ba6.
   Leave unverified continuity tooling clearly identified.
2. Continue independent fresh story/systems run and earned chapter continuation; fix actual gameplay
   findings. Old external release gates are not gameplay blockers and must not trigger more work.
