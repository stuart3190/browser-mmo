# 0012 — Workspace packages ship TS source; services are bundled

Status: Accepted · Date: 2026-10-03

## Decision

Internal `@mmo/*` packages export TypeScript source (`"exports": "./src/index.ts"`); there is no
per-package build step. Vite compiles them for the browser apps; `tsx` runs services in dev;
`tsup` bundles each service (inlining `@mmo/*`, externalising npm deps) into `dist/main.js`.

## Why

No build-order bugs, no stale `dist` folders, instant cross-package navigation and refactoring.

## Consequences

Packages must be written in TS that every consumer's toolchain understands (no TS-only runtime
features like `enum`/namespaces; use `as const` objects). Typecheck runs per package against
dependency sources.
