# Broken Odyssey completion handoff

Updated 2026-10-24 by Codex. The owner authorizes sustained completion without routine confirmation.
Read AGENTS, MASTER_PLAN, PROGRESS and DECISIONS. The objective is not achieved. Release work is
blocked on missing staging/backup targets and physical-device acceptance. Core gameplay is verified,
but release capacity and off-host recovery remain unqualified. Do not call the game shippable or repeat unchanged load tests to seek a pass.

## Source and live safety boundaries

- Editable `/root/browser-mmo`, branch `codex/shippable-completion`, origin
  `git@github.com:stuart3190/browser-mmo.git`. All implementation branches are integrated.
- Latest runtime merge: `9d1c769a1850505779c5cd012e8a47a036e18051`. Runtime feature commit
  `9567e0e946be6fbcad31d29fec8904b8d483fab6` passed hosted CI **40104670712**. Merge CI:
  **40105454236 PASSED**. Documentation head `d2da1bf` also passed CI **40105991245**.
  Later changes are evidence/handoff only.
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
integrated. Guilds use additive migration0024. Wear/repair, guild vault, additional classes/
specialisations and broader world art remain long-term incomplete; they are not claimed complete.

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

## Remaining external gates and next action

The owner was asked asynchronously for an **existing staging host/SSH target and off-host backup
destination**. No answer has arrived. Physical iOS/Android acceptance is also pending. Use supplied
existing infrastructure for strict capacity/headroom and recovery qualification; no purchase is
authorized. Preserve WAL flush, ownership fencing and publish-after-commit ordering. Do not fake
catch-up ticks, weaken limits or publish the failed candidate.

The third consecutive blocker audit confirmed the same missing targets, with no new owner input.
The previous turn made substantive progress: encoding improvements, full qualification, integration
and immutable preparation. This turn revalidated repository state, the failed capacity evidence,
unchanged live release and the terminal successful CI run `40105991245`. No independent required
implementation or running qualification remains to finish before those external inputs arrive.

Goal status: BLOCKED, not achieved. Resume when an existing staging/SSH target and off-host backup
destination are supplied, with access arranged through the environment. Physical iOS/Android
acceptance must also be completed. Preserve the earned actors and prepared artifacts; do not restart
finished suites, publish the failed candidate or reinterpret the gates as passed.
