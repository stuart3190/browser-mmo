# Broken Odyssey completion handoff

Updated 2026-10-24 by Codex. Owner authorizes sustained completion across milestones without routine
confirmation. Read AGENTS, MASTER_PLAN, PROGRESS and DECISIONS. Persistent goal remains active.
Do not declare shippability from feature existence or unit tests alone.

## Source and operational boundaries

- Editable repository `/root/browser-mmo`, branch `codex/shippable-completion`, origin
  `git@github.com:stuart3190/browser-mmo.git`. Main now integrates database lifecycle d85cb09 and
  checkpoint encoding 843919d plus its follow-up abf3f2e. Guild integration is next.
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

- Frozen57cd2e2 full qualifier N0emuY passed 234unit,109domain,73RT,11HTTP, format/lint/types,
  four builds/debug guard, assets/content,16-table populated upgrade/restore,48browser assertions.
- Checkpoint843919d full backend qualifier05XEXU passed 236unit,109domain,73RT,11HTTP and same
  build/restore gates. Trade11/market8 passed; third chat browser timed out. Diagnostics showed
  31s before game WS,126ms auth. DPR0.5 for the three simultaneous worlds, unchanged CSS viewports
  and gameplay checks: DGERJ8 passed chat10/friends12/onboarding10. This is staged proof.
  Evidence `docs/hardening/evidence/checkpoint-encoding-2026-10-24`.
- Database lifecycle d85cb09: real idle connection termination/recovery and coalesced close tests,
  existing five ownership/crash tests, full types/lint/four builds all pass. Merged main.
- Guild source `/tmp/bo-persistent-guilds`, branch `codex/persistent-guilds`, base b75ac7e:
  migration0024, permissioned character guilds, consent, officers/leader, durable chat, transfer,
  removal/disband, stale-guild binding and responsive UI. Eight domain+one HTTP tests, full
  types/lint/four builds,20-table populated upgrade/restore passed. Final layout oHpLwU passes15
  real browser assertions (follow-latest, preserved scrollback, visible landscape composer).
  Latest layout/workload refinements await commit/integration. Guild vault remains unfinished.
- Performance source `/tmp/bo-checkpoint-performance` abf3f2e is merged. Exact v2 checkpoint JSON
  preserved and compatibility-tested over26zones/live combat; relative463ms→169ms benchmark
  is NOT capacity certification. Focused QUAL_BROWSER_SUITES selector must survive guild merge.
- Recovery source `/tmp/bo-database-recovery` d85cb09 is merged. Old presentation worktree also merged.
- Hosted CI40095786743/40094260701 failed only formatting of six evidence JSON files; corrected
  f4ceb55 and full local format check passes. Last known green40092678899/c0a47f1. Verify newer CI.

## Capacity remains a release blocker

Public password/TLS/WSS load includes real movement/combat/normal respawn, inventory/market,
friend messages/read receipts. Operator gear/spawn fixtures before admission are isolated load
setup, not earned-gameplay proof. Guild branch adds guild consent/message/history traffic and
restores declared strict19.5Hz simulation, RTTp95<250ms, HTTPp95<500ms gates. Not yet measured.

Latest quiet profiled five-player120s run717Yig: 19.005Hz, RTTp95473ms, HTTPp95217ms, zero unexpected
protocol/HTTP errors/disconnects, all5alive, four respawns/eight kills,195economy writes, five sales,
65DM/60read receipts. FAIL. Prior quiet GYaFFV18.80Hz/181ms also FAIL. No safe capacity established.
Unused local servers stopped; no browsers/builds/tests during measurement. Profile mostly idle;
host82–88%idle last samples, no CPU/RAM saturation. Prior docs cover scheduler/timer and durable
checkpoint I/O tails. Do not weaken WAL/fencing/publication or raise admission to make graphs pass.
Evidence `docs/hardening/evidence/capacity-2026-10-24` and checkpoint encoding archive.

## Next actions

1. Finish guild refinement checks/commit, merge preserving both append-only ADR/progress histories
   and qualifier selector + guild mode. Run combined full qualifier (expected66 browser assertions),
   20-table restore, production TLS/password profile (13friends+15guild). Push and confirm hosted CI.
2. Run quiet **unprofiled** merged five-player120s load with guild traffic. No concurrent tests,
   builds or browsers during measurement. If five fails, do not claim or test increased admission.
3. Continue substantive gaps: authoritative durability/wear/repair (see greenvale-systems rationale),
   outer-region/dungeon visual polish and frontend performance. Inspect existing systems first.
4. Physical-phone performance, off-host recovery and public release remain unqualified. No purchase,
   public deployment, reset or rewrite to bypass those limits. Keep evidence and handoff current.
