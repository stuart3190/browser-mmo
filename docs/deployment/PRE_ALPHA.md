# Pre-alpha operations

This is a single-region, single-API deployment. PostgreSQL is the durable authority. Do not
interpret the socket ceiling or local performance results as a production hosting guarantee.

## Start and authenticate

1. Install the pinned pnpm dependencies and build with the actual HTTPS API and WSS URLs.
2. Drain API writes and stop zone hosts before applying migrations. Run `pnpm db:migrate` once. The runner takes an
   exclusive migration lock and verifies the hashes of already-applied migrations. Never edit
   applied SQL. Keep a tested backup before upgrading.
3. Set `NODE_ENV=production`, `AUTH_DEV_LOGIN_ENABLED=false`, `AUTH_PASSWORD_LOGIN_ENABLED=true`,
   HTTPS `CORS_ORIGINS`/`REALTIME_ALLOWED_ORIGINS`, and loopback API/realtime bind addresses.
   Production startup refuses development/no auth, non-HTTPS origins and public bind addresses.
4. Put the services behind TLS ingress. `nginx.conf.example` overwrites forwarding headers.
   Enable `TRUST_PROXY_LOOPBACK=true` only with this trusted local ingress. Never forward arbitrary
   client-provided X-Real-IP/X-Forwarded-For headers. Health and metrics remain private.
5. Provision each invited account with a unique password of at least 15 characters (maximum 128
   UTF-8 bytes). There is no public registration or password-recovery endpoint. On an operator
   terminal, avoid password arguments/history:

   ```bash
   read -rs -p 'Password: ' MMO_PROVISION_PASSWORD
   printf '%s' "$MMO_PROVISION_PASSWORD" | MMO_AUTH_USERNAME=invited_player pnpm --filter @mmo/domain exec tsx scripts/provision-account.ts
   unset MMO_PROVISION_PASSWORD
   ```

   `DATABASE_URL` must already be set. `MMO_AUTH_ROLE=admin` applies only to a newly created
   account; rotation preserves existing roles and revokes all existing sessions. Use the same
   command to rotate a compromised/forgotten password after verifying the player's identity
   out of band. Disable unused test accounts. Never use the dev seed on production.

Passwords use salted scrypt (N=131072, r=8, p=1), constant-time verification, a generic unknown/wrong
password response, per-name/IP login limits, and two concurrent hash jobs per API process. This
follows the [OWASP password storage guidance](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).
Sessions remain opaque, hashed, revocable database tokens. Browser and admin login screens discover
the enabled provider; production has no dev fallback.

## Runtime database privileges

Use a distinct runtime login, separate from the schema owner/migration/backup operator. Grant
CONNECT on the game database, USAGE on its application schema, SELECT/INSERT/UPDATE/DELETE on
existing application tables, and USAGE/SELECT on their sequences. Do not grant superuser, CREATEDB,
CREATEROLE or schema CREATE. Set matching default privileges under the migration owner for future
tables/sequences, or grant them explicitly during each rollout. Use SCRAM credentials and keep
ownership/LISTEN connections direct. The isolated qualification deployment exercised this role
and confirmed a runtime CREATE TABLE attempt is denied; production still needs its own configured
pg_hba/secret store. Do not copy the disposable test cluster's administrator access policy.

## Zone ownership and recovery

Each host acquires session-level PostgreSQL advisory locks for all assigned zones, on a pinned
connection, before it starts serving. A duplicate assignment fails startup. The same connection
writes versioned recovery checkpoints and character rows in one atomic statement with synchronous
WAL commit. It is never transparently reconnected. A query/connection failure fences the host:
stop ticks, reject further gameplay, close sockets and return readiness 503. The supervisor must
restart/replace it. Do not use PgBouncer transaction pooling for ownership or LISTEN connections.

Checkpointed state includes character health, position, cooldowns, attack/death timers, enemy
health/targets, spawn/pickup identity and pending kills. Authoritative messages are published only
after their checkpoint commits. Simulation can continue at 20 Hz while publication coalesces
behind storage latency; both queued and socket bytes are bounded. Client-predicted, unpublished
inputs can be rolled back by a crash; published state must not be. Kill rewards retain their
existing transaction/outbox deduplication. A pending checkpointed kill is recovered even if the
separate kill-event write had not started.

Failover is conservative: never steal a lock based on a local clock or timeout. A replacement may
start only after PostgreSQL releases the old session's lock. During a network partition this can
mean downtime while TCP failure is detected. Investigate and fence/stop the old process before an
operator terminates its database backend. An old host cannot publish new state after its ownership
connection fails. Database durability itself still depends on storage, backups and PostgreSQL's
own failover guarantees; promoting an asynchronous replica can lose committed data.

On recovery, disconnected players keep their saved combat state and receive a linger window;
offline combat is not simulated retroactively. Wall-clock cooldown and respawn deadlines still
expire. Recovery images are versioned and tied to game-data content. Incompatible content/schema
requires an explicit checkpoint migration, not deleting the checkpoint to make startup succeed.
Drain API writes, stop old zone hosts, migrate, start the new release and check readiness before routing traffic. Rollback
must use a checkpoint-compatible binary; otherwise restore/migrate explicitly. Do not run mixed
releases against an incompatible checkpoint format.

## Backup and restore

```bash
DATABASE_URL="$BACKUP_SOURCE_URL" pnpm exec tsx scripts/db-backup.ts backup /secure/mmo.dump
DATABASE_URL="$EMPTY_RESTORE_URL" pnpm exec tsx scripts/db-backup.ts restore /secure/mmo.dump
```

The source uses a repeatable-read exported snapshot shared with `pg_dump`, so counts and data
refer to the same point in time while writes continue. The custom dump and SHA-256/count manifest
have private file permissions. Restore refuses a nonempty target or a database whose name is not
`mmo_restore_*`; it uses one transaction and validates checksum, row counts, constraints, wallet
ledger totals and marketplace escrow. Restored sessions are revoked to avoid resurrecting old
bearer tokens. Restore to a new database, verify it, then switch services to it; never restore over
a running world. Run `scripts/backup-restore-test.ts` with a dedicated TEST_DATABASE_URL for the
automated disposable exercise.

An operator still must schedule backups, encrypt/copy them off-host, define retention and recovery
objectives, monitor failures and repeat restoration on the actual deployment. A successful local
restore is not proof that production backups exist. Dump files contain sensitive account data;
never commit or publish them.

## Measurements and release gates

`scripts/capacity.ts` drives separate API/realtime processes with real WebSockets, 10 Hz movement,
periodic ping and authenticated inventory reads against a disposable `mmo_load_*` database.
`scripts/browser-performance.cjs` measures the production bundle with desktop and phone viewports,
frame times, long tasks, CDP heap/network statistics and screenshots. See the evidence report for
actual results and the admission recommendation. Repeat on the intended host and real phones.
CPU throttling or touch emulation is not a phone GPU, radio, thermal or battery test.

Before invitations: configure TLS and provisioned accounts; verify hosted CI for the reviewed SHA;
schedule/test off-host backups; set admission at or below the measured envelope; exercise the real
phone/hosting gates listed in the evidence report. No new gameplay is required to perform these
operations.
