# Companion app (placeholder)

**Nothing is built here yet, on purpose.** This directory reserves the place for the future mobile
companion app and links to its requirements.

- Requirements and API needs: [`docs/mobile/companion-app.md`](../../docs/mobile/companion-app.md)
- It will use the same HTTP API (`/v1/...`), the same Zod schemas (`@mmo/schemas`) and the same
  realtime protocol (`@mmo/networking`) as the browser game. The backend must never assume the
  browser is the only client; sessions already carry a `clientKind` (`companion_mobile`).

When work starts, record the framework decision (e.g. React Native/Expo vs. native) in
`docs/adr/` and `docs/DECISIONS.md` first.
