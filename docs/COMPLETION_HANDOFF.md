# Broken Odyssey completion handoff

Updated 2026-10-24 by Codex. The owner authorizes sustained completion across milestones, without
routine confirmations. Read AGENTS, MASTER_PLAN, PROGRESS and DECISIONS. The persistent goal is
active. Do not declare shippability from feature existence or unit tests alone.

## Source and safety boundaries

- Editable source: `/root/browser-mmo`, branch `codex/shippable-completion`, origin
  `git@github.com:stuart3190/browser-mmo.git`. Current HEAD 28b1483 integrates presentation. Pushed checkpoint c0a47f1 includes capacity
  gates and staged earned proof; merge and later corrections still need pushing.
- Live source was recovered from `2c47b27`. `/srv/brokenodyssey/current` is immutable: never edit it.
  Production ports: PostgreSQL 55440, API 4461, realtime 4462, web 4460. No production mutations or
  deployments in this completion effort. Unsafe public deployment requires explicit permission.
- Own disposable PostgreSQL 17: port 55441, `/tmp/brokenodyssey-completion-pg`, socket directory
  `/tmp/brokenodyssey-completion-socket`; databases bo_completion_dev/test/upgrade. Private ignored
  `.env` uses only this cluster. Own compatibility container `bo-qualification-pg16` is stopped.
- Local API 4471/realtime 4472/Vite 5180. Browser URL `http://localhost:5180` for CORS. Watcher logs
  `/tmp/bo-completion-{api,realtime,web}.log`; API/web sessions 10068/67940. Realtime process exited
  during service checks and was restarted detached at 11:48 UTC; its current log is
  `/tmp/bo-completion-realtime-restart.log`. Readiness restored 25 zones and retained actor data.
- Playwright `/opt/aria-browser/node_modules/playwright`, Chrome `/usr/bin/google-chrome`.
  Drivers importing source TS run through `pnpm exec tsx`. Game-playtest skill already read.

## Verified implementation and checkpoints

- `5b546e9`: atomic revisioned direct trading (migration 0022), mutual consent, UI, ten domain tests.
- `0679fc7`: Nearby/Zone/Party chat with server range, membership and rate authority.
- `c011828`: marketplace UI and account-wide listing admission serialization.
- `2c1b509`, `b6f47c5`: contiguous populated historical upgrade fixtures and matching-major
  PostgreSQL backup/restore tooling. Real PG 16 and 17 round trips pass; mismatch is refused.
- `1561e42`: persistent account friends/DM (migration 0023), consent/blocking, durable retry/rate/read
  state and responsive UI. Eight domain, one HTTP and twelve real browser checks. Also fixes a
  sync test waiting for an old pre-sale wallet notification.
- Fixed `1561e42` full qualification PASSED: format/lint/types, 234 unit, 109 domain / 73 realtime / 11 API
  integration tests, four builds/debug guard, assets/content, 16-table populated upgrade/restore,
  39 browser assertions. Archive `docs/hardening/evidence/social-qualification-2026-10-24`.
- Hosted CI 40086526089 and 40088506420 succeeded. Job logs are 403-restricted; metadata is readable.
- `c2478f7`: `bash scripts/qualify-local.sh --production` creates its own database/password users,
  builds and serves through loopback HTTPS/WSS, confirms dev-login/private-route denial and runs
  thirteen actual UI assertions without `__mmo`. Archive `production-local-2026-10-24` under the
  hardening evidence directory. Own processes clean up; no private passwords/keys archived.

## Active earned journeys — preserve these actors

All progression uses ordinary movement, combat and visible UI; no grants, teleports or synthetic
XP. Read-only development observations assist the driver. Staged resumes are NOT a clean single run.

- Warrior user `finishwar_mvm9azse`, Mage user `finishmage_mvm9ku7m`: both level 5 with 17 completed,
  paid quests. Read-only DB evidence and staged logs/screenshots are archived in
  `docs/gameplay/evidence/earned-classes-2026-10-24`.
- Both story browsers are now closed. Mage final stage `/tmp/bo-earned-mage-recovery`; Warrior
  `/tmp/bo-earned-warrior-services-resume`. Both collected their Sword craft, then failed the next
  NPC interaction after the local realtime process exited. Preserve these failure records.
- Restarted realtime is ready. Latest greenvale-complete driver supports SERVICES_ONLY resumes:
  it reuses an existing pending/completed Sword job via real UI and skips already-carried materials.
  Final continuations `/tmp/bo-earned-{warrior,mage}-services-final` both PASS eight assertions;
  reports/screenshots archived. Profession/solo/mixed-party controller is now active at
  `/tmp/bo-earned-systems-resume`, log of the same name plus `.log`. First controller stopped on
  an invalid test assumption that the five-second craft was still counting down. Resumed Warrior
  profession stage PASS five assertions. That controller later failed solo: go() called close(),
  whose Escape cleared target before every cast, causing NO_TARGET spam and death.
- Latest controller `/tmp/bo-earned-vault-resume` starts at warrior-solo-vault. Uncommitted fixes
  preserve targeting, assert Tab selection, bound ability clicks and use normal initial respawn.
  First guardian defeated and reconnect verified in the same UUID 01a16dcf-f42f-7376-8e59-170e92baf8f0;
  intentional death/remaining encounters next. It then runs Mage professions/staff/solo and mixed
  party. Preserve `/tmp/bo-earned-systems-resume/warrior-solo-vault/failure.json` as failed evidence.
- Earlier stage evidence: `/tmp/bo-earned-warrior{,-resume,-resume2}` and
  `/tmp/bo-earned-mage{,-resume,-marches}`. Warrior harness failures: tree route, invalid level-two
  ring equip attempt, fixed route timeout on kilometre trips. Mage died at Warden while stationary,
  then won using visible-warning dodges; later died returning through a guardian and resumed via
  normal respawn. Earned state was kept; no gameplay nerfs to make automation pass.
- Current uncommitted drivers generalize both classes, equip only owned eligible rewards, dodge
  ground cues, bound routes by distance and detect blocked movement. Automatic three-attempt quest
  death recovery was added after current runs started, so is not yet verified.
- After story+five sides/craft/vendor/bank/relog, run `greenvale-systems.cjs` with SYSTEMS_USER and
  modes professions/solo, then mixed party using SYSTEMS_PARTY_USER. Mage staff recipe is
  `service.greenvale.craft_staff`; normal profession recipe `service.greenvale.craft_remedy`.
  Avoid fresh-create flags for existing actors. `earned-journeys.cjs` orchestrator is not yet proven.
- Avoid runtime source changes/restarts while earned runs are active. Script/docs edits are safe.

## Presentation integration and current qualification

Inventory silhouettes, equipment requirement hints, class onboarding/ability icons and panel
layering are integrated in main at merge `28b1483`. Source branch `/tmp/bo-presentation-polish`
is clean at 6935376. Its own Vite 5182 preview can be stopped when no longer needed.

- Inventory: eleven trade/inventory browser checks; types/lint/frontend tests/builds pass.
- Onboarding: seven original checks, now ten including desktop/portrait/landscape Skills hit-tests.
- Panel layering: screenshot review caught ability controls over Skills; explicit panel/detail/
  tooltip/death layers fix hit ownership. Ten onboarding and eleven trade checks pass; game build
  and script/format checks pass. Evidence `panel-layering-2026-10-24`.
- Merged main passes full types/lint. Hosted CI 40092678899 for c0a47f1 PASSED (pre-merge checkpoint).
- Frozen `/tmp/bo-qualification-source-57cd2e2` full qualifier is active, logs
  `/tmp/bo-combined-qualified.log`, artifacts `/tmp/brokenodyssey-qualification.N0emuY`.
  Aggregate checks/build/restore/assets passed; trade 11, market 8, chat 10 passed; friends/onboarding
  remain. This snapshot contains original onboarding (48 assertions), not the later layering fix.
- Main's default qualifier now includes 51 assertions. Run merged production TLS/password smoke
  and appropriate combined checks after all edits; no public deployment.

## Capacity work in progress

Committed `--load` qualifier option runs production TLS/password smoke then production-load.ts
against its own database. Extended workload includes friends/DM/read receipts alongside movement,
combat, inventory moves and market sales. Load fixtures grant gear and set spawn positions only
before admission in the disposable database; they are not earned-gameplay proof.

The first five-player 120-second run failed performance gates: 17.99 Hz and 704 ms p95 RTT,
with no protocol/HTTP errors or disconnects. Two software-rendered journeys used about eight cores;
contention is suspected, not established. Evidence `docs/hardening/evidence/capacity-2026-10-24`.
Second run also failed: 19.02 Hz but 324 ms p95 RTT. Both workloads completed without operation
errors. Quiet-host third run `/tmp/brokenodyssey-qualification.GYaFFV` failed cadence 18.80 Hz; p95 RTT 181 ms
passed. Five normal respawns and all economy/social actions succeeded. Two normal TARGET_DEAD
races are now reported separately, all other protocol errors still fail. Optional QUAL_CPU_PROFILE=1
collects a private realtime profile. Diagnose cadence/I/O; do not claim capacity green.
Script types/lint and shell syntax pass. Only increase bounded local load after proof passes.
No live admission limits changed.

## Next work and honest limits

1. Diagnose capacity cadence: optional QUAL_CPU_PROFILE=1 on isolated --load. Keep diagnostic
   results separate from quiet qualification. Full current UI smoke/profile can share this run.
   Avoid extra browser workloads during a measurement intended as a capacity gate.
2. Finish both earned stories, professions, solo and mixed-class private Vault, including persistence,
   reconnect, normal death/recovery and instance reset. Preserve and document all failures.
3. Finish frozen qualification, archive results, then verify merged production profile and push
   verified merge/fixes. Main has only two uncommitted journey driver files at last check.
4. Continue real remaining gaps: guilds, authoritative wear/repair and outer-region content/polish.
   World visuals remain largely procedural/greybox. Physical phone testing, off-host recovery and
   public release are not qualified. Do not claim complete game shippability.
5. Keep this handoff concise/current, PROGRESS honest and incremental verified commits pushed.

## Latest checkpoint (supersedes active statuses above)

Frozen 57cd2e2 full run finished successfully: 48 browser assertions plus full tests/build/restore.
Warrior solo Vault finished successfully, original UUID 01a16dcf-f42f-7376-8e59-170e92baf8f0;
proof/screenshot archive in earned-classes evidence. Mage remedy/staff stages pass.
Controller `/tmp/bo-earned-vault-resume.log` is now on Mage solo, then mixed-class party. Keep
both existing earned users; no grants/reset/restart of their story. Main realtime is detached,
log `/tmp/bo-completion-realtime-restart.log` (old session IDs no longer valid).

Integrated production attempt Pxgwmo failed phone fetch (desktop succeeded); repeat EY27et
passes all 13 production browser assertions and is now measuring five actors/60 seconds with
CPU profiling. Sanitized request diagnostics added to friends.cjs. First failure is retained.
Capacity optimizer worktree `/tmp/bo-checkpoint-performance`, branch codex/checkpoint-performance,
is experimenting with schema-specific version-2 checkpoint encoding, preserving original JSON.
It must pass compatibility tests, world/realtime recovery tests and fresh load before integration.
Do not mutate main runtime while earned runs are active. No deployment authorized/performed.
