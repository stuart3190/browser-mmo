# Release qualification — 2026-10-04

## Decision

**FAIL release qualification; DO NOT MERGE.** Local correctness checks pass, but hosted CI cannot
be read and this host does not meet the declared five-player performance gate. No new gameplay.
The five-connection configuration remains an internal pilot ceiling, not certified capacity.

Branch: `codex/pre-alpha-hardening`. Base candidate: `998b806ec26f0e25454fda7f7261d1914a52bcc9`.
The branch began clean and contains `7eae981`, `80b99e9`, `cf3bc1e`, and `998b806`.
`AGENTS.md` and `docs/MASTER_PLAN.md` are unchanged from main. Review found hardening, tests,
operational tooling and project memory, without unrelated gameplay work.

## Hosted CI and release artifact

SSH fetch/push access to the private repository works. The saved `gh` credential is invalid;
`gh run list --repo stuart3190/browser-mmo --branch codex/pre-alpha-hardening --limit 3` returns
HTTP 404 from `/actions/runs`. The Actions connector also returns Unknown tool. **No hosted run
success or failure is asserted.** The workflow is installed; an owner must read the latest pushed
commit's run in Actions or restore authenticated Actions access. There is no workflow-copy step.

A genuine workflow issue was reproduced locally: global `NODE_ENV=test` made the Vite build retain
`__mmo` and development React (659.52 kB main JS). CI's build step now explicitly uses production;
`pnpm build` rejects a game entrypoint containing the debug hook/development React. The actual
incorrect artifact failed that check; the production rebuild passed and the browser confirmed
`window.__mmo` absent. The workflow and its documentation copy match; actionlint accepts it.
Use `NODE_ENV=production pnpm build` when the invoking shell has a test/development environment.

## Recorded high-risk findings

This maps the findings recorded in project memory and the qualification request. No separate
original Astra audit artifact was found in the checkout; unrecorded findings cannot be certified.

| Finding                                                     | Status                 | Evidence / limit                                                                                                                          |
| ----------------------------------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Message-frequency movement and burst allowance              | FIXED                  | Elapsed movement credit, capped idle allowance; burst/replay world and realtime regressions                                               |
| Concurrent login / multiple controllers                     | FIXED                  | Admission serialization plus real simultaneous logins; exclusive host ownership                                                           |
| Logout, ban, expiry, failed session checks                  | FIXED                  | Idle-socket tests; real process restart after durable revocation                                                                          |
| Stale reconnect health, position, cooldowns                 | FIXED                  | Published position/CD survive SIGKILL; damage survives restart; reconnect snapshots                                                       |
| Duplicate zone hosts / unsafe takeover                      | FIXED                  | Paused owner refused replacement; terminated DB session fences it; three concurrent contenders yield one owner                            |
| Loss of acknowledged live state on crash                    | FIXED                  | Commit-before-publication, blocked-commit fencing, real process crash/reward boundaries                                                   |
| Repeated-hit health/HUD mismatch                            | FIXED                  | World/protocol regressions and production-browser hits, missed-message repair and reconnect                                               |
| Unbounded outbound queues / slow clients                    | FIXED                  | Bounded queues, slow authenticated/unauthenticated socket tests; pressure measured                                                        |
| HTTP/WS/database-work floods and waits                      | MITIGATED              | Per-process admission/rate limits and DB timeouts verified; public edge/global abuse controls remain deployment work                      |
| Missed notifications / failed fan-out queries               | MITIGATED              | Reconnect/failure resync and periodic 30 s reconciliation pass; LISTEN/NOTIFY remains non-durable/eventually consistent                   |
| Equipment empty-slot race and partial operations            | FIXED                  | Character lock, concurrent equipment test; SIGKILL after UPDATE rolls back item/version/history                                           |
| Duplicate kill/quest/marketplace rewards or spending        | FIXED for tested paths | Transaction/dedupe/concurrency suites; actual process kills before record, after record and after reward                                  |
| Username-only production login                              | FIXED                  | Provisioned scrypt passwords, bounded hashing, production refuses dev provider/missing auth/unsafe config; operator provisioning required |
| Admin permissions / production debug bypass                 | FIXED                  | Server-side permission tests; newly added production artifact gate; browser debug hook absent                                             |
| Migration overlap / timeout / incompatible recovery         | MITIGATED              | Deployment/startup locks, migration hash checks and corrupt-checkpoint refusal; compatible rollout procedure still required               |
| Untested backup/restore                                     | FIXED in repo          | Populated disposable restore, integrity checks and session revocation; see fixture scope below                                            |
| Scheduled encrypted off-host backup and deployment recovery | EXTERNAL BLOCKER       | Local tooling is not an operated backup service                                                                                           |
| Actual hosted CI result                                     | EXTERNAL BLOCKER       | Actions access unavailable; workflow validity/local checks are not a hosted pass                                                          |
| 20 Hz / safe capacity with headroom                         | STILL OPEN             | Five players fail the declared gate; kernel scheduling and DB feedback tails measured                                                     |
| Physical-phone performance / production TLS and ingress     | EXTERNAL BLOCKER       | Neither physical devices nor deployment endpoints were available for qualification                                                        |

No tested CRITICAL/HIGH correctness regression remains open. That does not certify unknown exploits,
production operations, or performance. No auth platform replacement or distributed broker was added.

## Performance profile and focused change

The old interval accumulates late wakeups. A simultaneous 20 s timer comparison measured 17.90 Hz
for an interval versus 18.90 Hz for anchored deadlines. The scheduler now uses monotonic deadlines,
counts skipped slots, and never backfills fake simulation steps or relaxes movement/durability.
Three targeted scheduler regressions cover drift, missed slots and stopping inside a callback.

An independent **timer-only** 10 s Linux `perf sched` trace, with no game server/browser running,
measured 19.27 Hz. The Node main thread waited 365.6 ms total on the run queue; p99 scheduling
delay was 55.5 ms, maximum 81.0 ms. Timer wake lateness p95/p99 was 43.1/88.3 ms. This directly
establishes scheduling delay sufficient to miss a 50 ms deadline without any AI, database or game
logic. It does not identify the hypervisor's physical cause. The cgroup has no CPU quota/throttling.

A separate quiet 60 s five-player run with method timing enabled (no CPU sampler) recorded:

| Operation                           | Calls | p50 ms |  p95 ms |  p99 ms |
| ----------------------------------- | ----: | -----: | ------: | ------: |
| Complete world step                 | 1,093 |  0.147 |   1.327 |   7.432 |
| Enemy AI                            | 1,093 |  0.061 |   0.277 |   3.374 |
| Spawn populations                   | 1,093 |  0.004 |   0.011 |   0.063 |
| Player combat                       | 1,093 |  0.004 |   0.006 |   0.024 |
| AOI visibility                      | 5,465 |  0.004 |   0.018 |   0.056 |
| Movement validation                 | 2,765 |  0.015 |   0.049 |   1.280 |
| Collision sweep                     | 7,354 |  0.001 |   0.010 |   0.018 |
| Checkpoint serialization            |   918 |  0.303 |   3.375 |  11.132 |
| JSON.stringify (all measured calls) | 8,335 |  0.004 |   0.370 |   2.992 |
| WebSocket send                      | 5,565 |  0.031 |   1.108 |   4.208 |
| Checkpoint commit (async wall time) |   918 |  9.718 | 106.095 | 264.201 |
| SELECT 1 probe (async wall time)    |    59 |  3.127 |  61.115 | 427.958 |
| Periodic full-state reconciliation  |    10 | 20.518 | 178.957 | 178.957 |

Timings include scheduling interruptions. Nested/inclusive rows overlap; do not add them together.
Database work is asynchronous: commit latency gates **publication/RTT**, not a synchronous wait in
`world.step`. Checkpoint coalescing prevents a growing write queue. Timer delivery and durable
feedback are distinct bottlenecks. The normal tick gauge also includes flushing/checkpoint capture;
its once-per-second sampled p95 is not a distribution of every world-step call.

Eight enemies and five nearby moving players exercised wandering/steering/collision/AOI. No A*
search was triggered in that village workload. A separate real-zone navigation measurement found
100/100 paths on each route: village-to-north p50/p95/p99 0.151/9.620/52.173 ms;
eastern ridge 0.314/1.791/7.235 ms; grid construction 184 ms. This is not a crowded-combat test.
The baseline instrumented run observed notification enqueue work (five calls, 2.62 ms total);
periodic reconciliation is measured above. The load's HTTP actions are inventory reads, so it does
not establish high-volume mutation/NOTIFY capacity. Logs were at warn level without load errors;
logging was not a material observed source. Whole-process CPU sampling attributed about 78% of
weighted time to idle, 3% JSON serialization, 2.4% writev and 1.1% GC; startup and profiler overhead
make those supporting observations, not isolated tick CPU percentages.

No AI, collision, pathfinding, AOI or persistence redesign was justified by these measurements.

## Capacity results

Declared gate before the final load: at least 19.5 Hz, p95 RTT below 250 ms, no protocol/HTTP errors
or unexpected disconnects, and bounded queues. Real PostgreSQL, real WebSockets, 10 movement
intents/sec/player, ping and authenticated inventory HTTP reads every two seconds. HTTP reads
within each batch are sequential; admission is staggered. There were no concurrent test/build/
browser jobs during the final capacity window. This is a local village movement workload, not a
combat/economy stress certification. The separate load generator also runs on this VM.

| Players                     | Seconds |                                     Hz | Skipped slots | RTT p50/p95/p99 ms | Event-loop delay p95/p99 ms | Server CPU cores | RSS MB | HTTP p95 ms | DB probe p95 ms | Errors / disconnects | Received WS kB/s |
| --------------------------- | ------: | -------------------------------------: | ------------: | ------------------ | --------------------------- | ---------------: | -----: | ----------: | --------------: | -------------------- | ---------------: |
| 5, methods off              | 120.009 |                                 18.199 |           216 | 60 / 274 / 341     | 25.13 / 80.67               |            0.268 |  160.7 |      123.41 |           52.34 | 0 / 0                |            16.60 |
| 5, method-profile follow-up |  60.017 |                                 18.195 |           109 | 62 / 359 / 509     | 29.26 / 81.66               |            0.342 |  161.4 |      146.15 |           61.12 | 0 / 0                |            15.69 |
| 10 / 20 / 30 / 50           |       — | Not run: five failed the declared gate |             — | —                  | —                           |                — |      — |           — |               — | —                    |                — |

Event-loop monitor resolution is 10 ms: estimated excess lag for the first row is p95 15.13 ms,
p99 70.67 ms; the table preserves raw intervals. Maximum interval was 491.8 ms. There were 295
ping samples and 295 HTTP responses, no movement corrections, and 1,992,228 received WS bytes.
Sampled aggregate pending-send peak was 5,645 bytes, socket-buffer peak zero. These are 1 s samples,
not instantaneous maxima, and exclude the batch held by an in-flight checkpoint. Queue correctness
is separately exercised by slow-client regression tests. No synthetic catch-up work was performed.

The quiet window recorded 1,958 WAL syncs taking 19,497.6 ms total (mean 9.96 ms per sync), with
508.8 ms total WAL write time. These cluster-level timings include OS scheduling; they are not a
pure disk-device benchmark. Host vmstat, including admission/cooldown, averaged 90.79% CPU idle,
1.65% I/O wait, zero reported steal and no swapping. CPU run queue reached 15 transiently. Memory,
network throughput and total CPU saturation are not supported as the limiting factors.

- **Tested maximum on the final candidate: 5 simultaneous players.**
- **Recommended safe per-zone player cap: not established.** Keep the internal ceiling at five;
  approve zero external invitations until qualification passes. Zero invitations is a release
  policy, not a claim that the software supports zero players.
- **Observed degradation point: already at five; the exact threshold below five is unknown.**
  Timer-only controls also miss deadlines, so player count alone cannot explain the result.
- **Host limitation:** CPU scheduling latency is directly measured; durable I/O completion tails
  additionally delay feedback. Physical CPU speed, oversubscription and storage details need the
  target host's telemetry. No claim that buying a particular machine will fix everything.

## Production hardware guidance

Choose predictable single-thread performance and low scheduling jitter for each active zone thread.
More aggregate cores help separate zones/API/DB; they do not accelerate one JS simulation thread.
[Node explains the single JavaScript thread and asynchronous I/O](https://nodejs.org/en/learn/asynchronous-work/event-loop-timers-and-nexttick).
For an initial small deployment, budgeting four modern dedicated/reserved cores and 8–16 GB RAM
is a starting configuration to benchmark, not a demonstrated minimum or certified capacity.
This process used about 161 MB RSS, so the current 48 GB host is not RAM-limited. Reserve space for
PostgreSQL buffers, API, OS and growth; measure it before sizing a larger deployment.

Use durable low-latency SSD/NVMe storage for PostgreSQL WAL; test sync-write tails rather than
advertised bandwidth. Do not disable synchronous commit/fsync to make the graph look better.
[PostgreSQL documents WAL sync timing and durability tradeoffs](https://www.postgresql.org/docs/current/wal-configuration.html).
Keep DB latency low and connection sessions stable. A stable low-jitter network and sufficient
uplink/headroom matter more than branding; this test's 16.6 kB/s outbound game payload is nowhere
near a normal link's capacity. Test actual client RTT, ingress and packet loss on the chosen host.

First qualify one zone on a stable machine. Then spread independent zone processes across cores,
and across machines when utilization/fault isolation warrants it. Maintain one owner per zone.
Instances/shards are later world/product partitioning decisions, not a fix for current timer jitter.
No Redis/NATS/Kafka, distributed zone splitting or new infrastructure is required by this evidence.

## Crash, failover, health and restore proof

Seven actual child-process tests passed in the full run: SIGKILL after acknowledged movement with
persisted health/CD; three simultaneous takeovers; SIGSTOP owner retaining its lock; confirmed DB
session termination and stale-owner fencing; each of three kill reward crash boundaries; equipment
UPDATE before COMMIT; and published damage plus revoked-session recovery. There is no timed lease:
expiry testing is inapplicable. Explicit failover requires confirmed DB lock release. Rapid restart
and repeat reward recovery did not duplicate reward rows/XP; existing reward tests additionally
assert loot uniqueness and retained spawn timers. A crashed equipment transaction left the complete
item row and history unchanged; one retry succeeded and the stale-version replay failed.

Production-browser E2E observed successive hits at health 140, 134 and 129, each with matching
vitals. It deliberately dropped subsequent health messages, leaving HUD 125 while authoritative
persisted health reached zero. Periodic reconciliation repaired HUD to zero; reconnect kept it zero.
The test uses actual wolves and normal combat cadence, not a synthetic high-frequency ability
storm. An initial fixed spawn selected an inactive den point (OUT_OF_RANGE); the fixture now reads
a live wolf's position. A browser-invalid close code was corrected to 1000. No game fix was needed.

Final disposable restore: seven migrations; two accounts/identities/characters; ten containers;
five item instances including equipment/materials/escrow; ten history entries; two wallets/seven
ledger entries; one quest; two listings and one completed marketplace transaction; one kill event,
one kill reward and one session. Counts, constraints, wallet/ledger equality, bidirectional escrow,
nonnegative balances, equipped-row existence and migration hashes passed. All sessions were revoked;
an occupied-target restore was refused. Both databases were dropped. The checkpoint table in this
fixture is empty; populated checkpoint recovery is proven by process tests, not by this dump fixture.
No production backup, dump or credential is committed.

## Browser/mobile observations

Production build: main JS **437.65 kB raw / 133.68 kB gzip**, Babylon **1,948.66 / 460.45 kB**.
About 599 kB transferred across ten startup/asset/API requests per profile. There are no authored
3D asset downloads in this placeholder scene. Login-ready times on local networking were 1.28–2.95 s;
time through entry plus a fixed 10 s warm-up was 12.56–13.66 s. These are not cellular startup times.

Chromium 153.0.0.0 / ANGLE SwiftShader, production build, requested 60 seconds each. Automation and
CDP sampling extended wall time; actual durations are recorded. No simultaneous build/test/load job.

| Profile         | Actual seconds | Frame p50/p95/p99 ms   | JS heap start/end/max MB | React root commits | WS received kB | Page errors |
| --------------- | -------------: | ---------------------- | ------------------------ | -----------------: | -------------: | ----------: |
| desktop         |          73.18 | 183.3 / 800.0 / 1166.6 | 20.45 / 17.85 / 22.22    |                 14 |          139.3 |           0 |
| phone-portrait  |          63.89 | 149.9 / 633.3 / 916.7  | 20.72 / 17.88 / 22.54    |                 16 |          133.9 |           0 |
| phone-landscape |          73.49 | 166.7 / 850.0 / 1216.6 | 20.72 / 17.53 / 23.12    |                 21 |          141.5 |           0 |

Production debug hooks were absent in all profiles. End heap was below start, but sampled JS heap
excludes GPU/driver/native memory and this short trace cannot disprove leaks. Root commit counts
do not suggest React dominates this particular one-player workload; they are not component render
durations or a many-player UI benchmark. The traces used keyboard movement in touch viewports,
not real fingers. Software-rendered frame tails are unplayable and cannot establish Android FPS.

The renderer adapts to device pixel ratio and has no measured mobile resolution budget. Static
props are individual meshes (with shared materials/frozen matrices), and the zone is loaded as a
whole. These deserve real-GPU fill-rate/draw-call measurements before adding density or high-cost
assets. Do not implement LOD/instancing, a React rewrite or WebGPU migration based solely on this
software-renderer result. Screenshots show minimap labels clipped at the circle and long names
wrapping in portrait; basic controls are within the viewport. Panel/thumb acceptance remains untested.

Read-only development-build scene counts are recorded separately from production timings: 266 meshes, 36 materials, 0 textures, 13 active meshes and 11 remote entity markers in the sampled village view. A 390×844 DPR-2 viewport rendered a 780×1688 canvas. Cold Vite dependency optimization caused the first development-only count attempt to time out; the warmed attempt succeeded. These counts are neither a maximum nor a phone benchmark.

## Required physical Android checklist

- [ ] Named low/mid-range Android phone and Chrome version; real GPU/WebGL2 and WebGPU fallback.
- [ ] Cold and warm startup on representative Wi-Fi/4G, transferred assets and time to playable.
- [ ] At least 20–30 minutes moving/fighting with FPS/frame-time tails, thermal throttling and battery drain.
- [ ] Browser/OS memory and graphics context-loss recovery; background/resume, screen lock and tab eviction.
- [ ] Portrait and landscape safe areas, readable text, panels/dialogue/inventory/minimap overlaps.
- [ ] Simultaneous joystick + camera + tap targeting/abilities with real thumb reach and accidental taps.
- [ ] Packet loss/latency/network handover, reconnect health/CD consistency, session expiry and logout.
- [ ] Multiple nearby players/enemies and denser props; evaluate a pixel-ratio/resolution budget from measurements.

## Verification and remaining actions

The final complete verification **exited 0** after the release-build fix: formatting, lint,
typechecking, 119 unit tests, 115 real-PG integration tests (54 realtime, 54 domain, seven API),
all four builds and the production artifact gate. Command: `env -u NODE_ENV` with an isolated
`TEST_DATABASE_URL` and the measured Vite URLs, followed by `pnpm verify`. Final emitted game
chunks match those used for browser qualification (`index-D4IJ7cHU.js`, `babylon-E3HG0XtW.js`).
A first attempt stopped at a new harness type error. The next complete pass exposed the test-mode
artifact issue; that genuine release fix justified the final complete run. No runtime source
changed after that run. The negative development-artifact check, production build and actionlint
also passed their expected checks. Assets validation and the expanded restore exercise passed separately. Relevant production-browser
health E2E and final-candidate capacity qualification are described above; performance gate failed.
The historical quest/world/ability browser scripts were not rerun as unrelated content was unchanged.

Remaining external actions: restore Actions visibility and obtain a genuine green run for the final
SHA; qualify stable target hosting under the declared gate and a representative combat/economy
workload; test physical phones; operate TLS/private ingress, invited accounts, monitoring and
encrypted off-host backups with a deployment restore drill. Before reopening a restored service,
reconcile bans and credential changes newer than the backup as well as revoking old sessions. Retention/archive, full-bag marketplace
expiry, lock-order retries, minimap clipping and broader UI/content limitations remain non-high-risk
debt in PROGRESS. Do not start gameplay work to bypass release gates. Main must remain unchanged.

## Evidence

All measurements are linked under [qualification evidence](evidence/qualification/): quiet capacity,
method timings, CPU-sample summary, kernel timer trace summary, navigation routes, restore and browser
proof. Earlier mixed-workload/profiler-overhead probes were diagnostic only and are not certified
capacity. Raw kernel traces and database dumps stay outside the repository.

## Reproduction notes

Use disposable databases only. Integration setup drops public/drizzle schemas. The load harness
requires `mmo_load_*`; qualification hosts require `NODE_ENV=test` and loopback listeners. Do not
run tests/builds/software rendering alongside capacity measurements. Provisioning and the trusted
loopback load-generator IP headers are test scaffolding, not production ingress configuration.

```bash
# Runtime verification; leave NODE_ENV unset so Vitest chooses test and Vite chooses production.
env -u NODE_ENV TEST_DATABASE_URL=<isolated-test-url> pnpm verify

# API and profile host in separate terminals against an independently migrated mmo_load_* DB.
NODE_ENV=test DATABASE_URL=<load-url> API_PORT=4400 AUTH_DEV_LOGIN_ENABLED=true \
  CORS_ORIGINS=http://127.0.0.1:4173 TRUST_PROXY_LOOPBACK=true LOG_LEVEL=warn \
  node services/api/dist/main.js
NODE_ENV=test TEST_DATABASE_URL=<load-url> PROFILE_METHODS=false \
  pnpm exec tsx scripts/qualification/profile-server.ts
TEST_DATABASE_URL=<load-url> LOAD_PROFILE_URL=http://127.0.0.1:4402 \
  LOAD_PLAYERS=5 LOAD_SECONDS=120 LOAD_REPORT=/tmp/capacity.json \
  pnpm exec tsx scripts/capacity.ts
# Omit PROFILE_METHODS=false on a separate host run to collect method timings.
# Increase LOAD_PLAYERS only after the preceding level meets the declared gate.

TEST_DATABASE_URL=<isolated-test-url> pnpm --filter @mmo/realtime exec vitest run test/process-qualification.test.ts
TEST_DATABASE_URL=<isolated-test-url> pnpm exec tsx scripts/backup-restore-test.ts

NODE_ENV=production VITE_API_URL=http://127.0.0.1:4400 \
  VITE_REALTIME_URL=ws://127.0.0.1:4401 pnpm build
# Start game-web preview on 4173 and the normal built realtime service on 4401, with matching origins.
PLAYWRIGHT_PATH=<installed-playwright> PERF_SECONDS=60 node scripts/browser-performance.cjs
TEST_DATABASE_URL=<load-url> PLAYWRIGHT_PATH=<installed-playwright> node scripts/qualification/browser-health.cjs
```

The browser health fixture chooses a live wolf from the current durable checkpoint before login;
it does not bypass movement in an authenticated game session. Browser E2E uses dev auth solely on
the isolated test API. Production auth/gating is separately exercised by real HTTP/DB integration
checks; actual TLS and operator account provisioning remain external. Scene counts can be read at
`window.__mmo.sceneCounts` in a development build only. Do not use development bundle timings as
production performance numbers.

For the kernel control, an otherwise idle Node process scheduled an anchored 50 ms timer for ten
seconds and recorded actual wake lateness. `perf sched record -o /tmp/mmo-scheduler.data -- node
/tmp/mmo-timer-trace.cjs` captured scheduling; `perf sched latency -p -i /tmp/mmo-scheduler.data`
and `perf sched timehist -t <node-main-tid> -i /tmp/mmo-scheduler.data` selected that thread.
Only the sanitized control/thread summary is committed; unrelated system tasks and raw traces are
not. Profile totals include startup and tracing overhead, as labelled in the evidence.
