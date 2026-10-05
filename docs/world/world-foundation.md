# Greybox world foundation

## Scale and coordinates

One world unit is one metre; Y is up, +X east and +Z north. Normal movement is 6 m/s.
Bounds are half-open. Chunks are 64 × 64 m. Each continent has its own atlas frame,
not a position offset in one enormous active scene. A region is an independent runtime zone.
For a region-local position, add the region bounds minimum to obtain continent-atlas coordinates.
Greenvale remains its original 256 m enclave at [-128,128) in X/Z: add enclave origin (256,256)
then the Greenvale Marches atlas origin. Existing Greenvale/Stillwater coordinates and content are unchanged.

Crossings below are unobstructed straight-axis estimates at 6 m/s, **not measured route durations**.
Combat, roads and detours increase them; boat/gate transfers intentionally shorten journeys.

| Continent / stable ID                | Dimensions      | E/W crossing | N/S crossing | Regions |
| ------------------------------------ | --------------- | ------------ | ------------ | ------- |
| Aurelian Reach (`landmass.aurelian`) | 8192 × 8192 m   | 22.8 min     | 22.8 min     | 4       |
| Frostmere (`landmass.frostmere`)     | 10240 × 8192 m  | 28.4 min     | 22.8 min     | 4       |
| Cinderwake (`landmass.cinderwake`)   | 8192 × 6144 m   | 22.8 min     | 17.1 min     | 4       |
| Duneshara (`landmass.duneshara`)     | 12288 × 8192 m  | 34.1 min     | 22.8 min     | 6       |
| Veilreach (`landmass.veilreach`)     | 12288 × 10240 m | 34.1 min     | 28.4 min     | 6       |

## Regions, progression and actual places

All region zones use local bounds [0,width) × [0,height). Atlas bounds below provide their fixed
continent position. Overlapping bands on every shared edge prevent abrupt level jumps. Safe towns,
roads, valleys, wooded foothills and mountain-pass gate nodes form the authored transition intent.
The higher variant in each region occupies a deep-wilderness habitat, away from arrival ports/towns.
These bands are recommendations; neither travel nor future events/professions are permanently level-locked.

| Region / zone ID                                      | Atlas X / Z bounds (m)      | Level band | Biome    | Settlement          | Port                 |
| ----------------------------------------------------- | --------------------------- | ---------- | -------- | ------------------- | -------------------- |
| Greenvale Marches (`zone.aurelian.greenvale_marches`) | [0,4096) / [0,4096)         | 1–8        | meadow   | Greenvale Roadhouse | Willow Quay          |
| Amber Coast (`zone.aurelian.amber_coast`)             | [4096,8192) / [0,4096)      | 5–12       | coast    | Tidecross           | Tidecross Harbour    |
| Elderwood (`zone.aurelian.elderwood`)                 | [0,4096) / [4096,8192)      | 5–12       | forest   | Pinewatch           | Pinewatch Landing    |
| Crownspine (`zone.aurelian.crownspine`)               | [4096,8192) / [4096,8192)   | 9–18       | mountain | Highcairn           | Cairn Anchorage      |
| Brinebreak (`zone.frostmere.brinebreak`)              | [0,5120) / [0,4096)         | 12–20      | tundra   | Brinehaven          | Brinehaven Docks     |
| Whitepine (`zone.frostmere.whitepine`)                | [5120,10240) / [0,4096)     | 16–24      | taiga    | Whitepine Hearth    | Hearth Landing       |
| Rimefen (`zone.frostmere.rimefen`)                    | [0,5120) / [4096,8192)      | 16–24      | fen      | Mirewatch           | Mirewatch Jetty      |
| Glasspeak (`zone.frostmere.glasspeak`)                | [5120,10240) / [4096,8192)  | 20–30      | glacier  | Glassreach          | Glassreach Anchorage |
| Ashstrand (`zone.cinderwake.ashstrand`)               | [0,4096) / [0,3072)         | 20–28      | ash      | Coalshore           | Coalshore Docks      |
| Embersteppe (`zone.cinderwake.embersteppe`)           | [4096,8192) / [0,3072)      | 24–32      | steppe   | Ember Rest          | Ember Roadstead      |
| Redroot (`zone.cinderwake.redroot`)                   | [0,4096) / [3072,6144)      | 24–32      | redwood  | Redroot Refuge      | Redroot Landing      |
| Blackglass Heights (`zone.cinderwake.blackglass`)     | [4096,8192) / [3072,6144)   | 28–38      | volcanic | Obsidian Watch      | Obsidian Anchorage   |
| Oasis Reach (`zone.duneshara.oasis_reach`)            | [0,4096) / [0,4096)         | 28–36      | desert   | Palmrest            | Palmrest Harbour     |
| Windcut Valleys (`zone.duneshara.windcut`)            | [4096,8192) / [0,4096)      | 31–39      | canyon   | Windcut Haven       | Windcut Quay         |
| Sunsea Dunes (`zone.duneshara.sunsea`)                | [8192,12288) / [0,4096)     | 34–42      | dunes    | Sunsea Caravanserai | Sunsea Roadstead     |
| Saltmarch (`zone.duneshara.saltmarch`)                | [0,4096) / [4096,8192)      | 31–39      | saltflat | Saltwatch           | Saltwatch Docks      |
| Broken Steps (`zone.duneshara.broken_steps`)          | [4096,8192) / [4096,8192)   | 34–42      | badlands | Stepkeeper Camp     | Stepkeeper Landing   |
| High Saffron (`zone.duneshara.high_saffron`)          | [8192,12288) / [4096,8192)  | 37–46      | mesa     | Saffron Crown       | Saffron Anchorage    |
| Mistwood Shore (`zone.veilreach.mistwood`)            | [0,4096) / [0,5120)         | 36–44      | mistwood | Mistrest            | Mistrest Harbour     |
| Moonfen (`zone.veilreach.moonfen`)                    | [4096,8192) / [0,5120)      | 39–47      | moonfen  | Moonwatch           | Moonwatch Quay       |
| Silver Heath (`zone.veilreach.silver_heath`)          | [8192,12288) / [0,5120)     | 42–50      | heath    | Silver Hearth       | Silver Landing       |
| Crystal Vale (`zone.veilreach.crystal_vale`)          | [0,4096) / [5120,10240)     | 39–47      | crystal  | Prism Camp          | Prism Anchorage      |
| Forgotten March (`zone.veilreach.forgotten_march`)    | [4096,8192) / [5120,10240)  | 42–50      | haunted  | Remembrance         | Remembrance Docks    |
| Veiled Spires (`zone.veilreach.veiled_spires`)        | [8192,12288) / [5120,10240) | 45–54      | spire    | Spirewatch          | Spirewatch Anchorage |

Source of truth: `packages/game-data/src/content/packs/world-greybox.json`. Each region has stable IDs,
a complete neighbor list, transition intent, monster/resource/role/dungeon references. Each named place
has a stable ID, zone/region link and fixed local coordinates. Do not rename persisted IDs.

Common regional coordinates are deliberate reusable greybox footprints, not shared global positions:
town (256,400), grazing (512,512), low hostile habitat (900,640), deep hostile habitat (2200,1800),
dungeon entrance (1536,1024), watch beacon (2000,1700), resource hollow (768,1000), expedition camp
(1400,900). Ports sit at x=256, z=96 or region height−96; passes are 16 m inside a shared edge.
The north-road Greenvale node (0,116) joins its Marches gate (256,376).

## Travel topology

Every geometrically adjacent region has reciprocal road-pass links: 26 undirected regional edges.
The starter road is an additional edge. Coastal boat circuits connect every region port on each
continent. Six intercontinental boat edges give alternate routes (all are reciprocal):

- Willow Quay ↔ Brinehaven Docks.
- Tidecross Harbour ↔ Coalshore Docks.
- Brinehaven Docks ↔ Coalshore Docks.
- Coalshore Docks ↔ Palmrest Harbour.
- Palmrest Harbour ↔ Mistrest Harbour.
- Brinehaven Docks ↔ Mistrest Harbour.

Total: 114 directed links (57 reciprocal pairs); every zone is reachable from Greenvale.
Modes are typed boat/road/portal/mount/flight, with enabled state and optional completed-quest unlock.
Only boat/road links are enabled here. Transfers are instant, explicit node interactions, not animated
ships, free teleports, mounts or portal gameplay. M / World opens the atlas; Guide uses the existing
HUD/minimap compass and distance to the next departure, including across continents. E / touch Travel
opens departures within 5 m. Players must be alive/out of combat and the target zone must be hosted.

The same authoritative host removes the old-zone player and admits exactly one destination player.
Owned source/destination recovery images and character zone/position/health/cooldowns commit atomically
on the existing fenced PostgreSQL session before new state is published. Failure fences the host;
recovery uses the last committed image. Inventory, equipment, quests, XP and session authority remain
existing systems. Replayed travel sequences are rejected. Zone-scoped parties leave cleanly on travel;
cross-zone persistent parties and transfer between separate realtime hosts are not implemented.

## Catalogs and representative population

- 24 biome intents; 10 monster families / 72 region-level variants.
  Grazers, boars, outlaws, reed lurkers, stonekin, frostfangs, cinderlings, ash scorpions, sandstriders
  and veilshades. Wildlife is non-aggro and retaliates; hostile variants use existing melee AI.
  Each region has three actual durable creature spawns: wildlife, low hostile, deep hostile.
  No quest needs to manufacture its own monster; future habitat populations can reuse these IDs.

- 10 reusable NPC archetypes and 240 named inhabitants, nine per town plus a port ferryman in each region:
  guard, merchant, innkeeper, profession trainer, faction representative, ferryman, healer,
  vault steward, scout and gamekeeper. All have real replicated spawn/dialogue records.
  Stock/services are catalog references: shops, lodging, training and NPC healing are placeholders.

- 10 real material item templates, 10 biome/profession resource definitions and 10 loot profiles.
  Field Hide, Hardwood, Marsh Reed, Iron Shard, Frost Salt, Ember Dust, Sunstone, Wild Herb,
  Cloth Scrap and Veil Crystal link to hide/salvage/mineral/botanical/elemental drops.
  Creature kills use the existing crash-safe party credit, XP division, rotating one-owner loot,
  unique-instance/provenance and recovered-loot paths. Gatherable sites have catalog markers;
  gathering/profession progression and resource depletion are **not** implemented.

- 4 dungeon archetypes (cave/ruin/mine/crypt), 24 named entrance POIs; each region also has a
  settlement, port, three habitats, resource hollow, expedition camp and watch beacon.
  These reserve space for multiple tiers/elite/boss/event content; dungeon entry/instances are placeholders.

## Streaming and activity model

Version-2 authored packs extend the same strict content engine; version 1 and deployed Stillwater
remain valid. The adapter appends region/zone/NPC/enemy/item/loot/chunk definitions to the existing
GameData registry. Link/bounds/coverage/overlap/adjacency/band/route/reachability/stock/loot validation
runs before runtime installation. Adding another continent is data-only within these contracts.

Ordinary quest/NPC/encounter packs resolve after world dependencies are installed: rewards can use
regional materials and placements can populate valid sparse regional chunks. Future quests should
reference existing population/variant/location IDs. Quest-giver eligibility still uses the existing
`runtimeRole: quest_giver`; promote an existing faction inhabitant in authored data when needed,
keeping its ID and placement rather than inventing a duplicate quest NPC. Talk objectives can use
other inhabitants. Such real content changes require the existing checkpoint-hash migration discipline.

Sparse authored chunks contain actual hubs, props, colliders and spawns. Unauthored in-bounds chunks
become flat biome ground on demand. Client terrain keeps a five-by-five neighborhood (at most 25
chunks), unloads distant geometry/labels/materials/textures, and clears the old zone on travel.
Road meshes are clipped to each chunk. Original Greenvale renders as before. Coast/cliff strips and
authoritative bounds prevent walking off an exposed map edge; named passes provide intentional exits.

The realtime host owns all catalog zones when REALTIME_ZONES=* (default and preview deployment).
Players can occupy separate continents simultaneously. Empty atlas regions skip simulation ticks;
unchanged inactive recovery images are not rewritten. Enemy population is currently sparse and
region-wide; AOI filters replicated entities. Local navigation caches at most eight 192 m grids
per region instead of allocating multi-kilometre whole-zone grids. Existing short leashes fit these
windows. Large-leash encounters, dense populations, dynamic terrain and true per-chunk server activation
need targeted future work, not an all-continent allocation or unqualified capacity claim.

## Deliberate placeholders and next work

Flat terrain, repeated huts/trees/rocks, generic humanoid/quadruped/construct/elemental rigs, widely
spaced populations and simple port basins/boats are greybox. The atlas has substantial reserved space,
not dense finished continent content. Biome and transition intent are authored; detailed mountains,
rivers, forests, shorelines and wilderness density still need regional dressing. No quests were added
or bulk-migrated. Higher-level stat/loot balance remains provisional; this is not 54 levels of progression.

Next: make Greenvale Marches one convincingly populated travel region using these existing catalogs.
Densify bounded habitats and roads, add regional resource interaction with the existing item economy,
and playtest solo/party travel before expanding quest output. Keep future quests tied to these stable
places/inhabitants/families instead of bespoke inventions.

## Verification

See PROGRESS.md and `docs/world/evidence/` for final commands, results and browser proof.
The populated preview migration compares every checkpoint field except contentHash before/after.
Travel integration covers physical checks/replays/death/threat, party leave, inventory snapshot stability,
health/cooldowns, distinct continents, committed-crash recovery and failed-write rollback.
Browser tours start with fresh characters and resume their earned state, not position/stat/reward injection.
They verify actual unique equipment/material loot across continents and relogging.
Emulated Chromium/SwiftShader touch is functional proof, not physical Android FPS.
