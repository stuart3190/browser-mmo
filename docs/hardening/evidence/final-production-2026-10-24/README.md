# Final production qualification — 2026-10-24

Runtime candidate a973ae5 (integrated as69c9483) passes all28 built-production password/TLS browser
assertions in qWvlw8:13 friends and15 guild checks. Every login also asserts the3D engine is not
requested before the login form. Development authentication, public private-route access and the
client development hook are absent. Both classes, relog, read receipts, guild consent/roles/chat,
scrollback, landscape composer, transfer/leave/disband pass. No credentials or TLS keys archived.

The subsequent **quiet unprofiled five-player120-second load FAILS** the declared19.5Hz gate:

| Measurement                     |   Result |    Gate |
| ------------------------------- | -------: | ------: |
| Simulation                      | 19.123Hz | ≥19.5Hz |
| RTT p95                         |    162ms |  <250ms |
| HTTP p95                        |  231.8ms |  <500ms |
| Unexpected protocol/HTTP errors |      0/0 |     0/0 |
| Disconnects                     |        0 |       0 |

All5 actors are alive at the end, with five normal respawn requests and eight durable rewarded kills.
There are194 inventory writes, five market sales,64 direct messages/60 read receipts,64 guild
messages and194 guild history reads. Guild consent and revoked-session/bearer rejection pass.
One HTTP cycle was skipped while its previous cycle remained in flight. Report remains `ok:false`.
No browser, build or test process ran during measurement. Recorded RT CPU is0.296 cores and RSS
183.6MB; this does not establish why the host misses deadlines. Earlier timer-only scheduler and
WAL-tail diagnostics remain relevant; do not weaken durability, fake ticks or raise admission.

All78 combined development-browser assertions passed separately in vag71f. Source/backend checks,
20-table populated restore and hosted CI are recorded in adjacent archives. Physical-phone and
external-host recovery/capacity remain unqualified. Existing staging/backup destinations were
requested from the owner. No public deployment, production DB mutation or paid provisioning.

Immutable candidate f64d084 is prepared under `/srv/brokenodyssey/releases/`. Four production builds,
all-chunk debug guard and Caddy validation pass. Independent manifest/checksum and live PID/start-time/
symlink/readiness checks pass; see preparation.json. Live2c47b27 was not changed or restarted.
Hosted CI40101349993 for runtime merge69c9483 passes. Later commits only record evidence/documentation.
