# Broken Odyssey completion handoff

Updated 2026-10-24 by Codex. Owner authorizes sustained end-to-end completion. Continue across
milestones; do not stop at feature existence or unit tests. Preserve working architecture/data/uptime.
Read MASTER_PLAN, PROGRESS, DECISIONS and AGENTS before changes.

## Source and boundaries

- Editable `/root/browser-mmo`, branch `codex/shippable-completion`, origin GitHub stuart3190/browser-mmo.
- Deployed/main source recovered at `2c47b27`; `/srv/brokenodyssey/current` is immutable. Never edit it.
- Production PostgreSQL **55440**, API4461/RT4462/web4460. No production mutation/deployment performed.
- Own disposable PostgreSQL **55441**, `/tmp/brokenodyssey-completion-pg`, socket
  `/tmp/brokenodyssey-completion-socket`; bo_completion_dev/test/upgrade. Ignored private .env.
- Local API4471, realtime4472, Vite5180. Browser uses http://localhost:5180 (CORS).
  Watcher logs `/tmp/bo-completion-{api,realtime,web}.log`; realtime session97951, API60128, web67750.
- Own disposable Docker PG16 `bo-qualification-pg16`, loopback55442; stop only this container when done.
- No unsafe public deployment without explicit permission; prepare verified concrete release first.

## Verified checkpoints

- `776b202` source recovery; `2969503` collision-free domain fixture names.
- `5b546e9` durable revisioned direct trading, 10 domain + HTTP + 9 real browser checks.
- `0679fc7` Nearby/Zone/Party chat, authoritative membership/range/rate, 10 browser checks.
- `c011828` marketplace sell/review/buy/cancel/history, account admission race fix, 8 browser checks.
- `2c1b509` contiguous populated migration/restore fixtures. Fixed snapshot full qualification PASSED
  in `/tmp/bo-qualification-source-2c1b509`, evidence `/tmp/brokenodyssey-qualification.cajvdL`:
  full format/lint/types/unit/integration/build/restore/assets/content + 27 browser assertions.
- `b6f47c5` PostgreSQL backup clients match server major. Real 16/16 and17/17 restore pass, mismatch
  refusal verified. CI40085842883 then failed a realtime test (not backup); annotations identify
  queued pre-sale wallet notification. Test now waits for expected transaction balance.
- Friends/DM milestone ready to commit: additive0023, canonical consent/block model, persistent
  sender/read/rate/idempotency authority, responsive UI, 8 domain +1 API +12 browser checks;
  format/lint/types/build, populated0022->0023 preservation and16-table restore passed.
  Evidence `docs/gameplay/evidence/friends-2026-10-24`. Guilds remain unfinished.

## Active work and immediate next tasks

1. Sync focused run passed all eleven tests (`/tmp/bo-sync-ci-timing.log`); commit social milestone
   and test timing correction with proof. Push branch, inspect CI annotations (full logs403).
2. Run full qualifier on a new detached committed snapshot. `scripts/qualify-local.sh` creates its
   own cluster/services, full aggregate/restore and four browser suites, cleans only its processes.
   Use fixed snapshot while implementation continues; do not mutate it during qualification.
3. Fresh earned Warrior journey currently running, session66155, log `/tmp/bo-earned-warrior.log`,
   output `/tmp/bo-earned-warrior`, username `finishwar_mvm9azse`. Started with GREENVALE_CREATE=1,
   GREENVALE_FULL=1,GREENVALE_SIDE=1, WEB_URL=http://localhost:5180 and PLAYWRIGHT_PATH.
   First combat quest passed. Driver `scripts/e2e/greenvale-complete.cjs` walks real inputs; no grants.
   Avoid runtime-source edits while this run is active (watchers restart). Script/docs/test edits safe.
4. Generalize driver for earned Mage; complete main+side arc, professions, solo/party Broken Vault
   via `greenvale-systems.cjs` using earned characters. Fix actual combat/route/UI failures. Existing
   abilities.cjs injects level/gear and is not earned progression proof.
5. Continue polish/onboarding/balance, coherent durability/repair if implemented, real gaps and ops.
   Most outer regions are greyboxes; no full-game shippability claim. Physical phones, capacity,
   off-host recovery and public deployment remain unqualified. Keep honest checklist/evidence.

Browser workflow skill read: game-studio/game-playtest. Playwright available at
/opt/aria-browser/node_modules/playwright, Chrome /usr/bin/google-chrome. Use screenshots and actual
UI input; read-only dev __mmo observations are not progression writes. `pnpm exec tsx` for scripts
importing source TS. The durable goal remains active; no token budget or stop authorization.
