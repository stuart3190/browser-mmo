import { ContentPackSchema, WorldLocationSchema, ItemTemplateSchema } from '@mmo/schemas';
import type { WorldChunk } from '@mmo/schemas';
import { compileContentCatalog } from './content-loader';
import { RawGameDataSchema, type ParsedGameData } from './registry';
import authored from './content/packs/amber-tidewatch.json';

export const tidewatch = {
  zoneId: 'zone.aurelian.amber_coast',
  npcId: 'npc.amber_coast.iona',
  questIds: [
    'quest.amber_coast.crossing',
    'quest.amber_coast.tide_marks',
    'quest.amber_coast.last_bell',
  ],
  landmarks: [
    {
      id: 'landmark.amber_coast.tide_gauge',
      name: 'The Storm-Line Gauge',
      position: { x: 304, y: 0, z: 136 },
    },
    {
      id: 'landmark.amber_coast.windlass',
      name: 'The Broken Windlass',
      position: { x: 338, y: 0, z: 162 },
    },
    {
      id: 'landmark.amber_coast.drowned_beacon',
      name: 'The Drowned Beacon Oath',
      position: { x: 351, y: 0, z: 205 },
    },
  ],
};

/** Authored chapter compiled through the existing pack validator; historical catalogs stay intact. */
export function withCoastalChapter(source: ParsedGameData): ParsedGameData {
  const pack = ContentPackSchema.parse(authored);
  const raw = structuredClone(source);
  const zone = raw.zones.find((z) => z.id === tidewatch.zoneId)!;
  zone.landmarks.push(...tidewatch.landmarks);
  const world = raw.worldCatalog!;
  world.locations.push(
    ...tidewatch.landmarks.map((l) =>
      WorldLocationSchema.parse({
        ...l,
        id: l.id.replace('landmark.', 'location.'),
        zoneId: zone.id,
        regionId: 'region.aurelian.amber_coast',
        kind: 'landmark',
      }),
    ),
  );
  world.roads.push({
    id: 'road.amber_coast.tidewatch',
    zoneId: zone.id,
    width: 6,
    points: [
      { x: 272, y: 0, z: 104 },
      { x: 304, y: 0, z: 136 },
      { x: 338, y: 0, z: 162 },
      { x: 351, y: 0, z: 205 },
      { x: 360, y: 0, z: 220 },
    ],
  });
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
        groundColor: '#b1a879',
        props: [],
        colliders: [],
        spawnPoints: [],
      };
      raw.chunks.push(chunk);
    }
    return chunk;
  };
  // Existing prop footprints drive both collision and render geometry; keep the shore path open.
  for (const [id, kind, x, z, scale, rotationY] of [
    ['gauge_stone', 'rock', 309, 132, 1.4, 0],
    ['wreck_hull', 'fence', 334, 172, 1.1, 0.4],
    ['wreck_ribs', 'fence', 330, 177, 0.7, -0.3],
    ['beacon_base', 'rock', 360, 236, 2.4, 0],
    ['beacon_west', 'rock', 347, 224, 1.5, 0],
    ['beacon_east', 'rock', 374, 224, 1.5, 0],
    ['shore_pine', 'tree', 291, 151, 1.2, 0],
    ['shore_pine_east', 'tree', 358, 178, 1.4, 0],
  ] as const)
    chunkAt(x, z).props.push({
      id: `tidewatch_${id}`,
      kind,
      position: { x, y: 0, z },
      scale,
      rotationY,
      modelId: null,
    });
  for (const n of [
    ...pack.npcs.flatMap((n) => n.placements),
    ...pack.encounters.flatMap((e) => e.placements),
  ])
    chunkAt(n.spawn.position.x, n.spawn.position.z);
  const seal = raw.itemTemplates.find((i) => i.id === 'accessory.ring.stillwater_seal')!;
  raw.itemTemplates.push(
    ItemTemplateSchema.parse({
      ...seal,
      id: 'accessory.ring.tideglass_seal',
      name: 'Tideglass Seal',
      description:
        'Two watches, one oath. A sea-glass ring awarded by Warden Iona after the drowned bell falls quiet.',
      requiredLevel: 5,
      itemLevel: 9,
      iconId: 'icons/items/tideglass_seal',
      equipment: {
        ...seal.equipment,
        baseStats: {
          stamina: { min: 6, max: 6 },
          strength: { min: 4, max: 4 },
          intellect: { min: 4, max: 4 },
        },
      },
    }),
  );
  // A functioning coastal merchant also provides the existing repair service in Tidecross.
  raw.serviceOffers!.push({
    id: 'service.amber_coast.buy_remedy',
    name: 'Buy a Greenvale Remedy',
    npcId: 'npc.world.amber_coast.merchant',
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

export const chapterContentPacks = [authored];
