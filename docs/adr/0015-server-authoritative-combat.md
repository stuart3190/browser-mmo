# 0015 — Server-authoritative combat in the zone tick, exactly-once rewards, reconnect linger

Status: Accepted (decision 2's in-memory reward queue superseded by [0017](0017-durable-kill-events-mailbox.md)) · Date: 2026-10-03

## Context

The first combat loop must be fully server-authoritative, extensible, and must never duplicate
XP or items, while staying within the existing modular-monolith architecture (ADR 0004).

## Decision

1. **Combat runs inside `ZoneSimulation.step()`** at the existing 20 Hz tick. Swing timers, enemy AI
   (idle → engaged → returning/evade, dead → corpse → respawn) and regen are state checked each tick;
   there are no per-entity timers. Formulas are pure functions in `@mmo/game-data/rules/combat.ts`;
   all numbers are data. Clients send only `target.set`, `combat.attack`, `combat.respawn`.
2. **Rewards are a separate, persisted step.** The simulation emits kill events (credited to the
   first character that damaged the enemy); the gateway persists each with `awardKill` in one
   transaction (XP/level, loot through `grantItemInTx`, gold through the ledger) guarded by the
   `kill_rewards (kill_id, character_id)` primary key, retrying transient failures.
3. **Gear/level feed back through the profile**: the gateway recomputes `getCombatProfile` when the
   change feed reports item changes for a character, and after level-ups.
4. **Reconnect linger**: a closed connection leaves its character in the world for `lingerMs`
   (10 s) and a reconnect re-attaches to it. Health is persisted on leave and periodically.

## Alternatives considered

- Client-predicted hits / client timestamps for cooldowns: rejected (cheatable).
- Per-entity `setTimeout` timers: unbounded timers, harder to reason about ordering.
- Awarding rewards inside the simulation: the simulation must stay I/O-free and testable.
- Removing the character immediately on disconnect: enables "combat logging" and loses fight state.

## Consequences

Combat cost scales with entities × players per tick (fine at current sizes; spatial indexing will
be needed for crowded zones). Kill events live in memory until persisted — a process crash between
death and persistence loses that reward (documented known issue). Linger keeps a disconnected
character vulnerable for 10 s, by design.
