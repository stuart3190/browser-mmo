# 0013 — React (DOM overlay) for the in-game UI

Status: Accepted · Date: 2026-10-03 · Resolves the "Game HUD/UI framework" open question

## Context

The inventory/equipment milestone needs real UI: slot grids, tooltips, comparison, windows, and
it must later work on touch/mobile layouts and be restyled. The foundation HUD was plain DOM.

## Decision

The in-game UI is **React 19 rendered into a DOM overlay** above the Babylon canvas
(`apps/game-web/src/ui`). The 3D loop never re-renders React; React subscribes to a plain
`GameState` store (`useSyncExternalStore`) that is fed only by server messages and HTTP
responses. All non-visual logic (item reconciliation, equip targeting, comparisons, requirement
evaluation) lives framework-free in `@mmo/ui` so a future mobile client can reuse it.

## Alternatives considered

- Babylon GUI (canvas-rendered): poor text/accessibility, hard to make responsive, harder to style.
- Plain DOM: fine for a HUD, unmanageable for nested windows/tooltips.
- Preact/Solid: smaller/faster, but React is already used by the admin app and is the most likely
  basis for the companion app (React Native); one UI stack across apps wins for now.

## Consequences

Measured: the main (non-engine) game chunk grew from ~44 KB to ~181 KB gzip (React + UI code); the Babylon chunk is unchanged and still dominant. Not yet analysed or split. Responsiveness is CSS:
floating windows on desktop, bottom sheets and 44px+ targets on narrow/touch screens; every
action is reachable by tap (details sheet), hover tooltips are a desktop-only enhancement.
