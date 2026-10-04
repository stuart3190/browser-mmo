# Production-mode release qualification — 2026-10-04

**FAIL / DO NOT MERGE.** Continue `codex/pre-alpha-hardening`; no gameplay added.
Starting SHA `44c0e5e8014ec490c0778eb4078fcd813f886585`, containing `998b806`, `80b99e9`
and all earlier hardening. Remote main remained `d564ab785069047c97062368f42019856738d0c6`.
AGENTS.md and MASTER_PLAN.md are unchanged. Agent: Codex.

This supplements [the previous qualification](release-qualification-2026-10-04.md), including its
complete CRITICAL/HIGH findings matrix. It does not overwrite earlier failed measurements.

## Hosted CI

SSH access to the private repository and branch push work. `gh run list --repo
stuart3190/browser-mmo --branch codex/pre-alpha-hardening` returns HTTP 404 for Actions runs.
The GitHub workflow connector returns `Unknown tool`; the browser service has no active session
or GitHub profile. No hosted run result is available. Local actionlint/workflow checks are not CI.
The workflow already exists; no manual copy is required. Restore authenticated `gh` access with
repository access and Actions read permission, then inspect the run for the final branch SHA.
Never paste a credential into chat. This is a merge blocker independently of local tests.

## Isolated deployment

An independent Caddy instance serves `https://127.0.0.1:4443`, proxying production bundles on
loopback ports 4400/4401. Existing Docker ingress on 80/443 and unrelated services were untouched.
PostgreSQL 17.11 uses the existing isolated qualification cluster on 55439 and a separate
`mmo_load_production` database. No public game deployment or publicly trusted certificate is claimed.
The local certificate is explicitly trusted by Node clients; browser automation accepts that test
certificate only. The product's TLS checks are unchanged.

Both services use NODE_ENV=production, dev auth disabled, password auth enabled, HTTPS origins,
loopback binds and a five-connection ceiling. Ingress overwrites forwarding headers and returns 403
for metrics/health. The standalone [Caddy configuration](../deployment/qualification.Caddyfile)
requires MMO_QUAL_DIR and MMO_ROOT. Its first draft incorrectly ordered the private response after
static handling; the 403 test caught this and the isolated configuration was corrected.

The runtime now uses a dedicated SCRAM-authenticated PostgreSQL role: no superuser, CREATEDB,
CREATEROLE or schema CREATE; only existing-table DML/sequence access. The actual CREATE TABLE
attempt was refused. Migration/backup administration remains separate. The isolated cluster retains
its test-only operator access and is **not** a public production database-security certification.
TLS certificate, credentials, logs and process IDs are private under `/tmp/mmo-production-qualification`.
The deployment is ephemeral qualification infrastructure, not a reboot-persistent public service.

Deployed player admin access returned 403, wrong passwords 401, and an untrusted WebSocket origin 403. Sampled passwords/bearer tokens were absent from the structured logs.

Actual production startup refused dev auth, missing password auth and public API binding before
listening. The deployed provider list contains only password; dev login returns 404. Health/readiness,
change-feed connectivity, JSON request/connection logs and private metrics were observed. Two new
read-only gauges expose pending durable output and WebSocket buffered bytes separately. Pending
output excludes the in-flight checkpoint batch; sampled peaks are not absolute queue maxima.

## Representative workload and measurements

`scripts/qualification/production-load.ts` requires a disposable mmo_load_* database and TLS.
Operator fixtures create distinct password accounts, characters, a quest and two swords, positioning
players near actual live wolves before admission. All measured operations use real password-auth
HTTP sessions and production HTTP/WebSockets: 10 Hz collision-aware pursuit, targeting, autoattack,
Heavy Strike, ping, equipment→personal vault→backpack cycles every three seconds, and one real
marketplace sale per player to the next player. No outcome/damage override or anti-cheat bypass.

This is a two-minute small-world workload, not a boss fight, login storm, WAN test or long soak.
Provisioning/password hashing is outside the measurement window. Request cycles are bounded per
player; skipped cycles are counted (zero). Damage/death counters are received messages, so broadcasts
may count the same event for multiple viewers. Database counts are cumulative across fixtures;
unique reward rows, not broadcast counts, establish reward totals.

Gate declared before measurement: ≥19.5 simulation Hz, p95 RTT <250 ms, no unexpected errors or
disconnects, bounded queues and safety headroom. No tested level passed.

| Players | Seconds |    Hz | Skipped slots | RTT p50/p95/p99 ms | HTTP p95 ms | DB probe p95/p99 ms | RT CPU cores | RT RSS MB | Received kB/s |
| ------: | ------: | ----: | ------------: | ------------------ | ----------: | ------------------- | -----------: | --------: | ------------: |
|       1 |   60.01 | 19.21 |            48 | 57 / 463 / 463     |       176.3 | 56.5 / 106.3        |        0.192 |     128.7 |          3.58 |
|       5 |  120.21 | 18.69 |           157 | 58 / 344 / 424     |       587.9 | 21.9 / 46.0         |        0.281 |     138.6 |         20.68 |

The final post-verification run used the restricted SCRAM runtime role with the same production
bundles/configuration (120.01 s): **19.37 Hz**, 76 skipped slots, RTT **52/252/328 ms**, HTTP p95
341.96 ms, DB probe p95/p99 16.03/106.85 ms, 0.279 RT CPU cores, 137.5 MB RSS, 21.62 kB/s received.
It completed 195 transfers and five sales with zero HTTP errors, disconnects, corrections or skipped
HTTP cycles. Two `TARGET_DEAD` domain rejections occurred during contested combat; they are recorded,
not hidden as zero errors. No malformed-message failure occurred. Unique rewarded kills/rewards
both reached 46 (up from 30); marketplace transactions reached 17 (up from 12).

Final sampled tick/checkpoint p95: 5.54/69.69 ms; pending-output/socket peaks: 10,186/0 bytes.
Final event-loop intervals: median per-second p95 19.15 ms, p95 of those p95s 40.27 ms, maximum
344.46 ms. Host sampling summaries are in `host-summary.json`; these include other live workloads.
This improved run **still fails both the Hz and RTT gate**, with no demonstrated safety headroom.
Variation between runs is itself a reason not to certify this shared host.

Both earlier corrected runs: zero protocol/HTTP errors, disconnects, movement corrections or skipped HTTP
cycles. Five players: 195 transfers, five completed sales, 195 ping samples, 400 HTTP samples;
572 received damage messages, 50 received player-hit messages. Unique rewarded kills rose from
18 to 30; kill_events rewarded count and kill_rewards count both equal 30. Sampled pending output
peaked at 11,856 bytes; socket buffer at zero. At one player, corresponding peaks were 1,807/0 bytes.

These measurements used the production bundles with the isolated administrative DB login; the
subsequent restricted-role deployment passed correctness checks separately. A first five-player
run used a bot without collision prediction and generated 1,311 corrections: **discard it as a clean
capacity result**. The corrected driver uses the existing collision implementation; server validation
was never relaxed. A two-player 20 s shakedown is too short for capacity certification.

- Tested representative concurrency: five. Higher stages intentionally stopped after failed gates.
- Safe current players/zone: **not established**, even one failed. Keep the five-connection internal
  pilot ceiling; do not interpret it as certified capacity or approve external invitations.
- Observed degradation: already one player. Exact saturation/failure threshold is unknown.

## Profile and hardware implication

A V8 profile of the real production realtime bundle (339 s, including idle/admission/shakedown and
combat load) attributed weighted samples to idle 85.13%, native writev 3.21%, checkpoint serialization
1.40%, GC 0.93%, checkpoint commit JavaScript 0.51%, world step self 0.16%, steering self 0.12%,
WebSocket send self 0.09%, enemy AI self 0.07%. These are sampled self costs, **not percentages of
per-tick wall time**; async wait is not attributed to the commit function's JavaScript samples.
No material AI/pathfinding optimization is justified by this evidence.

At five players the once-per-second tick gauge had p95 9.59 ms and checkpoint gauge p95 192.31 ms.
At one: 21.89/137.35 ms. These sample the latest completed operation, not every tick/commit.
An independent 10 ms-resolution event-loop probe recorded maximum intervals of 227.67 ms (one)
and 276.82 ms (five). Per-second p95 intervals had medians 18.46/20.32 ms and 95th-percentiles
40.30/74.06 ms. Subtract the 10 ms measurement interval when interpreting excess lag; these are
not aggregate event-loop percentiles. Probe I/O itself is instrumentation overhead.

Together with the earlier timer-only kernel trace (55.5 ms p99 run-queue delay), evidence points to
scheduling jitter and durable-publication completion tails. It does not prove the hypervisor's
physical cause or certify a particular replacement host. Low RT CPU/RSS and small network payloads
do not support total CPU, RAM or network saturation as the limit. Do not disable synchronous WAL,
weaken movement rules, or introduce a broker to improve the graph.

Qualify predictable dedicated/reserved single-thread CPU scheduling and low-tail-latency durable
SSD/NVMe WAL storage. More cores help separate API/DB/zones, not one JS simulation thread. The
previous report's four-core/8–16 GB starting benchmark configuration remains a hypothesis, not a
certified minimum. First qualify one zone; spread independent zones across processes/machines only
when utilization and fault isolation justify it. No distributed infrastructure was added.

## Deployed crash, session and browser proof

`scripts/qualification/deployment-faults.ts` uses actual production bundles, password auth and TLS
against the explicitly selected disposable deployment. Duplicate startup failed; SIGSTOP owner
retained its lock; after SIGKILL and confirmed DB lock release, three concurrent replacements yielded
exactly one owner. Position matched the stored checkpoint, the absolute cooldown deadline survived,
and damaged health remained within normal regeneration (73→75 in the restricted-role run). The
first strict equality assertion was corrected because legitimate safe-zone regeneration resumed;
the bound uses the real regen rule and elapsed time and rejects a reset to full health.

Concurrent controller replacement, database session expiry and account ban closed the old/current
sockets as appropriate. Password-auth logout closed the load socket with code 4000 and the revoked
bearer received 401. Existing targeted process tests additionally cover stale-owner fencing, repeated
hits, equipment UPDATE before COMMIT, and three kill/reward crash windows; the final full run records
their result separately. No expiring lease or unsafe forced lock stealing is used.

The real production browser received successive hits at 139, 133, 127 with matching vitals. Test-side
message loss left HUD 127 while durable health reached zero; periodic reconciliation and reconnect
restored HUD zero. Production `__mmo` was absent. This is SwiftShader correctness evidence, not physical
Android FPS. Main JS remains 437.65 kB raw/133.68 kB gzip; Babylon 1,948.66/460.45 kB. No new rendering
or gameplay work was added. See [physical Android acceptance](../deployment/ANDROID_ACCEPTANCE.md).

## Backup, encryption and populated migration

The repeatable restore test now creates schema through 0005, populates accounts, characters, items,
equipment, wallets/ledger, quest, marketplace escrow/completed purchase, kill/reward and a session,
then applies 0006. Counts were preserved; seven migration hashes verify after restoration. All
constraints, wallet/ledger sums, bidirectional escrow, balances and session revocation passed;
restoring into an occupied database was refused.

A second backup used the **populated deployed database**, including its real zone checkpoint. The
consistent dump plus manifest was archived, GnuPG AES256-encrypted with a disposable random secret,
decrypted, and checked byte-for-byte by archive SHA-256. Restore from the decrypted archive into
mmo_restore_deployed passed integrity/count checks and revoked every session. Seven migrations and
one checkpoint restored. The restored production world was started separately to exercise checkpoint
compatibility. No dump, credential, encryption key or full profile is committed.

No project off-host storage credentials/configuration were available. Encryption was tested locally;
**off-host replication, retention, scheduling and alert delivery were not performed**. One minimal
external provisioning action: provide a private off-host backup destination and a scoped service
credential through the server's secret store, plus an encryption recipient/recovery key kept outside
this VPS. Then configure scheduled encrypted export, retention, failure alerts and an independent
restore drill. Do not put the only recovery key beside the backup or call local encryption disaster
recovery. Public DNS/certificate and persistent service operation are separate deployment actions.

## Findings status and merge decision

The previous code fixes remain in place: movement/replay limits, controller serialization, session
revocation, atomic persistent state, bounded queues/work, notification reconciliation, equipment
locking, reward/economy transactions, production auth/debug gating, and exclusive zone ownership.
Deployed tests add evidence rather than replacing these architectures. No new CRITICAL/HIGH code
regression was demonstrated. Migration safety is mitigated by tested rollout checks; compatible
content/checkpoint rollback remains an operational requirement.

Still blocking: unreadable hosted CI result; failed capacity/tail-latency gate. External release
requirements: physical Android acceptance, operated encrypted off-host backup, public TLS/DNS and
persistent monitored service deployment. The isolated production-mode ingress/restore tests are now
completed evidence rather than merely proposed operator tasks.

Main must remain unchanged. Next task is to restore Actions visibility and qualify stable hosting
under the same workload, then connect a phone and operate the backup destination. No new gameplay.

Raw sanitized evidence: [production-qualification](evidence/production-qualification/).

## Final local verification

One complete `pnpm verify` exited zero: format, lint, all package/script typechecks, 119 unit tests,
116 real-PostgreSQL integration tests (55 realtime, 54 domain, 7 API), all four builds and the
production debug-artifact gate. This includes all seven actual process-crash tests and the new
queue-metrics regression. Deployed fault/HTTP/browser checks and both restore exercises are
separate evidence above; none is described as hosted CI. Documentation-only evidence updates
receive their own formatting/diff checks after the run.
