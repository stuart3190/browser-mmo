# Greenvale Marches: roads, habitats and Wild Herb

This incremental population pass preserves the five-continent topology, region bands, enclave,
existing place coordinates and eight quests. It concentrates on the Roadhouse–Lantern Meadow–
Resource Hollow route; most of the 4,096 m region still deliberately reserves future content space.

## Authored population

The existing version-2 world pack now supports optional `dressing` and `resourceNodes` arrays.
Both use globally checked stable IDs and existing location references. Dressing has a bounded
position offset, supported prop kind, rotation and scale. It becomes ordinary streamed chunk props
and uses the existing shared collision shapes. No second scene/world registry is installed.

Greenvale Marches gains five named habitat pockets (two catalog variants per pocket), a sheltered
Roadhouse Herb Beds location, a five-metre-wide Hollow access route, 25 additional tree/rock props,
and three role-based inhabitants: Lantern Guard Anwen, Hollow Scout Ren and Herb Tender Moss.
Roadkeeper Ada, Herbalist Fen and Scout Pell supply practical local directions. Total Marches
population is 13 creatures and 13 inhabitants, up from three and ten respectively. Meadow wildlife
is non-aggressive; level-two bristlebacks inhabit thickets and level-five veterans stay deeper near
Watch Ridge. No higher-level family or bespoke quest enemy is introduced.

## One playable resource, not a complete profession engine

`resource.wild_herb` alone enables gathering. Two authored nodes produce the existing
`material.world.wild_herb` into the persistent material pouch:

| Node                  | Zone-local coordinates | Yield | Regrowth   |
| --------------------- | ---------------------- | ----- | ---------- |
| Roadhouse beds        | (290, 400)             | 2     | 60 seconds |
| Resource Hollow patch | (772, 1008)            | 3     | 90 seconds |

Approach within three metres and press E or tap **Gather**. The authoritative server applies its
existing one-metre interaction tolerance, life/zone/range checks, sequence/replay protection,
per-session database work limits and bounded in-flight work. Gathering during an active attack
or enemy threat is rejected. There is no client-provided item, quantity or deadline.

The patch is a shared world resource. Exactly one gatherer receives its yield; parties see the same
depletion but do not receive duplicate material or XP. Picking costs no currency and grants no
combat/profession XP. Patches regrow on a persisted wall-clock deadline, including while offline.
The game reports gathering and regrowth, and inventory UI shows the actual material stack.
Herbs are currently collectible material stock; crafting, consumable recipes, profession levels,
tool requirements and additional resource types remain future work.

## Persistence boundary

One `resource_harvests` row per authored node stores its next available time. A short transaction
creates/locks the row, reads PostgreSQL time after acquiring the lock, grants through the existing
item/container/provenance machinery, then writes depletion. A failed grant rolls back everything.
The table is bounded by authored nodes, not every interaction. Existing item history records every
acquisition; even merged stacks retain grant provenance and globally unique instance IDs.

On host startup, resource entities/respawn timers alone are reconstructed from these rows **after**
restoring the owned zone checkpoint. This closes the crash window between a committed item grant
and the next recovery image: stale available entities cannot mint the same depletion again.
Database failures abort startup or release the in-flight reservation; they do not manufacture loot.
The reused `interact.pickup` intent resolves the authoritative entity kind to the harvest operation.
The `resource_node` entity kind and `gather` inventory reason are additive protocol fields; deploy
client/server together. Resource definitions with `gatheringImplemented: false` remain catalog-only.

Migration 0016 adds the depletion table and changes only the exact predecessor checkpoint hash.
All character, combat, cooldown, party, kill and inventory state stays intact. Restore adds new
ungrouped enemies/NPCs through existing migration seams and refreshes static NPC display names.
Node entities are rebuilt with fresh runtime IDs so pre-crash resource intents cannot be replayed.

## Extension seam and next milestone

Add herb nodes through the same catalog; do not add bespoke handler branches per place. New
resource types need deliberately verified interaction rules before switching their implemented flag.
Avoid claiming all professions are complete from this first gather operation. Next, connect existing
regional inhabitants, habitats and resource locations to one focused expedition/progression loop,
with a useful sink for collected herbs. Keep world-first authorship and avoid bulk quest output.
