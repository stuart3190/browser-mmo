# Isolated local release qualification

Use a committed source snapshot with locked dependencies installed. These scripts never read the
production environment file or attach to an existing database. They create disposable loopback
PostgreSQL clusters, allocate separate ports and stop only their own processes on exit. Evidence
paths print at completion and retain logs/screenshots for investigation.

```sh
pnpm install --frozen-lockfile
bash scripts/qualify-local.sh
bash scripts/qualify-local.sh --production
```

The default command runs format/lint/types/unit/integration/build, populated upgrade/restore,
asset/content validation and trade/marketplace/chat/friends browser suites. `--skip-checks` runs
only the development browser suites; it is not a full release gate.

`--production` runs an additional built-bundle HTTPS/password-auth browser profile. It provisions
only disposable accounts; both characters are created through the UI. It verifies development
login and public administrative/metrics routes are unavailable, and the client has no development
observation hook. Its self-signed localhost certificate is a local fixture, not public TLS proof.

Requirements: Node22, pnpm10, PostgreSQL server/client tools (`PG_BIN`, default17 Linux path),
Chromium (`CHROME_PATH` for the main suites), Playwright (`PLAYWRIGHT_PATH`), setsid, curl and
Python3. The production profile also needs OpenSSL and Caddy (`CADDY_BIN`, default host binary
/usr/local/bin/brokenodyssey-caddy). No package or service is purchased/provisioned externally.

Private temporary production proof directories contain generated test passwords and TLS keys.
Archive only result/gate/browser JSON, reviewed screenshots and non-secret explanatory notes.
Do not publish database archives, environment files, passwords or keys as evidence.

Long earned class/story/profession/dungeon journeys are separate active qualification work in
scripts/e2e/earned-journeys.cjs. They use actual movement and UI, without grants or XP injection.
They must pass before claiming that gameplay path complete; a green short smoke is insufficient.
