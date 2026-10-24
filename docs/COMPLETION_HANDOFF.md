# Broken Odyssey completion handoff

Updated 2026-10-24 by Codex. The owner authorizes sustained completion without routine confirmation.
Read AGENTS, MASTER_PLAN, PROGRESS and DECISIONS. Goal is ACTIVE under the owner's new gameplay-only
priority. Earlier external-blocker conclusions are superseded: capacity, staging, off-host backup and
physical-phone signoff are NOT blockers to gameplay development. Do not run performance/benchmark/
capacity or infrastructure work. Keep production unchanged; release validation is a separate later phase.

Completed this gameplay pass: level-3 Iron Guard / Frost Nova, status VFX/HUD and touch combat clarity.
Proof: `gameplay/evidence/tactical-abilities-2026-10-24/` (both class victories; isolated level-3 fixtures).
Latest completed: visible cap, plate, robe, three cloaks and buckler; server-derived local/remote
appearance, ordinary Marches merchant access and honest proficiency previews. Ten multiplayer
purchase/equip/remove/relogin checks plus three folded-cloak follow-up checks pass; screenshots
reviewed. 28 frontend,133 content,90 world,7 schema,18 domain tests and types/lint/build/content
validation pass. Evidence: `gameplay/evidence/equipment-appearance-2026-10-24/`. `/tmp/bo-shop-fit.py`
is integrated and obsolete; do not rerun. Next gameplay task: varied Cantor attack sequence.

Completed: gear condition/wear, broken-gear consequences and paid town repair. Proof:
`gameplay/evidence/gear-condition-2026-10-24/` includes a fresh level-one real-input journey with
no grants/teleports, earned 80→79 sword wear and touch repair/relogin at 80. Domain/RT/UI/content
checks, types, lint and build passed. Tactical milestone is commit `3e7eaa6`; gear condition is `229bf55` (both pushed).

Completed: Amber Coast Tidewatch's three quests, shore exploration, crab encounters, Bellkeeper,
ring reward and relogin, verified for both classes. Proof: `gameplay/evidence/amber-tidewatch-2026-10-24/`.
The initial Mage return path failure is retained; fresh corrected Mage run passes eleven checks.
Desktop/portrait/landscape screenshots reviewed; world labels and stale target feedback fixed.
126 content, 80 world, 13 frontend and chapter integration tests pass, plus types/lint/build/content
validation. Fixtures begin at level five with prior story closure; no earned 1→5 claim.

Completed: four level-five specialisations and free mentor retraining, with server-owned effects,
cooldown preservation, persisted choice, live tooltips and character summary. Evidence:
`gameplay/evidence/specialisations-2026-10-24/`. Both-class real-input desktop/touch playthrough
passes all choices, tactical effects, offensive cooldowns, victories and relogin. 128 content,
85 world (84 suite + added recovery case), 13 frontend, one domain and ten realtime checks pass;
repository types/lint/build pass. All prepared drafts are integrated; `/tmp/integrate-specs.py` is
obsolete and MUST NOT be rerun. Coast milestone `8959ce7` is pushed.

Completed: H/touch quick remedy with server-owned readiness/count/healing, pending input guard,
bag readiness and relogin. Evidence: `gameplay/evidence/quick-remedy-2026-10-24/`; eleven real browser
checks pass (merchant purchase, real crab injuries, keyboard/touch healing, counts, cooldown,
relogin and portrait/landscape hit targets). 15 frontend, eight domain, six realtime checks plus
types/lint/build pass. Specialisations commit `45df411` is pushed.

Completed: server-replicated class/path/held-weapon appearance, remote equip/unequip and relogin,
plus deduplicated toasts and narrow mouse layout fixes. Evidence:
`gameplay/evidence/player-appearance-2026-10-24/`. Seven multiplayer browser checks, responsive
follow-up and screenshot review pass; 16 frontend, 86 world, 17 domain tests plus types/lint/build.
Fresh level-five fixtures use normal purchases. Armour-slot-specific art is not implemented.
Remedy commit `b6ad7c4` and appearance commit `06fa657` are pushed.
Completed: earned coastal weapon commissions, story gates and useful recipe cards; effective
maximum health explained on character sheet. Evidence: `gameplay/evidence/tidewatch-commissions-2026-10-24/`.
130 content,17 frontend,22 domain checks and types/lint/build/content validation pass. Warrior full
browser pass; Mage chapter/craft/equip passed before a sparse-stat assertion bug. Same earned Mage
resumed without data mutations, proving 0→20 power, victory/wear and relogin. Original failure kept;
this is staged evidence. Both functional test controllers stopped their own services/DB afterwards.

Completed: optional combat/reward sound and Settings/Controls. Evidence:
`gameplay/evidence/combat-audio-2026-10-24/`; 15 native-browser checks, actual class fights, saved
volume/mute, silent successful abilities and touch layout checks pass. Label association and HUD
bleed-through fixed; visual follow-up inspected. 22 frontend tests, types/lint/build/debug guard pass.
No music/ambience or physical listening claim. `/tmp/bo-audio-draft/integrate.py` is now OBSOLETE;
do not rerun it. Commission commit `660f75e` is pushed.

Completed: walking-aware passage guidance, real objective positions and story/closed route filters.
World highlights the recommended route. Eight real browser checks, 132 content and23 frontend tests,
types/lint/build/debug guard pass; screenshots inspected. Evidence:
`gameplay/evidence/passage-guidance-2026-10-24/`. Audio commit `6aa0342` is pushed.

Completed: Elderwood living-seal chapter, nearby chapter respawns and clearer revival UI. Both
coastal actors earned three new quests, defeated spitters/Cantor and reached level six. Staged
resumes verify necklace bonuses and one equipped reward after relogin; driver failures retained.
Evidence: `gameplay/evidence/elderwood-living-seal-2026-10-24/`. 133 content,27 frontend,15 focused
world/combat and one domain test, lint/types/build/content validation pass. Nine real forest death/
recovery checks pass including first-frame 3s countdown and cleared target. Screenshots reviewed.
Completed: Available adventure journal, shared recommendations, persisted guide selection and
completed story history; 9 desktop +10 touch browser checks and final screenshot review pass.
Evidence: `gameplay/evidence/adventure-journal-2026-10-24/`. Portrait sizing and a temporary status
clock regression fixed; failures preserved. Passage-guidance commit `358e314` is pushed.

ACTIVE next gameplay milestone: varied, readable Rootbound Cantor encounter. Existing forest boss
uses only a fixed ground circle; add authored attack sequencing through the current authoritative
cue/damage pipeline, preserve checkpoint recovery, and verify actual dodging with both classes.
Equipment milestone is verified (see latest entry above). All armour test controllers have stopped.
Most atlas regions remain incomplete. No production, capacity or infrastructure work.

All `/tmp/bo-*-draft.py`, `/tmp/build-forest-driver.py`, `/tmp/bo-gameplay-polish.py` generators used
this pass are OBSOLETE and must not be rerun. Current source contains their corrected integration.
Retained iaQjr4 actors are now both level six with completed coastal/forest stories and earned
Tidewatch weapons/rings/Heartwood necklaces. Preserve earned rows. Its controllers and fresh 2vuS1k
controllers have exited; evidence only is archived. No production changes.

Verify functional behavior in the isolated
local game, preserve existing earned actors, commit/push incrementally and continue across milestones.

## Source and live safety boundaries

- Editable `/root/browser-mmo`, branch `codex/shippable-completion`, origin
  `git@github.com:stuart3190/browser-mmo.git`. All implementation branches are integrated.
- Latest runtime merge: `9d1c769a1850505779c5cd012e8a47a036e18051`. Runtime feature commit
  `9567e0e946be6fbcad31d29fec8904b8d483fab6` passed hosted CI **40104670712**. Merge CI:
  **40105454236 PASSED**. Documentation head `d2da1bf` also passed CI **40105991245**.
  New gameplay implementation follows the owner priority recorded in MASTER_PLAN.
- Latest prepared immutable candidate:
  `/srv/brokenodyssey/releases/9d1c769a1850505779c5cd012e8a47a036e18051`.
  Four production builds, all-chunk debug guard and Caddy validation pass. Manifest and bundle
  checksums: `hardening/evidence/idle-checkpoint-cache-2026-10-24/preparation.json`.
- Earlier prepared f64d084 candidate remains intact. NEVER edit immutable releases in place.
- Live `/srv/brokenodyssey/current` STILL points to `2c47b27a38f0bc74f3a7192f713775c3a9361729`.
  Preparation preserved API/RT/web service PIDs/start times and `current`. Readiness passed, 25 zones.
  Production ports: API4461, RT4462, web4460, PostgreSQL55440.
- No public deployment, production DB mutation/reset, admission increase or purchase occurred.
  `--candidate --prepare-only` exits before runtime credential reads or live configuration/service/
  database/current changes. The candidate is prepared, NOT published; failed gates do not justify launch.

## Own data and tooling

- Own PostgreSQL17: port55441, data `/tmp/brokenodyssey-completion-pg`, socket
  `/tmp/brokenodyssey-completion-socket`. Private ignored `.env` points only to own databases.
- Preserve `bo_completion_dev` and its earned actors. `bo_completion_test`, `bo_guilds_test` and
  `bo_recovery_test` are disposable, never production or earned data.
- Own API4471/RT4472/Vite5180 and presentation5182 remain STOPPED. All local qualification controllers
  exited. The compatibility container bo-qualification-pg16 is stopped; own PostgreSQL stays available.
- Qualifiers create their own loopback PostgreSQL clusters and clean up only their own processes.
  Retained production fixture directories contain private passwords/keys: archive proof only.
- Playwright `/opt/aria-browser/node_modules/playwright`, Chrome `/usr/bin/google-chrome`.
  Use `pnpm exec tsx` for CJS drivers importing TS. Game-playtest skill was read and used.
- Use detached setsid jobs/logs for long checks; foreground tool sessions sometimes died around90s.
  Explicit `NODE_ENV=production` is required for release builds when local `.env` says development.
- Integrated performance worktree: `/tmp/bo-idle-checkpoint-cache`; branch `codex/idle-checkpoint-cache`.
  No unfinished runtime work remains there. Do not symlink node_modules between worktrees.

## Verified requested gameplay

Preserved earned users Warrior `finishwar_mvm9azse` and Mage `finishmage_mvm9ku7m` reached level5
and completed/received17 quests (12 main/five side), crafting/vendor/bank/discovery/relogin
continuations and professions. No grants, teleports or injected progression. These are staged
resumes, not one uninterrupted orchestrator run. Earlier failures are retained.

Warrior solo, Mage solo continuation and mixed touch party each finished guardians/Bell Keeper,
same-instance reconnect, completion/relogin, exit/reset. DB evidence confirms three completed/reset
runs and all four rewarded member records: Warrior `01a16dcf-f42f-7376-8e59-170e92baf8f0`, Mage
`01a16de4-813b-741c-af96-3193a40c1723`, mixed `01a16de9-5e7a-7897-a43f-6abf27c017db`.

Evidence: `gameplay/evidence/earned-classes-2026-10-24`. Authority, persistence, inventory/equipment,
XP/loot, quests, regions and combat architecture were preserved. Direct trade, marketplace UI,
nearby/zone/party chat, friends/DM, persistent guilds/chat and responsive inventory/onboarding are
integrated. Guilds use additive migration0024. Guild vault, additional classes, remaining specialisations and broader world art remain long-term incomplete; they are not claimed complete.

## Latest verification and performance result

- Full isolated `lk7ghT`: format/lint/types, **241 unit + 204 integration tests** (117 domain,
  75 realtime,12 HTTP), four production builds/debug guard, assets/content, populated upgrade/restore,
  **all78 browser assertions** pass. Earlier `qiceb9` failed a boss recovery test with unseeded RNG;
  fixed only its hit roll. Production combat unchanged. Failure retained.
- Built production `XMQkkz`: **28 TLS/password browser assertions** pass, including deferred engine
  loading, no development hook/login, hidden private routes, guild consent and logout revocation.
- Its quiet unprofiled five-player/120 s workload **FAILS**: **19.2906 Hz** (minimum19.5), RTT p95
  **395 ms** (maximum250), HTTP p95 177.6 ms passes. Zero unexpected protocol/HTTP errors/disconnects,
  all5 alive, four durable rewarded kills,195 inventory writes,five sales,65 direct/65 guild messages.
- CPU0.165 cores,RSS150.7 MB,sampled tick p95 9.75 ms,checkpoint p95 208.65 ms. Earlier qWvlw8 had
  19.123 Hz,RTT p95162 ms,CPU0.296 cores,tick p9542.8 ms. Sequential host variability prevents a
  causal claim for every metric. No safe player capacity is established.
- Current timer-only control:19.7996 Hz,11 skipped slots,p9978.106 ms,max207.993 ms. Do not claim
  hardware alone is proven responsible. The encoding optimization removed measured avoidable work:
  identical24,941,300 bytes over2,600 captures, fresh schema142.3 ms versus cached2.4 ms.
- Cache only zones that never admitted/restored a player or exposed mutable debug entities; invalidate
  all idle mutations and fingerprint public party/effect data. Empty outer-payload reuse stays separate
  from durable acknowledgement. Late kills/resources, escaped references, crash/fencing tests pass.
- Archive: `hardening/evidence/idle-checkpoint-cache-2026-10-24`; raw fixtures under
  `/tmp/brokenodyssey-qualification.{lk7ghT,qiceb9,XMQkkz}`. The load report remains `ok:false`.
- Earlier rendering/startup evidence: `hardening/evidence/final-browser-2026-10-24` and
  `gameplay/evidence/static-rendering-2026-10-24`. Static meshes532→165 with identical geometry;
  actual NPC picking/touch movement pass. No physical-device FPS claim. Startup failures have an
  explicit reload recovery path; no hidden automatic retries.

## Owner priority supersedes the prior release blocker

The prior release results above remain historical evidence, not a gameplay-development stop condition.
Continue the ranked gameplay milestones. Do not publish, weaken data safeguards, repeat load tests or
investigate infrastructure. Physical-device and deployment validation belong to a later release phase.
