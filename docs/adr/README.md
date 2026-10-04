# Architecture Decision Records

One file per significant technical decision. ADRs are **append-only**: to change a decision, write a
new ADR that supersedes the old one and mark the old one `Superseded by NNNN`. Every ADR is also
summarised in [`docs/DECISIONS.md`](../DECISIONS.md), which is the log agents read first.

| ADR                                                   | Title                                                                                           | Status                                     |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------ |
| [0001](0001-monorepo-pnpm-turborepo.md)               | Monorepo with pnpm workspaces + Turborepo                                                       | Accepted                                   |
| [0002](0002-babylonjs-client-engine.md)               | Babylon.js for the browser client                                                               | Accepted                                   |
| [0003](0003-postgresql-drizzle.md)                    | PostgreSQL + Drizzle ORM                                                                        | Accepted                                   |
| [0004](0004-modular-monolith.md)                      | Modular monolith: shared domain package, thin service hosts                                     | Accepted                                   |
| [0005](0005-realtime-websocket-protocol.md)           | WebSocket (`ws`) with a typed, versioned JSON protocol                                          | Accepted                                   |
| [0006](0006-item-location-invariant.md)               | Single-row item location (no item in two places)                                                | Accepted                                   |
| [0007](0007-stackable-items.md)                       | Stackable items are instances with a quantity                                                   | Accepted                                   |
| [0008](0008-auth-sessions.md)                         | AuthProvider abstraction + opaque DB sessions                                                   | Accepted                                   |
| [0009](0009-uuidv7-ids.md)                            | UUIDv7 identifiers                                                                              | Accepted                                   |
| [0010](0010-fastify-http.md)                          | Fastify for the HTTP API                                                                        | Accepted                                   |
| [0011](0011-redis-deferred.md)                        | Redis deferred until it solves a real problem                                                   | Accepted                                   |
| [0012](0012-source-packages-bundled-services.md)      | Workspace packages ship TS source; services are bundled                                         | Accepted                                   |
| [0013](0013-react-game-ui.md)                         | React (DOM overlay) for the in-game UI                                                          | Accepted                                   |
| [0014](0014-postgres-change-feed.md)                  | PostgreSQL LISTEN/NOTIFY change feed for realtime pushes                                        | Accepted                                   |
| [0015](0015-server-authoritative-combat.md)           | Server-authoritative combat in the zone tick, exactly-once rewards, reconnect linger            | Accepted (reward queue superseded by 0017) |
| [0016](0016-world-collision-navigation-population.md) | Data-driven collision, grid navigation, spawn-group population                                  | Accepted                                   |
| [0019](0019-class-abilities.md)                       | Class abilities in the zone simulation, cooldown-only, persisted cooldowns                      | Accepted                                   |
| [0018](0018-quest-foundation.md)                      | Quest foundation: data-driven definitions, derived collect progress, single-transaction turn-in | Accepted                                   |
| [0017](0017-durable-kill-events-mailbox.md)           | Write-ahead kill events (outbox) and mailbox overflow loot                                      | Accepted                                   |

Template:

```markdown
# NNNN — Title

Status: Proposed | Accepted | Superseded by NNNN
Date: YYYY-MM-DD

## Context

## Decision

## Alternatives considered

## Consequences
```
