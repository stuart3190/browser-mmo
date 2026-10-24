# Broken Odyssey completion handoff

Updated 2026-10-24 by Codex. The owner authorizes sustained completion across milestones, without
routine confirmations. Read AGENTS, MASTER_PLAN, PROGRESS and DECISIONS. The persistent goal is
active. Do not declare shippability from feature existence or unit tests alone.

## Source and safety boundaries

- Editable source: `/root/browser-mmo`, branch `codex/shippable-completion`, origin
  `git@github.com:stuart3190/browser-mmo.git`. Latest implementation checkpoint: `c2478f7`; subsequent evidence commits are in git log.
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
  profession stage now PASS five assertions; solo Vault traversal active.
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

## Separately verified presentation branch — awaiting integration

`/tmp/bo-presentation-polish`, branch `codex/presentation-polish`, based on 1561e42; clean at last check.
Own Vite 5182/session 2759 serves a guarded loopback asset preview, so main journeys remain unchanged.

- `ba27b32`: 37 item silhouettes, equipment eligibility hints/disabled invalid Equip; eleven browser
  checks, types/lint/frontend tests/four builds pass. Evidence inventory-presentation-2026-10-24.
- `f9b3fb4`: consistent Broken Odyssey onboarding, labeled class choice with combat descriptions,
  responsive forms, pending controls and five ability icons. Seven browser checks and
  types/lint/four builds pass. Evidence onboarding-2026-10-24.
- Branch now also merges c2478f7 and adds onboarding to qualification at 57cd2e2. A detached
  snapshot `/tmp/bo-qualification-source-57cd2e2` is now running full qualification; outer log
  `/tmp/bo-combined-qualified.log`. Do not mutate this snapshot.
  Integrate this branch after committing main work. Preserve PROGRESS additions when
  resolving conflicts. Main's uncommitted vertical-slice blocked-walk change is also in f9b3fb4.
  Onboarding is included (48 assertions at57cd2e2). New uncommitted panel layering fix in the
  presentation worktree addresses Skills being covered by ability buttons; strengthened onboarding
  browser run `/tmp/bo-panel-layer-proof{,.log}` is active. Qualify before committing this fix.

## Capacity work in progress

Uncommitted `--load` qualifier option runs production TLS/password smoke then production-load.ts
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

1. Finish and inspect the capacity run, fix failures, archive evidence and commit verified ops work.
2. Finish both earned stories, professions, solo and mixed-class private Vault, including persistence,
   reconnect, normal death/recovery and instance reset. Preserve and document all failures.
3. Integrate presentation commits, qualify a frozen combined source, rerun built production profile.
4. Continue real remaining gaps: guilds, authoritative wear/repair and outer-region content/polish.
   World visuals remain largely procedural/greybox. Physical phone testing, off-host recovery and
   public release are not qualified. Do not claim complete game shippability.
5. Keep this handoff concise/current, PROGRESS honest and incremental verified commits pushed.
