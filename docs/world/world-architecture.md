# World architecture

Schemas: `packages/schemas/src/world.ts`. Content: `packages/game-data/src/content/world.ts`.
Simulation: `services/world`. Rendering: `apps/game-web/src/game/world-view.ts`.

## Hierarchy

```
World
 └ Region   (Greenvale)                content grouping: theme, level range, map
    └ Zone  (Greenvale Meadows)         one coordinate space, one simulation (unit of hosting)
       └ Chunk (cx, cz) 64 m × 64 m     unit of streaming (client) and interest (server)
          ├ terrain asset ref / ground colour
          ├ props (static scenery)
          └ spawn points (npc / enemy / pickup / resource_node) — server-only
```

- Coordinates in metres, Y up. Chunk `(cx,cz)` covers `[cx·size, (cx+1)·size)`.
- Zone kinds: `town, wilderness, cave, dungeon, raid, arena, housing`. `instanced: true` zones get
  a separate simulation per group (dungeons/instances — not implemented).
- `ZoneTransition` (trigger volume → target zone/position) models region transitions; not yet used.
- `environment.dayNightCycle` / `weatherProfileId` are hooks for later.
- Dynamic events, world bosses: `EnemyDefinition.isWorldBoss` exists; no event system yet. Basic enemies are simulated (see Enemies).

## Demo content (Greenvale Meadows)

One region, one zone, 4×4 chunks of 64 m (256 m square), authored in
`packages/game-data/src/content/world.ts`: Greenvale Village at the origin (safe zone r = 32 m,
houses, fences, Elder Maren, sword and ore pickups, respawn point), a waystone respawn point in the
south, a rock ridge in the east, forest in the north, and a seeded scatter of trees and rocks that
keeps roads, the village, spawn points and landmarks clear. Landmarks (village, Northwood Den,
Eastern Rocks, The Hollow, Old Waystone) appear on the minimap.

Cross-validation (registry) guarantees: spawn points inside their chunk and referencing existing
content; respawn points / default spawn not inside colliders; enemy spawns not inside colliders or
safe zones; every spawn group has at least `maxAlive` points and a valid respawn window.

## Collision and line of sight

Props get their collider from the shared prop-shape table (`content/props.ts`), which also sizes the
client's placeholder meshes; chunks may add explicit colliders. `CollisionWorld` (spatial hash) is
used by server movement validation, client prediction (same slide rule), enemy steering and combat
line of sight. Trees, rocks and buildings block sight; fences block movement only. ADR 0016.

## Enemies and population

Enemy spawn points either belong to a **spawn group** (`maxAlive`, `respawnMs {min,max}`,
`minPlayerDistance`) or respawn individually (`respawnMs`). Groups are refilled from the tick on
random free points with no player nearby — no per-entity timers. Greenvale has three wolf dens (2
alive each, 20–35 s) and a group of 4 roamer points (2 alive, 30–60 s); wolves wander within 5 m of
their point.

Per-enemy state machine each tick: **idle** (wander; aggro on proximity with line of sight) →
**engaged** (steer straight when clear, otherwise follow a cached A* path on the `NavGrid`; attack
only in range with LOS; leash at 30 m; give up if unreachable or stuck) → **returning** (evade: walk
home, reset health; snap home if stuck) or **dying → dead** (write-ahead kill record, corpse, slot
respawn at the recorded time; restored after restarts). See [combat](../gameplay/combat.md).

## Streaming (client)

`WorldView` builds/disposes per chunk; currently loads all chunks of the zone at once. Next step:
load chunks within N of the camera's chunk (`chunksInRadius`), dispose far ones, load GLB assets
via asset containers, add LOD.

## Interest management (server)

Players receive entities within 2 chunks of their own chunk (`ZoneSimulation`). Entering/leaving
range produces `entity.spawn` / `entity.despawn`. Movement is batched per tick in `world.moves`.

## Scaling path

1. Today: all zones in one realtime process.
2. Several realtime processes, each owning a set of zones (`REALTIME_ZONES`), with a registry for
   routing players to the right process (needs Redis or similar).
3. Very large zones: split simulation by chunk regions with hand-off at borders.
