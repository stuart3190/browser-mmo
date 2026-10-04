# 0016 — Data-driven world collision, grid navigation and spawn-group population

Status: Accepted · Date: 2026-10-04

## Context

The world needed obstacles that really block movement and sight, enemies that path around them,
and many enemies spread across the zone — without hard-coding geometry against specific visuals,
without per-entity timers, and in a way that later regions, towns and dungeons can reuse.

## Decision

1. **One shape table** (`@mmo/game-data/content/props.ts`) defines, per prop kind, both the
   placeholder visual (client) and the gameplay collider (circle or oriented box, with a
   `blocksSight` flag). Chunks may also carry explicit `colliders` (walls, cliffs) that the client
   draws as plain geometry. Changing a prop size changes what you see and what blocks you together.
2. **`CollisionWorld`** (pure, in `@mmo/game-data/rules/collision.ts`, cached per zone by the
   registry) is a uniform spatial hash over all colliders with `overlaps`, `sweepBlocked`,
   `hasLineOfSight`, `slide` and `nearestFree`. The **same** instance type is used by server movement
   validation, combat LOS, enemy steering and client movement prediction (identical slide rule).
3. **`NavGrid`** (`services/world/src/navigation.ts`): a 1 m walkability grid derived lazily from the
   collision world for the enemy radius, 8-connected A* without corner cutting, path smoothing with
   swept checks, bounded expansions. Enemies move straight when the swept path is clear, otherwise
   follow a cached path (re-planned at most every 750 ms or when the goal moves > 2 m). No progress
   for 5–6 s, or no path, makes them give up (evade/return, snapping home as a last resort).
4. **Spawn groups** (`WorldZone.spawnGroups`, `SpawnPoint.groupId`): each group has `maxAlive`,
   a randomised respawn window and a minimum player distance; free capacity is filled from random
   unoccupied points every tick. Validation rejects enemy points inside safe zones or colliders.
5. Server validation rejects moves that end inside geometry or sweep through it (`move.correction`
   reason `blocked`); idle aggro and every attack need line of sight.

## Alternatives considered

- Physics engine (Havok/Rapier) on server and client: heavyweight, nondeterministic across
  platforms, overkill for 2D ground-plane movement today.
- Navmesh generation (Recast): better for large complex terrain; deferred until zones are big or
  multi-level. `NavGrid` sits behind a small interface (`findPath`) so it can be swapped.
- Hand-placed, per-enemy spawn points only: does not scale to population control.

## Consequences

- Collision is 2D (XZ) with simple primitives; terrain height, bridges and multi-level interiors
  will need an extension (height fields / layered grids).
- The nav grid is per zone and rebuilt only when the zone loads; dynamic obstacles (doors) are not
  supported yet.
- Client prediction and server validation agree on the slide rule, so walking into walls produces
  no corrections; the server remains the authority.
