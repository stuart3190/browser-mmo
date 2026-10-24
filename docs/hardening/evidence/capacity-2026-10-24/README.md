# Local capacity qualification, 2026-10-24

The first extended five-player, 120-second workload **failed the performance gate**. It used a
fresh disposable PostgreSQL 17 database and actual production bundles behind separate loopback
HTTPS/WSS ingress, with password authentication and 25 hosted zones. No production database,
service, release or admission setting was changed. This is not an internet or physical-device test.

The workload creates operator equipment/spawn fixtures before admission. Measured movement,
combat, inventory moves, marketplace sales, friendship requests and direct messaging use public
HTTP/WS paths. These fixtures do not prove earned progression.

`five-contended.json` preserves the failed report from
`/tmp/brokenodyssey-qualification.yzUdWY`: zero HTTP/protocol errors or disconnects; 195 inventory
writes, five sales, 65 messages and 60 recipient read receipts. Simulation 17.99 Hz, p95 RTT 704 ms,
p95 HTTP 349.5 ms. Two concurrent software-rendered earned-journey browsers consumed about eight
CPU cores on the 12-core host, so contention is a hypothesis, not a proven explanation. The
qualification correctly exited 1. Do not increase production admission from this result.

The driver now records `ok:false` before asserting explicit gates, and only rewrites `ok:true`
after they pass. Gates require no workload errors/disconnects, real combat and economy activity,
simulation at least 19 Hz, p95 local RTT below 250 ms and p95 HTTP below 500 ms. The first archived
report predates the explicit `ok` field; its failed process exit is authoritative.

Repeat results will be recorded here. No successful capacity or public-scale claim yet.

Second run, `five-repeat.json` (`/tmp/brokenodyssey-qualification.zteVOP`), also failed: 19.02 Hz
passes the cadence gate, but 324 ms p95 RTT fails latency. Transactions/messages again completed
without errors or disconnects. One journey renderer used DPR 0.5 this time; another still ran at
full resolution. The lower load improved measurements but does not isolate causation. A quiet-host
run remains required before increasing even the disposable fixture's player count.

Third run, `five-quiet.json` (`/tmp/brokenodyssey-qualification.GYaFFV`), ran with both journey
browsers closed. It still failed: 18.80 Hz, p95 RTT 181 ms and p95 HTTP 271 ms. Five normal respawns kept
all five actors alive at the end; seven durable kills, 195 inventory writes, five sales and 65 messages
completed. Two `TARGET_DEAD` rejections occurred when another actor killed an in-flight attack's
target. The driver now reports this specific normal multiplayer race in `expectedRejections`;
other protocol errors still fail. The simulation gate remains red independently of that correction.
Host observation after the run showed significant I/O wait; the cause is not yet isolated.

`QUAL_CPU_PROFILE=1` enables a private realtime CPU profile in the disposable production directory
for diagnosis. Profiling is not itself performance qualification. Admission remains unchanged.
