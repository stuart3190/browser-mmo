# Built production profile — 2026-10-24

Codex, source gameplay checkpoint1561e42 plus the new qualification scripts. Full evidence in
/tmp/brokenodyssey-qualification.SvMhjc. No public deployment or production data access.

`bash scripts/qualify-local.sh --production` creates its own PostgreSQL cluster and password
accounts, builds actual production bundles with HTTPS/WSS endpoints, and starts built API/realtime
behind a separate loopback Caddy process. A one-day localhost certificate is used. Curl/Node
validate it as an explicit test CA; Playwright permits the self-signed local certificate.

- Password is the only advertised provider; POST development login404; public admin/metrics404.
- Thirteen desktop/touch browser assertions pass: create Warrior/Mage via password UI, absent
  development hook, friends/acceptance, literal private messages/read state, fresh login,
  block/unblock/renewed consent and responsive layouts. Zero browser exceptions. Desktop screenshot
  reviewed. Phone emulation is not physical-device or capacity evidence.
- Production build/debug-hook guard, script typecheck and shell syntax checks pass.
- Runner stops only its own processes/cluster on completion. Credential and key files remain in
  the private temporary proof directory, never copied into the repository evidence.

This complements the full1561e42 aggregate/four-suite qualification. It does not cover later
inventory presentation, long earned journeys, production capacity or off-host recovery.
