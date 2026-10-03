# 0001 — Monorepo with pnpm workspaces + Turborepo

Status: Accepted · Date: 2026-10-03

## Context

The browser game, backend services, admin tool and a future mobile app must share schemas, game
data and protocol definitions. Many agents will work in the repo over years.

## Decision

One repository, pnpm workspaces (`apps/*`, `services/*`, `packages/*`), Turborepo for task
orchestration/caching (`build`, `typecheck`, `test`, `test:integration`). Strict TypeScript 6 with a
single `tsconfig.base.json`; one root ESLint flat config; Prettier.

## Alternatives considered

- npm/yarn workspaces: pnpm's strict `node_modules` catches undeclared dependencies.
- Nx: more powerful, more to learn; Turborepo is enough at this size.
- Polyrepo: shared schemas would drift between repos.

## Consequences

Cross-package refactors are atomic. Each package must declare every dependency it imports.
TypeScript 7 (native) is not used yet because `typescript-eslint` supports `<6.1`.
