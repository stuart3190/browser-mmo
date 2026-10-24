# Fixed source qualification — 2026-10-24

Source: `2c1b50996044fcd4c4d9e5a2482ab2acef398774`, detached worktree
`/tmp/bo-qualification-source-2c1b509`. Full runner evidence:
`/tmp/brokenodyssey-qualification.cajvdL`.

`bash scripts/qualify-local.sh` passed with `fullChecks=true`: formatting/lint/types, unit and
integration suites, production builds and debug-hook exclusion, populated upgrade/backup/restore,
asset/content validation, trading (9), marketplace (8), social chat (10) browser assertions.
It stopped only its own processes and PostgreSQL cluster. No production mutation. Friends/DM
work started afterward and is not covered by this fixed-source qualification.

Hosted CI separately exposed PostgreSQL client/server incompatibility. This was reproduced using
PostgreSQL 17 client tools against an isolated PostgreSQL 16 Docker server: restore fails on the
unsupported `transaction_timeout` setting. The backup utility now selects/checks tools matching the
server major version, honoring explicit PG_BIN, and refuses a known mismatch. Fresh round trips
pass on both PostgreSQL 16 and 17; an explicitly wrong PG_BIN fails with the intended message.
CI now pins Ubuntu 24.04 and explicitly installs the matching PostgreSQL 16 clients. Hosted CI
rerun is pending; do not claim it passed merely from these local checks.
