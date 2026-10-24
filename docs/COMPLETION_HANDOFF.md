# Broken Odyssey completion handoff

Updated 2026-10-24 by Codex. Owner authorizes sustained completion across milestones without routine
confirmation. Read AGENTS, MASTER_PLAN, PROGRESS and DECISIONS. Persistent goal remains active.
Do not declare shippability from feature existence or unit tests alone.

## Source and operational boundaries

- Editable repository `/root/browser-mmo`, branch `codex/shippable-completion`, origin
  `git@github.com:stuart3190/browser-mmo.git`. Main 5b19b52 integrates guilds 35ee149, checkpoint encoding, database lifecycle, startup recovery
  fb8bc5e and release preparation 84a3465. Rendering candidate a973ae5 remains isolated.
- Immutable live `/srv/brokenodyssey/current` points to release `2c47b27a38f0bc74f3a7192f713775c3a9361729`.
  NEVER edit releases. Production API4461/realtime4462/web4460/PostgreSQL55440. No production
  mutations/deployments in this completion effort. Unsafe public deployment needs explicit permission.
- Own PostgreSQL17 port55441, data `/tmp/brokenodyssey-completion-pg`, socket
  `/tmp/brokenodyssey-completion-socket`. Private ignored `.env` uses only own bo_completion_dev/test.
  Earned data is in bo_completion_dev: preserve it. bo_guilds_test/bo_recovery_test are disposable.
- Own API4471/RT4472/Vite5180 and presentation5182 are intentionally STOPPED after earned runs.
  Restart deliberately if needed. Compatibility container bo-qualification-pg16 is stopped.
- Use detached `setsid` jobs with redirected logs for lengthy checks; foreground tool sessions
  have sometimes died after ~90s. Verify actual completion, not merely a returned session ID.
- Playwright `/opt/aria-browser/node_modules/playwright`, Chrome `/usr/bin/google-chrome`, SwiftShader.
  TS-importing CJS drivers use `pnpm exec tsx`. Game-playtest skill already read and used.
- Keep all isolated qualifier databases separate from production and earned actors. Qualifier owns
  its own PostgreSQL cluster and cleans up processes. No secrets/passwords/keys in evidence commits.

## Verified gameplay

Main includes atomic direct trade, nearby/zone/party chat, marketplace, persistent friends/DM,
responsive inventory/skills/onboarding, durable private Vault and professions. Existing combat,
quests, persistence, economy and recovery architecture is preserved.

Earned users `finishwar_mvm9azse` and `finishmage_mvm9ku7m` each reached level5 and completed/received
17 quests (12 main, five side), crafting/vendor/bank/discovery/relogin continuations and professions.
No grants, teleports or injected progression. Warrior solo, Mage solo continuation and mixed touch
party all completed guardians/Bell Keeper, same-instance reconnect, completion/relogin, exit/reset.
Read-only DB verifies all original runs completed and all four member records rewarded:

- Warrior UUID `01a16dcf-f42f-7376-8e59-170e92baf8f0`.
- Mage UUID `01a16de4-813b-741c-af96-3193a40c1723`.
- Mixed UUID `01a16de9-5e7a-7897-a43f-6abf27c017db`.

All controllers exited. These are staged resumes, NOT a single uninterrupted orchestrator run.
Earlier driver/network failures are retained, not hidden. Evidence and reviewed screenshots:
`docs/gameplay/evidence/earned-classes-2026-10-24`. Actor data remains intact.

## Current verification and branches

- Hosted CI 40098308166 for 35ee149 PASSED. CI 40100303234 for 84a3465 is running. Earlier failed
  evidence JSON formatting was corrected f4ceb55. Main 5b19b52 archive commit is not yet pushed.
- Integrated 35ee149 OanPjT passes format/lint/types,236 unit,117 domain,75 realtime,12 HTTP tests, four builds,
  debug guard, assets/content and 20-table populated upgrade/restore. Aggregate FAILED at blank
  first trade login. Archive `docs/hardening/evidence/integrated-guilds-2026-10-24`. No network
  diagnostic existed for that failure; do not claim a specific cause.
- Guilds are integrated: migration 0024, consent, roles, durable chat, notices/transfer/disband,
  stale-guild binding, responsive UI. Final 15 browser assertions passed oHpLwU. Guild vault unfinished.
- Checkpoint encoding preserves exact v2 bytes; full backend proof plus staged 51 browser checks.
  Three simultaneous SwiftShader chat actors use DPR 0.5 (CSS sizes/privacy checks unchanged).
- Database lifecycle handles failed idle pool clients, preserves ownership fencing and coalesces
  shutdown drains; real DB replacement/ownership tests and full build checks passed.
- Startup recovery fb8bc5e: static HTML fallback, caught module errors, engine import after character
  choice. Six injected network-failure browser assertions passed 1BU62M. Login stays functional before
  the game module; reload returns the existing character. Explicit production build passes all-chunk
  debug guard. Engine-only codeSplitting group prevents preload helper pulling engine into login.
  Production enter helper now asserts no early engine request; actual production check still pending.
- Preparation mode 7b61de5 / merge 84a3465: `deploy-broken-odyssey.sh --candidate --prepare-only` builds
  and validates but exits before any live configuration/service/credential/DB/current mutation.
  Private functional fixtures pass fresh preparation, immutable reuse and invalid flags. No real
  candidate artifact prepared yet; no deployment authorized/performed.
- Active rendering source `/tmp/bo-static-world-batching`, branch `codex/static-world-batching`,
  candidate a973ae5 includes all main runtime changes through 84a3465. Static geometry batching per
  chunk/material reduces 532→165 meshes with identical 32,976 vertices / 96,942 indices / materials / textures.
  All 11 frontend tests, full format/types/lint and four production builds/debug guard now pass.
  No FPS claim. Initial browser driver picked first replicated NPC off-screen; nearest-NPC/ray-hit
  read-only diagnostics correct that, preserving failed runs. ZwXpKt also failed blank beforelogin.
- ACTIVE detached `/tmp/bo-final-render-candidate.sh`: code checks completed, now eight browser
  suites in order rendering,startup,trading,marketplace,social,friends,onboarding,guilds (78 assertions).
  Logs `/tmp/bo-final-render-browser.log`, exit `.exit`. If green, automatically runs unprofiled
  five-player 120s production --load; logs `/tmp/bo-final-render-load.log`, exit `.exit`.
  No other builds/tests/browsers during measured load. Do not edit running candidate runtime.
- Other worktrees performance/recovery/presentation/guilds/release-preparation are merged into main;
  retain until final integration. Main runtime and earned actors remain stopped/intact.

## Capacity remains a release blocker

Public password/TLS/WSS load includes real movement/combat/normal respawn, inventory/market,
friend messages/read receipts. Operator gear/spawn fixtures before admission are isolated load
setup, not earned-gameplay proof. Guild branch adds guild consent/message/history traffic and
restores declared strict19.5 Hz simulation, RTT p95<250ms, HTTP p95<500ms gates. Not yet measured.

Latest quiet profiled five-player 120s run 717Yig: 19.005Hz, RTT p95473ms, HTTP p95217ms, zero unexpected
protocol/HTTP errors/disconnects, all 5 alive, four respawns/eight kills, 195 economy writes, five sales,
65 DM / 60 read receipts. FAIL. Prior quiet GYaFFV 18.80 Hz / 181ms also FAIL. No safe capacity established.
Unused local servers stopped; no browsers/builds/tests during measurement. Profile mostly idle;
host 82–88% idle last samples, no CPU/RAM saturation. Prior docs cover scheduler/timer and durable
checkpoint I/O tails. Do not weaken WAL/fencing/publication or raise admission to make graphs pass.
Evidence `docs/hardening/evidence/capacity-2026-10-24` and checkpoint encoding archive.

## Next actions

1. Finish a973ae5 browser qualification, inspect screenshots, fix real issues and preserve failures.
   Its queued production workload must prove deferred engine login,28 friends/guild UI checks and
   strict guild/commerce/combat load. If five players fail, do not raise admission or test 20.
2. Archive results, commit evidence on rendering branch and merge into main preserving append-only
   PROGRESS/DECISIONS and main's newer archive/handoff. Push and confirm final hosted CI.
3. Prepare final committed candidate with --candidate --prepare-only, verify release manifest and
   unchanged live 2c47b27/current/PIDs/readiness. Never invoke publishing mode without authorization.
4. Capacity, physical-phone performance and off-host recovery remain unqualified. No purchase,
   public deployment, reset, durability weakening or architecture rewrite to bypass these limits.
   Authoritative wear/repair and broader world art remain long-term incomplete; core requested
   Warrior/Mage earned gameplay paths are genuinely verified. Maintain honest current release gates.
