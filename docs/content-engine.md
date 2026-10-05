# Versioned content engine core

The production API, realtime server and browser still use the same `getGameData()` registry and
existing authoritative gameplay. Version-1 packs compile into that registry; they do not introduce
another quest engine, combat script interpreter, reward executor or persistence system.

## Authoring and loading

- Schemas: `packages/schemas/src/content-pack.ts`; TypeScript input/output types are exported by
  `@mmo/schemas`. JSON is the canonical migrated authoring format; typed TS callers are also supported.
- Example: `packages/game-data/src/content/packs/stillwater.json`.
- Each pack requires `schemaVersion: 1`, a unique `id`, positive integer `revision`, and arrays of
  `quests`, `npcs`, `encounters`, `rewards`. Unsupported versions and unknown fields fail validation.
  Increment revision for authored changes; changing schema semantics requires a new explicit version
  and adapter. Revision is authoring metadata, not a gameplay/checkpoint hash override.
- Quests use the existing objective/dialogue/prerequisite fields and a `rewardId`, replacing inline
  rewards. Named rewards are discriminated `quest` (XP/currency/items) or `loot` (weighted table).
  Multiple quests may deliberately reference a reward definition; each character's grant remains
  governed by the existing transactional quest completion, not by the reward-definition ID.
- NPCs contain a `definition` and `placements`. Encounters contain an `id`, existing `enemy`
  definition, nullable `lootRewardId` and at least one placement. Placement holds `zoneId` and the
  existing spawn shape. It must point to its owning NPC/enemy with the correct kind.
- Register packs in `contentPacks` in `packages/game-data/src/index.ts`. Register each definition
  exactly once at its desired array position using `{ contentRef: 'definition.id' }` in the content
  manifest (quests, NPCs, enemies, loot tables). No override precedence or automatic last-wins merge.
  This intentionally explicit registration preserves existing array/RNG/checkpoint ordering.
- `compileContentCatalog(manifest, packs)` parses unknown input, resolves named rewards and manifest
  references, inserts placements into existing zone chunks, and runs `GameData.load` on the whole
  assembled catalog. Missing/duplicate references, conflicting inline IDs, unknown item/currency/
  NPC/enemy/zone/landmark links, invalid spawn collision/bounds, impossible reward quantities and
  prerequisite cycles fail before a catalog is returned. Unused quest reward definitions are checked
  too; loot definitions must be registered, even when no enemy currently uses them.
- Compilation is synchronous, pure and deterministic for a fixed manifest and pack ordering.
  Inputs are not mutated and failures never install part of a pack. Shipping arbitrary uploaded
  packs, runtime hot reload, editors and remote content endpoints are outside this core.

Run `pnpm content:validate` before changing content. It exits nonzero on invalid content and prints
pack versions/revisions, runtime counts and the canonical compiled SHA-256. Validation also runs
when the registry module loads; every runtime uses the same adapter. Build checks and integration
suites exercise that production path.

## Migrated proof and compatibility

Stillwater's **What the Ward Held**, Surveyor Tess/dialogue/placement, Siltbound Warden/stats/
ground-strike mechanic/placement, quest seal-ring reward and creature loot table now live in JSON.
The manifest replaces their former inline objects; no new content or gameplay was added.

The parsed catalog remains byte-for-byte identical to deployed `8b3fc2dd973a14a3cf6b63fcc035b56477f7abba`:
`fce8c1bf74e3e8e9fd3019432542026bb82f6a65060914ce468e9d255876ace1`.
A permanent golden-hash test protects all definitions, placements, terrain, rewards and ordering.
No database migration, character reset or checkpoint content-hash rewrite is required.
The existing Stillwater domain integration test exercises persistent personal talk credit,
party-compatible kill credit, atomic reward/replay behavior and equipment through this loaded data.

Stable quest/objective/enemy/item/spawn IDs are persistence contracts. Do not rename them to edit
text or move content between packs. A future actual semantic content change must follow the existing
checkpoint/content-hash migration procedure; schema version/revision alone cannot make it safe.

## Deliberately retained code and extension points

Other quests, enemies/NPCs and rewards remain legacy TS content; they can move pack-by-pack without
changing runtime handlers. Items, classes, region/zone/chunk layouts, generated terrain/props,
landmarks, procedural enemy appearances and encounter formulas remain existing TS/code. The adapter
supports current single-enemy encounters and NPC placements; multi-stage encounter scripting is not
implemented. Personal talk/explore/turn-in, existing party credit, XP division and one-owner loot
rotation remain authoritative runtime policies, not arbitrary authored actions.

Future extension order:

| Area         | Extension seam                                                            | Runtime work still required                                                |
| ------------ | ------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Items        | Add versioned template section referencing existing rarity/slot/class IDs | Preserve unique-instance/provenance and template sync contracts            |
| Locations    | Add typed zone/landmark/chunk references or sections                      | Keep collision/navigation and checkpoint migrations authoritative          |
| World events | Versioned event definitions linking encounters/rewards/locations          | Authoritative scheduling, participation, lifecycle and deduplication       |
| Professions  | Recipe/gathering definitions referencing templates/rewards                | Atomic costs/outputs and skill progression; no executable authored scripts |
| Dungeons     | Definitions referencing locations/encounters/quests                       | Instance ownership, admission, party lifecycle and durable completion      |
| World state  | Typed conditions/effects referencing stable flag IDs                      | Persisted scope/versions, evaluation and transactional effects             |

Each extension needs schema/link/failure tests and a runtime consumer before being marked playable.
V1 intentionally cannot express arbitrary effects, repeatables, branching quest logic, talents,
raid encounters or a general scripting language. Adding unsupported mechanics to JSON is rejected.

## Version 2: world catalogs (2026-10-05)

The owner prioritised WORLD FIRST over further quest migration. Version 2 retains the version-1
sections and adds the strict `world` catalog in `packages/schemas/src/world-catalog.ts`.
`world-greybox.json` contains five continents, 24 regional zones, fixed places, adjacency/travel,
biomes, monster families/variants, settlement archetypes/populations, material templates,
resource/loot catalogs and dungeon archetypes. Version 1 remains accepted unchanged.

`appendWorldCatalog` feeds these records into the existing GameData region/zone/chunk/NPC/enemy/
item/loot registries. It never overrides legacy IDs; the existing whole-catalog checks still run.
Additional checks enforce rectangular coverage, no overlaps, in-bounds coordinates, reciprocal
adjacency and travel, neighboring level-band overlap, reachable zones and catalog dependencies.
`pnpm content:validate` includes both versions and the resulting canonical hash. This additive
content change uses migration `0015` to preserve the exact predecessor Greenvale checkpoint.
Golden starter tests still protect the earlier catalog; new tests also compare every original
definition/chunk against the live extended registry rather than testing only a frozen fixture.

See [world foundation](world/world-foundation.md) for dimensions, locations, catalog counts,
runtime travel/streaming and honest placeholders. No quests were added or bulk-migrated.
Other live quests remain TS; final terrain/art/formulas remain code. World events, professions,
dungeon instances and world-state effects still require the authoritative consumers listed above.
Next, densify one region from these catalogs and add a bounded resource interaction; do not
generate a mass of quests before its inhabitants, habitats and routes are convincing.
