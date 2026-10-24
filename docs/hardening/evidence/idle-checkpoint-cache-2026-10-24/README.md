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

The built production TLS/password and quiet five-player workload are pending. No production
services/data, admission limits or immutable releases changed. This is not release certification.
