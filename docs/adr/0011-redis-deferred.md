# 0011 — Redis deferred until it solves a real problem

Status: Accepted · Date: 2026-10-03

## Decision

Redis is in the preferred stack but is **not used yet**. Nothing in the current foundation needs
it: one realtime process, sessions in PostgreSQL, rate limits per connection in memory.

## Planned uses (each will get its own ADR)

- Pub/sub between realtime nodes (cross-zone chat, whispers, guild chat, presence).
- Zone ownership registry / routing when several realtime nodes exist.
- Session cache, global rate limits, marketplace browse cache, job queues (expiry sweeps).

## Consequences

Local development needs only Node + PostgreSQL. Do not add Redis for convenience; add it with
the feature that requires it.
