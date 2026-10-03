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

## Demo content

One region, one zone, 2×2 chunks (128 m square): an NPC (Elder Maren), two pickup spawn points
(Iron Longsword, respawn 20 s; Copper Ore ×3, respawn 15 s), placeholder trees/rocks/building/fence.
Cross-validation guarantees spawn points lie inside their chunk and reference existing content.

## Enemies

Enemy spawn points (`kind: 'enemy'`) spawn combatants defined by `EnemyDefinition.combat`
(damage, attack speed/range, aggro/leash ranges, move speed, armour, corpse time). The zone
simulation runs a small per-enemy state machine each tick: **idle** (aggro on proximity) →
**engaged** (chase in a straight line, attack on a server swing timer) → **returning** (evade:
walk home, reset health) or **dead** (corpse, then the spawn point respawns a new entity after
`respawnMs`). Demo: one Grey Wolf at (2, 0, 14). See [combat](../gameplay/combat.md).

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
