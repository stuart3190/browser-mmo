# 0018 — Quest foundation: data-driven definitions, derived collect progress, single-transaction turn-in

Status: Accepted · Date: 2026-10-04

## Context

The first quest (kill wolves, collect pelts, turn in at Elder Maren) must be server-authoritative,
persistent, exactly-once for progress and rewards, and a base for later quests — without a general
quest engine yet.

## Decision

1. Definitions stay in game data (validated); per-character state is one `character_quests` row
   with only `active` / `completed` stored. Availability and "ready to turn in" are derived by pure
   rules shared by domain and tests.
2. Kill progress is applied inside the existing exactly-once kill-reward transaction (no second
   kill path).
3. Collect progress is derived from authoritative inventory (bags + Recovered loot, unlocked), not
   stored; consumption happens only at turn-in.
4. Turn-in is one transaction (consume → XP → currency → items → complete) guarded by row locks, a
   versioned status update and unique reward `source_ref`s.
5. NPC interaction and quest actions go through the realtime gateway so the server can validate the
   NPC entity and the player's range from the zone simulation; the domain validates the rest.

## Alternatives considered

- Counting collected items on acquisition events: needs a second exactly-once ledger and drifts
  when items are moved, sold or vaulted.
- A generic event-sourced quest engine: premature for one quest.
- Quest actions over HTTP: the API has no authoritative player position for range checks.

## Consequences

- Collect objectives cannot require items that are consumed elsewhere earlier (they are re-checked
  at turn-in); a player who sells pelts loses progress (intended).
- A full Recovered loot box blocks the turn-in (nothing lost; the player must make room).
- Repeatable quests will need either a completion counter or per-instance rows (schema decision
  deferred).
