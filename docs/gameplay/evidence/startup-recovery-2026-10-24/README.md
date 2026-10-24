# Startup recovery — 2026-10-24

Six Chromium checks pass in 1BU62M: blocked bootstrap, blocked application module, login before
engine import, failed game module, explicit reload into the existing character, and no uncaught
exceptions. These intentionally inject network failures; no automatic reload or hidden retry.
Screenshots accompany the proof. Typechecking, lint and ten frontend tests pass.

The release guard now checks every JavaScript chunk, including lazy game chunks. It correctly
rejected a local build that inherited NODE_ENV=development; an explicit production rebuild passes.
The engine chunk originally absorbed Vite's preload helper and was still eagerly imported. Explicit
engine-only chunk grouping preserves the separate small helper; built HTML no longer preloads the
engine. Production password-browser entry now asserts no engine request before the login form.
That production check is pending, not inferred from development-mode behavior.

The earlier integrated35ee149 run OanPjT passed all backend checks/builds and20-table restore but
failed before the first trade login form. The blank-page failure lacked network diagnostics; it is
not proof of a specific cause. Trading now retains sanitized failed request paths. No public change.
