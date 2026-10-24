import {
  ContentPackSchema,
  WorldLocationSchema,
  ItemTemplateSchema,
  type WorldChunk,
} from '@mmo/schemas';
import { compileContentCatalog } from './content-loader';
import { RawGameDataSchema, type ParsedGameData } from './registry';
import authored from './content/packs/elderwood-living-seal.json';

export const livingSeal = {
  zoneId: 'zone.aurelian.elderwood',
  npcId: 'npc.elderwood.tamsin',
  questIds: [
    'quest.elderwood.third_watch',
    'quest.elderwood.briar_memory',
    'quest.elderwood.living_seal',
  ],
  landmarks: [
    {
      id: 'landmark.elderwood.listening_roots',
      name: 'The Listening Roots',
      position: { x: 304, y: 0, z: 3958 },
    },
    {
      id: 'landmark.elderwood.briar_archive',
      name: 'The Briar Archive',
      position: { x: 342, y: 0, z: 3924 },
    },
    {
      id: 'landmark.elderwood.heartwood_oath',
      name: 'The Heartwood Oath',
      position: { x: 374, y: 0, z: 3878 },
    },
  ],
};
export const forestChapterPack = authored;
/** Extend authored progression at the existing boat landing, preserving all atlas links and data. */
export function withForestChapter(source: ParsedGameData): ParsedGameData {
  const raw = structuredClone(source),
    pack = ContentPackSchema.parse(authored);
  const zone = raw.zones.find((z) => z.id === livingSeal.zoneId)!,
    world = raw.worldCatalog!;
  zone.landmarks.push(...livingSeal.landmarks);
  zone.respawnPoints.push({
    id: 'respawn.elderwood.pinewatch',
    name: 'Pinewatch Landing',
    position: { x: 270, y: 0, z: 3988 },
  });
  zone.safeZones.push({
    id: 'safe.elderwood.pinewatch',
    name: 'Pinewatch Landing',
    center: { x: 270, y: 0, z: 3988 },
    radius: 12,
  });
  world.locations.push(
    ...livingSeal.landmarks.map((l) =>
      WorldLocationSchema.parse({
        ...l,
        id: l.id.replace('landmark.', 'location.'),
        zoneId: zone.id,
        regionId: 'region.aurelian.elderwood',
        kind: 'landmark',
      }),
    ),
  );
  world.roads.push({
    id: 'road.elderwood.living_seal',
    zoneId: zone.id,
    width: 6,
    points: [
      { x: 256, y: 0, z: 4000 },
      { x: 270, y: 0, z: 3988 },
      ...livingSeal.landmarks.map((l) => l.position),
      { x: 384, y: 0, z: 3860 },
    ],
  });
  const color = world.biomes.find((b) => b.id === 'biome.forest')!.groundColor;
  const chunkAt = (x: number, z: number): WorldChunk => {
    const cx = Math.floor(x / 64),
      cz = Math.floor(z / 64);
    let chunk = raw.chunks.find(
      (c) => c.zoneId === zone.id && c.coord.cx === cx && c.coord.cz === cz,
    );
    if (!chunk) {
      chunk = {
        zoneId: zone.id,
        coord: { cx, cz },
        terrainAssetId: null,
        groundColor: color,
        props: [],
        colliders: [],
        spawnPoints: [],
      };
      raw.chunks.push(chunk);
    }
    return chunk;
  };
  // Broad canopies sit above the same solid trunk footprints used by movement and targeting.
  for (const [i, [x, z, scale]] of [
    [253, 3976, 1.3],
    [286, 3990, 1.5],
    [288, 3964, 1.5],
    [314, 3971, 1.3],
    [301, 3936, 1.6],
    [328, 3948, 1.4],
    [325, 3914, 1.5],
    [354, 3940, 1.5],
    [369, 3924, 1.4],
    [342, 3887, 1.6],
    [362, 3870, 1.4],
    [396, 3885, 1.5],
    [369, 3844, 1.7],
    [401, 3844, 1.5],
    [402, 3864, 1.3],
  ].entries())
    chunkAt(x!, z!).props.push({
      id: `living_seal_tree_${i}`,
      kind: 'tree',
      position: { x: x!, y: 0, z: z! },
      rotationY: i * 0.7,
      scale: scale!,
      modelId: 'authored:elder_tree',
    });
  for (const [i, [x, z, scale]] of [
    [310, 3964, 1.1],
    [348, 3930, 1.1],
    [379, 3884, 1.3],
    [389, 3845, 1.5],
  ].entries())
    chunkAt(x!, z!).props.push({
      id: `living_seal_stone_${i}`,
      kind: 'rock',
      position: { x: x!, y: 0, z: z! },
      rotationY: 0,
      scale: scale!,
      modelId: null,
    });
  for (const p of [
    ...pack.npcs.flatMap((n) => n.placements),
    ...pack.encounters.flatMap((e) => e.placements),
  ])
    chunkAt(p.spawn.position.x, p.spawn.position.z);
  const base = raw.itemTemplates.find((i) => i.id === 'accessory.necklace.springward_pendant')!;
  raw.itemTemplates.push(
    ItemTemplateSchema.parse({
      ...base,
      id: 'accessory.necklace.heartwood_knot',
      name: 'Heartwood Knot',
      description:
        'A living knot that remembers three watches and one unfinished song. Awarded by Keeper Tamsin.',
      itemLevel: 11,
      requiredLevel: 5,
      iconId: 'icons/items/heartwood_knot',
      equipment: {
        ...base.equipment,
        baseStats: {
          stamina: { min: 8, max: 8 },
          armor: { min: 10, max: 10 },
          spirit: { min: 4, max: 4 },
        },
      },
    }),
  );
  raw.serviceOffers!.push({
    id: 'service.elderwood.buy_remedy',
    name: 'Buy a Greenvale Remedy',
    npcId: livingSeal.npcId,
    kind: 'buy',
    minLevel: 1,
    inputs: [],
    output: { itemTemplateId: 'consumable.greenvale.remedy', quantity: 1 },
    copper: -30,
  });
  return RawGameDataSchema.parse(
    compileContentCatalog(
      {
        ...raw,
        quests: [...raw.quests, ...pack.quests.map((q) => ({ contentRef: q.id }))],
        npcs: [...raw.npcs, ...pack.npcs.map((n) => ({ contentRef: n.definition.id }))],
        enemies: [...raw.enemies, ...pack.encounters.map((e) => ({ contentRef: e.enemy.id }))],
        lootTables: [
          ...raw.lootTables,
          ...pack.rewards.filter((r) => r.kind === 'loot').map((r) => ({ contentRef: r.id })),
        ],
      },
      [pack],
    ),
  );
}
