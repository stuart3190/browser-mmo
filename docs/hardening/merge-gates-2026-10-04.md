# Merge gates: 2026-10-04

**FAIL / DO NOT MERGE.** Verified by Codex on 2026-10-04 against
`100d6c50514787a6bd19ed1639a3223355c86d81`, branch `codex/pre-alpha-hardening`.
No gameplay, server code, architecture, dependency, workflow or production-default changes.
AGENTS.md and MASTER_PLAN.md remain unchanged against main. Previous hardening commits,
including `998b806ec26f0e25454fda7f7261d1914a52bcc9`, are ancestors of the candidate.
Local and remote main remain `d564ab785069047c97062368f42019856738d0c6`.

## Hosted CI visibility

Git SSH read/write access works, but does not authorize Actions API access. `gh auth status`
reports the stored account token invalid; `gh api user` returns 401. The private repository
Actions runs endpoint queried with the candidate head SHA returns 404. No run ID, logs,
conclusion or hosted success was obtained. A missing run cannot be inferred from this 404.

Reasonable alternative paths were checked: GitHub connector fetch/workflow tools were unavailable
(`Unknown tool`); Skyvern had no browser sessions or saved profiles; the remote-desktop connector
exposed this same VPS with the same invalid CLI credential. The existing browser belongs to a
separate active browser service, uses a private debugging pipe, and has no available control target.
Its profile/session was not copied or commandeered.

A GitHub CLI device authorization flow was initiated, selecting Skip for SSH-key upload, and the
owner was given GitHub's device URL/code. Authorization did not arrive during the work; the waiting CLI was stopped before finishing.
No password, token or browser credential was requested in chat. **One owner action:** run
`gh auth login --hostname github.com --git-protocol ssh --web` on this VPS,
select Skip for SSH-key upload, and approve its fresh code at <https://github.com/login/device>.
Then query the latest feature-branch SHA, inspect its actual hosted run, and fix genuine failures.
There is no evidence of a workflow/code failure to fix speculatively.

## Controlled production load

Same isolated deployment as the previous qualification: plain production bundles, password auth,
dev login disabled, local TLS reverse proxy at `https://127.0.0.1:4443`, private metrics, and scoped
non-owner PostgreSQL runtime credentials. Unrelated services on ports 80/443 were untouched.
No build or test suite ran alongside this stage. The existing committed production-load harness
performed real combat, ability use, inventory/vault transfers and marketplace purchases through
public HTTP/WebSocket routes. Fixture provisioning is operator-only before admission.

Declared gate remains at least 19.5 Hz, p95 RTT below 250 ms, no unexpected errors/disconnects,
bounded queues and capacity headroom. Five players failed the tick-rate gate; 10/20/30/50 were
therefore deliberately not attempted. A near miss is not a pass or a reason to lower the gate.

| Players           | Duration | Simulation | Skipped slots | RTT p50/p95/p99   | RT CPU cores | RT RSS   | Result                           |
| ----------------- | -------- | ---------- | ------------- | ----------------- | ------------ | -------- | -------------------------------- |
| 5                 | 180.04 s | 19.4405 Hz | 100           | 55 / 152 / 177 ms | 0.261        | 140.8 MB | FAIL                             |
| 10 / 20 / 30 / 50 | Not run  | —          | —             | —                 | —            | —        | Stopped after first failed stage |

Additional observations:

- 295 inventory transfers and five marketplace sales; 600 timed HTTP samples, p95 324.05 ms.
- Zero HTTP errors, disconnects, movement corrections or skipped HTTP cycles. Two expected
  `TARGET_DEAD` combat races, not protocol or infrastructure errors.
- DB probe p95/p99 23.43 / 42.23 ms; sampled tick gauge p95 13.26 ms; sampled checkpoint gauge
  p95 92.52 ms. Gauge samples are not a histogram of every tick or checkpoint.
- Pending outbound queue peak 12,466 bytes, socket queue peak zero. Aggregate application WS
  throughput 21.63 kB/s server-to-clients and 6.57 kB/s clients-to-server; excludes TLS/TCP overhead.
- 35 complete five-second event-loop windows: median window p95 19.45 ms, worst window p95
  38.99 ms, worst window p99 104.14 ms, maximum delay 322.44 ms. Histogram resolution is 10 ms;
  these are event-loop delays, not request RTT or pure CPU time.
- Host samples overlapping the workload: 90.34% average idle CPU, 1.08% average I/O wait,
  maximum run queue 14, zero reported steal and no swap activity. Sampling started after load;
  165 samples cover only the overlapping interval. Zero steal does not establish absence of
  hypervisor/scheduling interference.
- Cluster-wide WAL counter delta: 4,278 syncs, 25,119.70 ms total sync time, 5.87 ms mean.
  Includes startup/provisioning around the workload; no tail percentile or per-request attribution
  is inferred from these cumulative counters.
- Existing production gates passed again: password-only discovery, dev login 404, private metrics
  403, logout WebSocket disconnect and rejected revoked bearer token.

**Tested maximum this pass:** five concurrent players, with degradation.
**Recommended safe per-zone capacity:** not established; no tested size has demonstrated the
required headroom. Keep the existing five-connection ceiling for internal experiments only.
**Degradation point:** already present at five in this pass; earlier representative testing also
missed the gate at one player. This is not a measured higher-concurrency saturation threshold.

## Bottleneck investigation and attempted hosting adjustment

All API/realtime/proxy processes use normal priority, normal scheduling and all 12 CPUs. Timer
slack is 50 microseconds. Every ancestor cgroup was checked: no CPU quota, default CPU weight.
PostgreSQL keeps fsync and synchronous commit enabled. Neither durability nor authority was weakened.

A paired 30-second deadline-timer control, with no game or database calls, measured:

| Control                      | Hz      | Skipped slots | Deadline lateness p95/p99 | Event-loop p99 |
| ---------------------------- | ------- | ------------- | ------------------------- | -------------- |
| Default affinity             | 19.2639 | 22            | 30.60 / 93.01 ms          | 66.75 ms       |
| Pinned to lightly used CPU 9 | 18.7321 | 38            | 44.28 / 112.76 ms         | 80.22 ms       |

CPU pinning did not help and was not applied to the deployment. Previous kernel tracing showed
run-queue delay independent of the game. The current profile continues to implicate scheduling
jitter and awaited durable-checkpoint latency, rather than exhausted total CPU, memory, network
bandwidth, enemy AI or pathfinding. The exact physical-host cause remains unproven. A short timer
control is diagnostic evidence, not a certified host benchmark. No material game-code bottleneck
justified an optimization in this pass.

An asynchronous, non-overlapping, five-second event-loop observer was temporarily preloaded into
only our realtime process. It was removed afterwards and the plain production process restarted;
no permanent instrumentation or affinity changes remain. Measurements are loopback and cannot
establish public-internet/mobile latency.

**Required hosting action:** arrange a qualification window on intended hosting with predictable
CPU scheduling (reserved/dedicated CPU if necessary) and low-tail-latency durable PostgreSQL storage,
then repeat the same workload and gate. No expensive branded game host, extra RAM, broker or
architecture rewrite is justified by these measurements. More nominal cores alone are not evidence
of a fix. The present shared VPS has not demonstrated a stable qualifying baseline.

## Verification and stop condition

Sanitized measurements are in [evidence/merge-gates](evidence/merge-gates/). This pass changes only
documentation/evidence, so the already recorded complete verification of the identical code is not
rerun. Documentation receives formatting and diff checks. Neither hosted CI nor stable capacity is
certified. Main stays unchanged; no merge, external-player invitation or new gameplay work.
