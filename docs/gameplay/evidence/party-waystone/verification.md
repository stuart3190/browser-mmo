# Verification — 2026-10-04

Agent: Codex. Base main: `e1b48acf8eaab44607c6143e64be6c61d2f72b9a`.
Party stage: `2f3aaeab5169d628c750bcf00a1b101e46364a84`.
Final Waystone/proof stage: the commit containing this file.

- Repository formatting and lint: pass.
- All workspace and script typechecks: pass.
- Unit tests: 128 pass (world 45, game data 48, client 2, other packages 33).
- PostgreSQL integration cases: 125 pass across full suite + targeted correction (domain 60,
  realtime 57, API 8). Disposable databases on local PostgreSQL port 55439, separate from preview.
- Four production builds and development-debug-artifact rejection check: pass.
- Populated preview checkpoint migration: every field except declared content hash preserved.
- Browser playthroughs and screenshots: see results.json. Two real clients for the hunt, then
  emulated phone touch controls; full new Waystone journey driven through UI on an emulated phone.

The initial full command stopped on two test typing mistakes (Node-only hash import in a browser
package, and use of GameData's private constructor). Both were corrected and verification resumed
from the failed typecheck phase. Realtime's process-crash afterRecord fixture then timed out before
its crash hook: its injected weapon could be overwritten by incomplete admission's equipment
refresh. Waiting for character.progress completes admission before injection. The other 56 realtime
cases passed, and the failed case passed its targeted rerun. Domain verification and builds then
completed. No runtime guard or assertion was relaxed to obtain a pass; passing expensive phases
were not rerun unnecessarily.

This is local code/gameplay verification, not hosted Actions success or physical Android testing.
