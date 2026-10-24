# Idle checkpoint encoding qualification — 2026-10-24

Full isolated run `lk7ghT` passes format/lint/types, 241 unit tests, 204 integration tests,
four production builds/debug guard, content/assets, populated upgrade/restore and all 78 browser
assertions. The first run `qiceb9` failed a boss recovery test whose unseeded RNG could legally miss;
the test now fixes the hit roll. Both raw runs remain under `/tmp/brokenodyssey-qualification.*`.

The timer-only control reached 19.7996 Hz; it does not establish game capacity. The encoding
benchmark uses the same 26 simulations for 100 rounds each. `legacy` uses the recursive encoder,
`cached` uses idle reuse, and `fresh` disables reuse by exposing the debug entity view. All three
produce the same byte count. The byte-oracle tests additionally verify exact content equality,
external party/effect mutations, resource changes, pending death recovery and escaped references.

Built production run `XMQkkz` passes all 28 TLS/password browser assertions and authentication,
private-route, guild-consent and revocation checks. Its quiet unprofiled five-player/120 s workload
**FAILS**: 19.2906 Hz (required ≥19.5), RTT p95 395 ms (required <250). HTTP p95 177.6 ms passes.
CPU 0.165 cores, RSS 150.7 MB, sampled tick p95 9.75 ms, checkpoint p95 208.65 ms. There were zero
unexpected protocol/HTTP errors or disconnects, all five players were alive at the end, four durable
rewarded kills, 195 inventory writes, five sales, 65 direct and 65 guild messages. The earlier
baseline used 0.296 cores and sampled tick p95 42.8 ms, but these sequential runs cannot isolate
host variability. The saved report remains `ok:false`; latency and capacity are not certified.

Runtime commit `9567e0e` also passes hosted CI run `40104670712`. No production
services/data, admission limits or immutable releases changed. This is not release certification.
