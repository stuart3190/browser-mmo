# Isolated local release qualification

Use a committed source snapshot with locked dependencies installed. These scripts never read the
production environment file or attach to an existing database. They create disposable loopback
PostgreSQL clusters, allocate separate ports and stop only their own processes on exit. Evidence
paths print at completion and retain logs/screenshots for investigation.

```sh
pnpm install --frozen-lockfile
bash scripts/qualify-local.sh
bash scripts/qualify-local.sh --production
LOAD_PLAYERS=5 LOAD_SECONDS=120 bash scripts/qualify-local.sh --load
```

The default command runs format/lint/types/unit/integration/build, populated upgrade/restore,
asset/content validation and trade/marketplace/chat/friends/onboarding/guild browser suites. `--skip-checks` runs
only the development browser suites; it is not a full release gate.

`--production` runs an additional built-bundle HTTPS/password-auth browser profile. It provisions
only disposable accounts; both characters are created through the UI. It verifies development
login and public administrative/metrics routes are unavailable, and the client has no development
observation hook. Its self-signed localhost certificate is a local fixture, not public TLS proof.

`--load` adds a bounded concurrent public HTTP/WSS workload after the production browser smoke.
It uses operator-created equipment/spawn fixtures in its disposable database, not earned actors.
It exercises combat, inventory moves, marketplace sales, friendship consent, direct messages and
read receipts, guild consent/chat/history, and checks latency, simulation cadence, operation counts and errors. LOAD_PLAYERS
is 2..20 and LOAD_SECONDS is 30..600; defaults are 5 and 120. Run on a quiet host and retain failed
reports. The cadence gate is at least 19.5 Hz, matching the prior declared release gate; RTT p95
must stay below 250 ms and HTTP p95 below 500 ms. A passing local sample does not establish public capacity or authorize admission changes.

Requirements: Node 22, pnpm 10, PostgreSQL server/client tools (`PG_BIN`, default 17 Linux path),
Chromium (`CHROME_PATH` for the main suites), Playwright (`PLAYWRIGHT_PATH`), setsid, curl and
Python 3. The production profile also needs OpenSSL and Caddy (`CADDY_BIN`, default host binary
/usr/local/bin/brokenodyssey-caddy). No package or service is purchased/provisioned externally.

Private temporary production proof directories contain generated test passwords and TLS keys.
Archive only result/gate/browser JSON, reviewed screenshots and non-secret explanatory notes.
Do not publish database archives, environment files, passwords or keys as evidence.

Long earned class/story/profession/dungeon journeys are separate active qualification work in
scripts/e2e/earned-journeys.cjs. They use actual movement and UI, without grants or XP injection.
They must pass before claiming that gameplay path complete; a green short smoke is insufficient.

`--guilds` is a focused guild UI check, not aggregate qualification. Production smoke now also
forms a guild using its existing password-authenticated actors and verifies membership/chat/roles
and disband through the UI. Public workload setup respects the guild action limiter before timing.
