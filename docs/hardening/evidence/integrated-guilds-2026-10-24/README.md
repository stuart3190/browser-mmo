# Integrated guild/backend qualification — 2026-10-24

Committed35ee149 passed hosted CI40098308166. Isolated OanPjT passed format/lint/types,
236 unit tests,117 domain/75 realtime/12 HTTP integration tests, four production builds with
no development hook, assets/content validation and20-table populated historical upgrade/restore.
The negative occupied-database restore was correctly refused. Own temporary PostgreSQL only.

The aggregate qualifier then FAILED before the first trade login form appeared. Screenshot and
count summary retained; raw logs remain `/tmp/brokenodyssey-qualification.OanPjT`. It is not a full
browser pass. Source lacked network diagnostics for that failure, so no cause is asserted.
Startup recovery and sanitized request diagnostics were added afterward; final browser proof is
separate. No production release, database or admission setting changed.
