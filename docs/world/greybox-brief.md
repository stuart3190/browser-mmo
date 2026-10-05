# World-foundation brief — 2026-10-05

WORLD FIRST, QUESTS LATER. No quests are generated or bulk-migrated in this pass.
Existing Greenvale/Stillwater progression and stable IDs remain intact.

Measured code conventions: one unit = one metre, Y up, +Z north, X east; walking 6 m/s,
64 m chunks, existing Greenvale bounds [-128,128) on X/Z (256 m / 43 seconds across).
A region is a simulation/loading zone; continents are atlas groupings of four to six adjacent region zones.
Coordinates remain zone-local; fixed atlas origins map them into each continent's coordinate frame.
The starter enclave maps into the southwest region of Aurelian Reach without changing its coordinates.

| Landmass       | Dimensions      | Straight crossing at 6 m/s | Sub-regions                                                                         |
| -------------- | --------------- | -------------------------- | ----------------------------------------------------------------------------------- |
| Aurelian Reach | 8192 × 8192 m   | 22.8 min E/W, 22.8 min N/S | Greenvale Marches, Amber Coast, Elderwood, Crownspine                               |
| Frostmere      | 10240 × 8192 m  | 28.4 min E/W, 22.8 min N/S | Brinebreak, Whitepine, Rimefen, Glasspeak                                           |
| Cinderwake     | 8192 × 6144 m   | 22.8 min E/W, 17.1 min N/S | Ashstrand, Embersteppe, Redroot, Blackglass Heights                                 |
| Duneshara      | 12288 × 8192 m  | 34.1 min E/W, 22.8 min N/S | Oasis Reach, Windcut Valleys, Sunsea Dunes, Saltmarch, Broken Steps, High Saffron   |
| Veilreach      | 12288 × 10240 m | 34.1 min E/W, 28.4 min N/S | Mistwood Shore, Moonfen, Silver Heath, Crystal Vale, Forgotten March, Veiled Spires |

These are unobstructed estimates: routes, combat and detours take longer. Each region has its own
biome, guidance level/danger band, town/port or expedition camp, wilderness habitats, resource areas,
dungeon entrance, landmark and future quest hub. Geography is not a permanent level lock; scaling,
events, professions and revisits remain future extension points.

Non-negotiable implementation requirements:

- Build FIVE substantial landmasses with 4–6 regions each with multiple named regions; never a five-minute continent.
- Establish stable IDs, names, bounds, atlas origins, local positions, adjacency and travel links.
- Populate catalogs before quests: multiple monster families/variants and wildlife; hostile/neutral
  archetypes; inhabitants by settlement/role; services; resources/materials/drops; loot categories;
  dungeon archetypes and points of interest. Inhabitants must exist independently of quest scripts.
- Use reusable greybox ground, roads, trees/rocks and settlement footprints. No final art or cinematic
  polish. Layout, readable routes, names, intentional coast/cliff/pass boundaries take precedence.
- Named ports and reciprocal boat routes connect all landmasses. Typed travel modes leave room for
  later locked portals, mounts and flight; those systems are not implemented now.
- Region zones load independently; clients stream only nearby 64 m chunks and dispose distant ones.
  Sparse authored hubs/habitats avoid materializing hundreds of thousands of empty chunk definitions.
  Server supports simultaneous players on different continents, keeps existing zone ownership,
  and sleeps empty region simulation work. Large regions must never allocate a whole-region nav grid.
- Travel is an explicit user action at a validated node, not a client-authorized position write.
  Preserve health/cooldowns/inventory/quests and atomic durable ownership when changing zones.
  Zone-scoped parties must leave cleanly at transfer; cross-zone party persistence is a later system.
- Catalog-only professions/vendor/dungeon services must be labeled placeholders; do not imply
  gathering, purchasing or instanced dungeons are playable. Representative monsters and settlement
  inhabitants should actually populate the greybox; do not spawn an entire hypothetical catalog.
- Validate world/catalog links, positions, bands, adjacency, reciprocal travel and load compatibility;
  test multiplayer zone travel, durability, streaming bounds and existing content compatibility.
- Integrate incrementally through the existing versioned content compiler. Do not replace gameplay,
  create unrelated infrastructure, generate random quests or silently discard deployed state.
- Finish with verified docs, tests/builds, commit/merge/push, existing deployment and public smoke.

Next step after this foundation: densify one region using its existing habitats/population/resource
catalogs and review traversal/navigation. Quests can then reference real pre-existing places/roles.

Neighboring bands overlap; settled roads, river valleys, wooded foothills and mountain passes form
transition buffers. Higher variants occupy deep wilderness rather than port/arrival points.
Aurelian bands 1–8 / 5–12 / 5–12 / 9–18; Frostmere 12–20 / 16–24 / 16–24 / 20–30;
Cinderwake 20–28 / 24–32 / 24–32 / 28–38; Duneshara 28–36 / 31–39 / 34–42 / 31–39 / 34–42 / 37–46;
Veilreach 36–44 / 39–47 / 42–50 / 39–47 / 42–50 / 45–54. These are recommendations, not entry locks.
