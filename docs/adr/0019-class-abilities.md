# 0019 — Class abilities executed in the zone simulation, cooldown-only, persisted cooldowns

Status: Accepted · Date: 2026-10-04

## Context

Warrior and Mage need distinct, server-authoritative abilities with cooldowns and level unlocks,
using the existing stats, targeting and combat pipeline, without building resources, effects,
talents or every class.

## Decision

1. Abilities are data (`AbilityDefinition` with owning class, unlock level, range, cooldown,
   `damage` {school, base, weaponMultiplier, stat scaling}, `autoAttack`, icon/visual placeholders).
   A class's bar is its `baseAbilityIds`; `playable` gates character creation.
2. Abilities execute inside `ZoneSimulation` (same tick world as auto-attack): validation and
   outcome are synchronous on one thread, so a request can never run twice or race another;
   kills go through the existing write-ahead kill pipeline.
3. Pure rules in `@mmo/game-data` (availability, cooldown, damage) shared by server and client
   display. Physical damage uses armour; magic ignores it (no resistances yet).
4. Cooldowns use only the server clock, plus a 1 s global cooldown. Running cooldowns are stored as
   a small jsonb map on `characters` when leaving the world and restored on join (no history rows).
5. No resource system: cooldowns pace combat for now; `resource` stays a data field.

## Alternatives considered

- Client-side cooldown timers / client damage: rejected (cheatable).
- A cooldown table with one row per use: unnecessary history; a map on the character is enough.
- Mana/rage now: not needed for two abilities per class; adds regeneration and UI for no gameplay gain yet.

## Consequences

- Only instant, single-target, hostile abilities are supported; casts, channels, AoE, heals,
  buffs/debuffs need the effect grammar later (validation rejects them today).
- A server crash loses cooldowns that were not yet saved (at most the longest cooldown, 12 s).
