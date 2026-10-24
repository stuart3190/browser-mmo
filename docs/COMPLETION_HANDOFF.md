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

## Final integrated candidate

Main69c9483 integrates every implementation branch, including renderinga973ae5. Later changes are
proof/checklist documentation only. Hosted CI40100303234 for84a3465 passed; final runtime CI40101349993
for69c9483 is still pending at this checkpoint. No other coding branch needs integration.

-35ee149 backend proof OanPjT:236unit,117domain,75RT,12HTTP, fullformat/lint/types/four builds,
assets/content and20-table populated upgrade/restore pass. First browser entry failed blank;
retained evidence in `docs/hardening/evidence/integrated-guilds-2026-10-24`.

- Rendering adds one frontend geometry test (237 total unit tests). Fullformat/types/lint,11 frontend
  tests/four builds/all-chunk debug guard and release-preparation fixture pass.
- **All78 browser assertions pass together in vag71f**: rendering6,startup6,trade11,market8,chat10,
  friends12,onboarding10,guilds15. Archive `docs/hardening/evidence/final-browser-2026-10-24`.
- **All28 built-production TLS/password browser assertions pass in qWvlw8**:13friends+15guilds.
  Login does not request the3D engine early; debug/dev authentication/private-route checks pass.
  Archive `docs/hardening/evidence/final-production-2026-10-24`.
- Final unprofiled five-player load FAILED cadence (see below). All controllers have exited.
- Static batching reduces532→165 meshes preserving all32,976vertices/96,942indices; screenshots,
  actual NPC pick/touch controls and cleanup verified. No physical-device FPS claim.
- Startup explicitly recovers failed entry/application/game imports; no hidden retries. All lazy
  chunks are checked for development hooks. Initial off-screen NPC driver and blank-page failures
  remain preserved; nearest visible NPC/ray diagnostics are read-only and absent in release.
- `deploy-broken-odyssey.sh --candidate --prepare-only` builds/validates an immutable candidate,
  exits before any live mutation. Functional fixture proves fresh/reused build, no credential read,
  no service/current mutation and invalid-flag refusal. Real preparation is the next authorized step.
- Old isolated worktrees remain for evidence: static-world-batching,guilds,performance,recovery,
  presentation,release-preparation. Their implemented changes are all merged. Do not edit releases.

## Remaining release blocker and next actions

Latest quiet **unprofiled** five-player120s qWvlw8:19.123Hz (FAIL ≥19.5Hz), RTT p95162ms and HTTP p95
231.8ms (both PASS). Zero unexpected protocol/HTTP errors/disconnects, all5alive, five respawns,
eight durable kills,194inventory writes/five sales,64DM/60read receipts,64guild messages/194history
reads. CPU0.296cores,RSS183.6MB. No other browser/build/test ran during measurement. Raw report
`/tmp/brokenodyssey-qualification.qWvlw8/production/load.json` remains `ok:false`.

Earlier quiet runs also fail cadence. Prior timer-only kernel scheduling and durable WAL-tail
measurements are documented; no justification for fake catch-up ticks, disabled WAL, rewritten
authority, increased admission or another identical empty rerun. No safe player capacity established.

Owner was asked asynchronously for an existing staging host/SSH target and off-host backup destination.
No answer yet. Physical-phone testing is also pending. This is the first explicit waiting checkpoint;
keep the external-blocker audit honest. Goal is ACTIVE, not complete. Avoid unrelated feature work or
empty loops while waiting; finish the concrete release artifact/verification/documentation first.

1. Prepare final committed candidate with --candidate --prepare-only AFTER all load jobs exit.
   Verify manifest and unchanged live2c47b27/current, PIDs and API/RT readiness. Never publish without
   authorization; no new purchase or production reset.
2. Verify CI40101349993, archive preparation evidence, push final documentation and update this handoff.
3. If the owner supplies existing staging/backup access, run capacity/recovery qualification there,
   retaining the strict19.5Hz/<250msRTT/<500msHTTP gates. Do not raise public admission prematurely.
4. Wear/repair, guild vault, extra classes/specialisations and broader world art remain long-term
   incomplete. The requested core earned Warrior/Mage gameplay paths are verified; release remains
   blocked on measured capacity and external validation, not declared shippable.
