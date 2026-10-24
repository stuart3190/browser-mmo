# Checkpoint encoding qualification — 2026-10-24

World implementation 843919d preserves byte-for-byte version-2 recovery images. Two additional
compatibility tests cover all 26 authored zones and live combat/party/cooldown/effect state. Relative
26-zone benchmark: 100 rounds, identical 24,941,600 bytes, legacy 463 ms versus new encoder 169 ms.
This is a relative serialization benchmark, not player-capacity certification.

Full code checks in 05XEXU pass: format/lint/types, 236 unit tests, 109 domain / 73 realtime / 11 HTTP
integration tests, four builds/debug-hook exclusion, assets/content and 16-table populated upgrade/
restore. Trade 11 and market 8 browser checks pass. The aggregate then fails at third-player entry
in the chat suite. EixVP0 repeats the same 30-second timeout. Diagnostic oyp0D3 records game socket
open at 31.16 seconds, auth at 31.28 seconds and vitals at 32.41 seconds; no page/network errors.
A 60-second wait allows entry, but party acceptance is not observed. Failure retained. Three
SwiftShader worlds are now tested at DPR0.5 with unchanged CSS viewports and gameplay rules;
DGERJ8 passes all ten chat, twelve friends and ten onboarding checks. These are staged browser
proofs after two aggregate attempts failed; a combined final-source run is still required.

Quiet profiled five-player / 120-second run 717Yig passes the 13 built-production TLS/password
browser assertions, then FAILS capacity: 19.005 Hz, RTT p95 473 ms, HTTP p95 217 ms. Zero unexpected
protocol/HTTP errors or disconnects; 195 economy writes, five sales, 65 messages and 60 read receipts.
Unused local preview servers were stopped, and no browser/build/test job ran during measurement.
Measured last-122-second profile self samples include idle 91.56s, checkpoint 7.60s, outer capture
3.83s and native writev 3.82s; asynchronous waiting is not attributed to commit JavaScript. The
last five vmstat samples show 82–88% idle and 1–5% I/O wait, not overall CPU/RAM saturation.
Do not infer a causal capacity gain from this result or relax durability/publication rules.

The earlier release document declares a stricter 19.5 Hz gate; the extended guild workload restores
that threshold. This sample fails either gate set because latency exceeds 250 ms. No live admission
changes, hardware purchases or public deployment. Raw profiles/passwords/keys remain private.
