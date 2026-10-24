# Broken Odyssey completion handoff

Updated 2026-10-24 by Codex. The owner authorizes sustained completion without routine confirmation.
Read AGENTS, MASTER_PLAN, PROGRESS and DECISIONS. The goal remains ACTIVE and is not achieved:
core gameplay is verified, but the release has failed its capacity gate and needs external validation.

## Source and live safety boundaries

- Editable `/root/browser-mmo`, branch `codex/shippable-completion`, origin
  `git@github.com:stuart3190/browser-mmo.git`. All implementation branches are merged.
- Final runtime merge: `69c9483514839b82c7a8ee939bd27a48ec6ad84c`. Hosted CI **40101349993 PASSED**.
  Subsequent commits contain proof/checklist/handoff documentation only.
- Prepared immutable candidate: `/srv/brokenodyssey/releases/f64d084522f6f079af753f6c1dc5c57a2d3189d7`.
  Four production builds, all-chunk debug guard and Caddy validation pass. Manifest and bundle
  checksums are in `docs/hardening/evidence/final-production-2026-10-24/preparation.json`.
- Live `/srv/brokenodyssey/current` STILL points to `2c47b27a38f0bc74f3a7192f713775c3a9361729`.
  Preparation did not change service PIDs/start times or `current`; API/RT readiness pass, 25 zones.
  Production ports: API4461, RT4462, web4460, PostgreSQL55440. NEVER edit immutable releases.
- No public deployment, production DB mutation/reset, admission increase or purchase occurred.
  The preparation command exits before reading runtime credentials or modifying live configuration.
  Unsafe public deployment needs explicit permission; failed capacity does not justify publishing.

## Own data and tooling

- Own PostgreSQL17: port55441, data `/tmp/brokenodyssey-completion-pg`, socket
  `/tmp/brokenodyssey-completion-socket`. Private ignored `.env` points only to own databases.
- Preserve `bo_completion_dev` and its earned actors. `bo_completion_test`, `bo_guilds_test` and
  `bo_recovery_test` are disposable test databases, never production or earned data.
- Own API4471/RT4472/Vite5180 and presentation5182 are intentionally STOPPED. All gameplay and
  qualification controllers have exited. Compatibility container bo-qualification-pg16 is stopped.
- Qualifiers create their own loopback PostgreSQL clusters and clean up only their own processes.
  Retained production fixture directories contain private passwords/keys: archive proof only.
- Playwright `/opt/aria-browser/node_modules/playwright`, Chrome `/usr/bin/google-chrome`.
  Use `pnpm exec tsx` for CJS drivers importing TS. Game-playtest skill was read and used.
- Use detached setsid jobs/logs for long checks; foreground tool sessions sometimes died around90s.
  Explicit `NODE_ENV=production` is required for release builds when local `.env` says development.

## Verified requested gameplay

Both preserved earned users, Warrior `finishwar_mvm9azse` and Mage `finishmage_mvm9ku7m`, reached
level5 and completed/received17 quests (12 main/five side), crafting/vendor/bank/discovery/relogin
continuations and professions. No grants, teleports or injected progression. These are staged
resumes, not one uninterrupted orchestrator run. Earlier failures are retained.

Warrior solo, Mage solo continuation and mixed touch party each finished guardians/Bell Keeper,
same-instance reconnect, completion/relogin, exit/reset. Independent DB evidence confirms all three
original runs and all four rewarded member records:

- Warrior: `01a16dcf-f42f-7376-8e59-170e92baf8f0`.
- Mage: `01a16de4-813b-741c-af96-3193a40c1723`.
- Mixed: `01a16de9-5e7a-7897-a43f-6abf27c017db`.

Evidence: `docs/gameplay/evidence/earned-classes-2026-10-24`. Core authority, persistence,
inventory/equipment, XP/loot, quests, world regions and existing combat architecture were preserved.
New direct trade, marketplace UI, nearby/zone/party chat, friends/DM, persistent guilds/chat and
responsive inventory/onboarding are integrated. Guilds use additive migration0024.

## Final verification

- Integrated35ee149 local OanPjT: format/lint/types,236 unit,117 domain,75 realtime,12 HTTP tests,
  four builds/debug guard, assets/content and20-table populated upgrade/restore passed. First
  browser entry failed blank; preserved in integrated-guilds evidence, with no invented cause.
- Rendering adds one geometry test; all11 frontend tests, fullformat/types/lint and four builds
  pass. Final runtime CI69c9483 is green. Database/domain/recovery code is unchanged from OanPjT.
- **All78 browser assertions pass together in vag71f**: rendering6, startup6, trade11, market8,
  chat10, friends12, onboarding10, guilds15. Archive: `hardening/evidence/final-browser-2026-10-24`.
- **All28 built-production TLS/password assertions pass in qWvlw8**: friends13 + guilds15.
  Every login also checks that the3D engine is not requested before the form. No development hook,
  dev authentication or public private-route access. Archive: `hardening/evidence/final-production-2026-10-24`.
- Static batching reduces532→165 world meshes with unchanged32,976vertices/96,942indices/materials/
  textures. Geometry/cleanup, actual NPC picking and touch movement pass; screenshots reviewed.
  Live actors add their own meshes. No physical-device FPS claim.
- Startup has static HTML/reload fallback and catches failed application/game imports. Six injected
  failure checks recover the saved character through explicit reload. No hidden automatic retries.
- `scripts/qualification/release-preparation.cjs` verifies fresh/reused preparation, invalid flags,
  no runtime-credential read, and no live configuration/service/current mutation. Real preparation
  also passed and independently preserved live identity/readiness. Do not publish the candidate.

## Active follow-up — idle checkpoint encoding

The external-wait checkpoint below is superseded by useful independent work. A fresh60s timer-only
control reached19.7996Hz (11skipped slots,p9978.106ms,max207.993ms). Hardware alone is not established
as the cause of the workload failure. Active branch `codex/idle-checkpoint-cache` in
`/tmp/bo-idle-checkpoint-cache`, based on618369c, conservatively reuses untouched idle simulation
images and identical empty outer payloads. Full isolated run `lk7ghT` passed 241 unit + 204 integration tests, four builds, populated
backup/restore, assets/content and all 78 browser assertions. Built production `XMQkkz` passes 28 browser assertions but FAILS capacity: 19.2906 Hz, RTT p95
395 ms, HTTP p95 177.6 ms, tick p95 9.75 ms, checkpoint p95 208.65 ms, CPU 0.165 cores. No unexpected
errors/disconnects. Runtime `9567e0e` passes hosted CI `40104670712`. Proof is archived under
`hardening/evidence/idle-checkpoint-cache-2026-10-24`. The code improvement is verified; capacity is not. Do not edit existing release artifacts or repeat load tests without this concrete change.

## Remaining release gates — external input requested

Previous quiet **unprofiled** five-player120s qWvlw8 FAILS cadence: **19.123Hz versus required19.5Hz**.
RTT p95162ms and HTTP p95231.8ms PASS. Zero unexpected protocol/HTTP errors/disconnects, all5alive,
five normal respawn requests/eight durable rewarded kills,194 inventory writes/five sales,
64 direct messages/60 read receipts,64 guild messages/194 history reads. CPU0.296cores,RSS183.6MB.
No other browser/build/test ran during measurement. Raw report remains `ok:false`.

Earlier quiet tests also failed cadence; prior timer-only scheduling and durable WAL-tail evidence
is documented. Do not fake catch-up ticks, weaken WAL/authority, raise admission or run another
identical load without a concrete reason. This host has no established safe player capacity.

The owner was asked asynchronously for an **existing staging host/SSH target and off-host backup
destination**. No answer has arrived. Physical-phone performance testing is also pending. This is
the first explicit waiting checkpoint in the external-blocker audit; goal remains ACTIVE, not
complete or paused. The encoding follow-up is now verified and still fails the release gates. Avoid empty rerun loops.

Next: use supplied existing infrastructure for strict capacity and recovery qualification, preserving
all production data. No new purchase is authorized. If input remains unavailable across consecutive
goal turns, follow the blocked-goal audit rule rather than claiming completion or inventing work.

Wear/repair, guild vault, additional classes/specialisations and broader world art remain long-term
incomplete. Checklist now reflects that accurately. They do not erase the verified core paths or
turn failed release qualification into shippability.
