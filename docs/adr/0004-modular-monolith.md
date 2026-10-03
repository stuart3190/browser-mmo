# 0004 — Modular monolith: shared domain package, thin service hosts

Status: Accepted · Date: 2026-10-03

## Context

The spec asks for room to split into services later but warns against premature microservices.

## Decision

All business rules live in transport-agnostic packages (`@mmo/domain` for persistence-backed
rules, `@mmo/game-data` for pure rules). Deployable processes are thin hosts:

- `services/api` — HTTP (Fastify) over `@mmo/domain`.
- `services/realtime` — WebSocket gateway; **hosts** zone simulations in-process.
- `services/world` — the zone simulation library (`@mmo/world`). Pure logic, no I/O. Today it runs
  inside the realtime process; it can become its own process later without rewriting.

Both API and realtime talk to the same PostgreSQL. There is no inter-service RPC yet.

## Alternatives considered

Separate API/realtime/world/inventory/marketplace microservices now (operational cost with no
benefit at this scale); a single process for everything (blocks independent scaling of realtime).

## Consequences

Any rule (e.g. "can this item move to the account vault?") exists exactly once. Splitting a
service later means moving a host, not rewriting logic. Running multiple realtime processes for the
same zone is **not** supported yet (see realtime.md, Known Issues).
