# Direct trading verification — 2026-10-24

Verified by Codex on the completion branch, starting from deployed `2c47b27`.

- `proof.json`: nine desktop/touch browser assertions using two fresh accounts, an actual sword
  pickup, ordinary UI offer/lock/confirm input, offer substitution, live inventory/wallet updates,
  fresh authentication and cancellation. No grants, teleports or injected progression. Read-only
  development observations locate the original pickup and compare item identities.
- Screenshots: reviewed desktop/390×844 offers, completed touch exchange, 844×390 layout. Inspected
  after correcting ability-bar input interception, sheet height and the locked-offer presentation.
- `migration.json`: isolated old-schema database migrated through 0022; every existing populated
  account/character/item/history/wallet/ledger row remains deeply equal. Production was untouched.
- `isolated-runner.json`: `bash scripts/qualify-local.sh --skip-checks` actually provisioned a second
  disposable cluster, ran the same nine browser assertions, then stopped its own services/cluster.
  `fullChecks: false` is intentional; this run verifies the new harness, not the aggregate check.
- Domain: ten PostgreSQL tests (atomic transfer/concurrent confirmations, marketplace race,
  offer revisions, stale item versions, insufficient funds, currency cap rollback, capacity swaps,
  bound/foreign/locked/duplicate items, privacy/cancellation/expiry/replay and overlapping proposals).
- API: authenticated HTTP test rejects forged ownership/malformed offers and stale consent, then
  verifies both wallet outcomes. All changed workspace types and lint pass.

Full monorepo verification is tracked in PROGRESS; the first aggregate found a fixture payload
TypeScript annotation issue, corrected before the final run. These browser checks do not certify
physical-phone performance, hosted CI, production capacity, or a public deployment.

To reproduce the focused browser smoke without an existing database:

```bash
bash scripts/qualify-local.sh --skip-checks
```

Omit the option to first run format/lint/typecheck/unit/integration/build. Requires PostgreSQL 17
binaries, pnpm, Chrome and Playwright (`PG_BIN`, `CHROME_PATH`, `PLAYWRIGHT_PATH` override their paths).
The runner retains `/tmp/brokenodyssey-qualification.*` evidence and stops only processes it starts.
It never loads deployment credentials or connects to the live game database.
