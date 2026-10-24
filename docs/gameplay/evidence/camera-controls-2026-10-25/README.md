# Camera controls — 2026-10-25

Twenty fresh-character browser checks pass in `verified-controls/`: desktop mouse rotation,
wheel zoom and limits; touch rotation and inward/outward pinch; unchanged player position;
44px Settings reset, stable starting angle/distance after reset, and no page exceptions.
Desktop and portrait screenshots reviewed. Typechecking, lint and build pass. The production
bundle check confirms the development observation hook is absent.

The new gameplay control is **Reset camera view** in Settings. Existing orbit/zoom behavior is
preserved. Settings also explains two-finger zoom. No movement or game-state command is sent.

Initial pinch failures were a driver configuration error: Playwright's hasTouch context reported
navigator.maxTouchPoints=1 (independently confirmed), while CDP sent two contacts. Engine input
inspection showed one tracked contact. The driver now configures five supported touch contacts
before boot and asserts multi-touch capability. Failed attempts and diagnostic snapshots remain
in initial-pinch-failure, pinch-diagnostic, natural-pinch-attempt and input-diagnostic. Experimental
natural zoom and canvas CSS changes were removed; no engine behavior fix is claimed.

These are functional gameplay tests using isolated ordinary characters. No performance or capacity
work, production changes, deployment validation or physical-phone signoff was performed.
