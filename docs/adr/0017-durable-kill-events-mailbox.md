# 0017 — Write-ahead kill events and mailbox overflow loot

Status: Accepted · Date: 2026-10-04 · Supersedes the in-memory reward queue part of ADR 0015

## Context

ADR 0015 kept kill events in memory until `awardKill` committed: a crash in that window lost the
reward, a crash could also respawn an enemy whose death had been announced, and loot that did not
fit the bags was discarded ("lost items").

## Decision

1. **Write-ahead death.** At 0 HP an enemy enters `dying` (untargetable, harmless, not yet
   announced). The gateway writes a `kill_events` row (kill id, zone, enemy, spawn point, group,
   credited character, died_at, respawn_at; status `pending`) and only then calls
   `ZoneSimulation.confirmKill`, which announces the death and starts the corpse/respawn cycle.
   Recording is idempotent (`ON CONFLICT DO NOTHING`) and retried with backoff.
2. **Exactly-once processing from the outbox.** `processKillEvent` locks the row with
   `FOR UPDATE SKIP LOCKED`, applies the reward (`awardKillInTx`) and marks it `rewarded` in the
   same transaction. Transient failures increment `attempts` and push `next_attempt_at` back
   (exponential, capped at 5 min); permanently unrewardable events (character deleted, unknown
   enemy) become `void`. `kill_rewards` and item `source_ref` uniqueness stay as a second guard.
3. **Recovery.** On start, each zone is built with the not-yet-elapsed respawn slots from
   `kill_events` (`restoredRespawns`), then due pending events are processed; a periodic sweep
   (5 s) repeats this for this node's zones. Concurrent nodes are safe because of SKIP LOCKED.
4. **Mailbox container kind** ("Recovered loot", capacity 200, created with characters and lazily
   for older ones). A drop that does not fit the bags is delivered there with full provenance;
   players can take items out but never place items in (`canPlaceInContainerKind`). If the mailbox
   is full the whole reward transaction fails and the kill stays pending (retried), so loot is never
   destroyed.

Crash outcomes: before the record → the death never happened (no reward; the enemy is alive after
restart). After the record → recovery rewards exactly once and the slot respawns at its persisted
time. After the reward commit → nothing is awarded again. Covered by
`services/realtime/test/durable-kills.test.ts` (fault hooks + `simulateCrash()`).

## Alternatives considered

- Awarding inside the same transaction as recording: couples the simulation's death to the full
  reward latency and fails the death when, e.g., the mailbox is full.
- Corpse looting (world loot containers): good gameplay later, but needs looting UI, ownership
  windows and expiry; the mailbox guarantees safety now and corpse looting can feed it later.
- Deterministic (kill-seeded) loot rolls: not needed for exactly-once because uncommitted rolls are
  never shown; can be added if replayable rolls are wanted.

## Consequences

- A death becomes visible one DB round trip later (typically a few ms; longer if the DB is down,
  during which the enemy stays `dying`).
- If the mailbox is full, XP for that kill is delayed with the loot (both retried together).
- `kill_events` grows by one row per kill; it needs a retention job (rewarded rows older than the
  longest respawn window can be archived) before production scale.
