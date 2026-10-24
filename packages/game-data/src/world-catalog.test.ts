import { expect, it } from 'vitest';
import { ContentPackSchema } from '@mmo/schemas';
import {
  compileContentCatalog,
  contentManifest,
  contentPacks,
  GameData,
  getGameData,
  travelAt,
  worldDestination,
  clipRoad,
} from './index';
import { getStarterGameData } from './starter-testing';
const gd = getGameData(),
  world = gd.raw.worldCatalog!;
const fixture = () =>
  ContentPackSchema.parse(structuredClone(contentPacks.find((p) => p.schemaVersion === 2)));
it('creates five substantial partitioned landmasses, 24 regions and unchanged deployed Greenvale', () => {
  expect(world.landmasses).toHaveLength(5);
  expect(world.regions).toHaveLength(24);
  for (const l of world.landmasses) {
    expect(l.regionIds.length).toBeGreaterThanOrEqual(4);
    expect((l.bounds.maxX - l.bounds.minX) / 6 / 60).toBeGreaterThan(20);
  }
  const old = getStarterGameData().raw;
  for (const key of [
    'quests',
    'npcs',
    'enemies',
    'lootTables',
    'itemTemplates',
    'regions',
    'zones',
  ] as const) {
    const original = old[key];
    expect(gd.raw[key].filter((v) => original.some((o) => o.id === v.id))).toEqual(original);
  }
  expect(gd.chunksForZone('zone.greenvale.meadows')).toEqual(old.chunks);
});
it('ships diverse reusable catalogs and focused Greenvale population while preserving other regions', () => {
  expect(world.monsterFamilies).toHaveLength(10);
  expect(world.monsterFamilies.flatMap((f) => f.variants)).toHaveLength(74);
  expect(world.populations).toHaveLength(249);
  expect(world.resources).toHaveLength(10);
  expect(gd.quests.size).toBe(getStarterGameData().quests.size + 16);
  expect(gd.raw.chunks.length).toBeLessThan(700);
  for (const r of world.regions) {
    expect(
      gd
        .chunksForZone(r.zoneId)
        .flatMap((c) => c.spawnPoints)
        .filter((s) => s.kind === 'enemy'),
    ).toHaveLength(
      r.zoneId === 'zone.aurelian.greenvale_marches'
        ? 19
        : ['zone.aurelian.amber_coast', 'zone.aurelian.elderwood'].includes(r.zoneId)
          ? 6
          : 3,
    );
    expect(
      gd
        .chunksForZone(r.zoneId)
        .flatMap((c) => c.spawnPoints)
        .filter((s) => s.kind === 'npc'),
    ).toHaveLength(
      r.zoneId === 'zone.aurelian.greenvale_marches'
        ? 19
        : ['zone.aurelian.amber_coast', 'zone.aurelian.elderwood'].includes(r.zoneId)
          ? 11
          : 10,
    );
  }
});
it('loads unmaterialized chunks on demand and rejects coordinates outside bounds', () => {
  const r = world.regions[0]!,
    c = gd.worldChunk(r.zoneId, { cx: 40, cz: 40 });
  expect(c.props).toEqual([]);
  expect(c.groundColor).toBe(world.biomes.find((b) => b.id === r.biomeId)!.groundColor);
  expect(() => gd.worldChunk(r.zoneId, { cx: 10000, cz: 0 })).toThrow();
});
it('guides to a departure across continents and enforces physical departure range', () => {
  const road = world.travel.find((t) => t.fromLocationId === 'location.greenvale.north_gate')!;
  expect(travelAt(world, 'zone.greenvale.meadows', { x: 0, z: 0 })).toHaveLength(0);
  expect(travelAt(world, 'zone.greenvale.meadows', { x: 0, z: 116 })).toContainEqual(road);
  expect(
    worldDestination(world, 'location.mistwood.port', 'zone.greenvale.meadows')?.location.id,
  ).toBe('location.greenvale.north_gate');
});
it('clips long roads to bounded streamed meshes', () => {
  expect(
    clipRoad({ x: 0, z: 32 }, { x: 4000, z: 32 }, { minX: 64, minZ: 0, maxX: 128, maxZ: 64 }),
  ).toEqual({ a: { x: 64, z: 32 }, b: { x: 128, z: 32 } });
  expect(
    clipRoad({ x: 0, z: 80 }, { x: 4000, z: 80 }, { minX: 64, minZ: 0, maxX: 128, maxZ: 64 }),
  ).toBeNull();
});
it.each([
  'duplicate',
  'missing landmass',
  'bad biome',
  'bad coordinate',
  'overlap',
  'bad band',
  'broken neighbor',
  'unbuffered levels',
  'missing monster',
  'wrong biome',
  'missing resource',
  'missing role',
  'bad stock',
  'broken travel',
  'one-way',
  'unreachable',
  'bad dungeon',
  'bad road',
])('rejects world authoring failure: %s', (fault) => {
  const p = fixture();
  if (p.schemaVersion !== 2) throw Error('fixture');
  const w = p.world;
  if (fault === 'duplicate') w.locations.push(w.locations[0]!);
  if (fault === 'missing landmass') w.regions[0]!.landmassId = 'missing';
  if (fault === 'bad biome') w.regions[0]!.biomeId = 'missing';
  if (fault === 'bad coordinate') w.locations[0]!.position.x = -5;
  if (fault === 'overlap') w.regions[1]!.bounds = w.regions[0]!.bounds;
  if (fault === 'bad band') w.regions[0]!.levelBand = { min: 10, max: 1 };
  if (fault === 'broken neighbor') w.regions[0]!.neighborIds = ['missing'];
  if (fault === 'unbuffered levels') w.regions[0]!.levelBand = { min: 1, max: 2 };
  if (fault === 'missing monster') w.regions[0]!.monsterVariantIds = ['missing'];
  if (fault === 'wrong biome') w.monsterFamilies[0]!.biomeIds = ['biome.volcanic'];
  if (fault === 'missing resource') w.regions[0]!.resourceIds = ['missing'];
  if (fault === 'missing role') w.populations[0]!.archetypeId = 'missing';
  if (fault === 'bad stock') w.npcArchetypes[0]!.stockTemplateIds = ['missing'];
  if (fault === 'broken travel') w.travel[0]!.toLocationId = 'missing';
  if (fault === 'one-way') w.travel.shift();
  if (fault === 'unreachable')
    w.travel = w.travel.filter(
      (t) =>
        !t.fromLocationId.includes('greenvale.north_gate') &&
        !t.toLocationId.includes('greenvale.north_gate'),
    );
  if (fault === 'bad dungeon')
    w.locations.find((l) => l.kind === 'dungeon')!.dungeonArchetypeId = 'missing';
  if (fault === 'bad road') w.roads[0]!.points[0]!.x = 100000;
  expect(() => compileContentCatalog(contentManifest, [contentPacks[0], p])).toThrow();
});
it('revalidates catalog links when the runtime registry is loaded directly', () => {
  const raw = structuredClone(gd.raw);
  raw.worldCatalog!.regions[0]!.resourceIds = ['missing'];
  expect(() => GameData.load(raw)).toThrow();
});
it('links playable herb nodes to catalog resources and rejects invalid harvesting/dressing', () => {
  expect(world.resourceNodes).toHaveLength(5);
  const spawns = gd.chunksForZone('zone.aurelian.greenvale_marches').flatMap((c) => c.spawnPoints);
  expect(
    spawns
      .filter((s) => s.kind === 'resource_node' && s.refId === 'material.world.wild_herb')
      .map((s) => s.refId),
  ).toEqual(['material.world.wild_herb', 'material.world.wild_herb']);
  for (const fault of ['missing', 'unimplemented', 'location', 'duplicate', 'outside'] as const) {
    const p = fixture();
    if (p.schemaVersion !== 2) throw Error('wrong fixture');
    if (fault === 'missing') p.world.resourceNodes[0]!.resourceId = 'resource.missing';
    if (fault === 'unimplemented')
      p.world.resources.find((r) => r.id === 'resource.wild_herb')!.gatheringImplemented = false;
    if (fault === 'location')
      p.world.resourceNodes[0]!.locationId = 'location.greenvale_marches.town';
    if (fault === 'duplicate') p.world.resourceNodes.push(p.world.resourceNodes[0]!);
    if (fault === 'outside') p.world.dressing[0]!.offset.x = 99999;
    expect(() =>
      compileContentCatalog(
        contentManifest,
        contentPacks.map((pack) => (pack.schemaVersion === 2 ? p : pack)),
      ),
    ).toThrow();
  }
});
it('guides coastal players toward the nearby ferry instead of a distant boundary, including the final walking leg', () => {
  const route = worldDestination(
    world,
    'location.greenvale.north_gate',
    'zone.aurelian.amber_coast',
    {
      fromPosition: { x: 272, z: 104 },
      destinationPosition: { x: -6, z: 6 },
    },
  );
  expect(route?.location.id).toBe('location.amber_coast.port');
  expect(route?.travelId).toBe('travel.amber_coast.port.to.greenvale_marches.port');
});
it('uses endpoint walking distances, can take an extra short connection, and excludes unavailable quest passages', () => {
  const place = (id: string, zoneId: string, x: number) => ({
    ...world.locations[0]!,
    id,
    zoneId,
    position: { x, y: 0, z: 0 },
  });
  const link = (id: string, fromLocationId: string, toLocationId: string) => ({
    id,
    fromLocationId,
    toLocationId,
    name: id,
    mode: 'boat' as const,
    enabled: true,
    requiredQuestId: null as string | null,
  });
  const w = {
    ...world,
    locations: [
      place('a.near', 'a', 0),
      place('a.far', 'a', 100),
      place('b.near', 'b', 0),
      place('b.far', 'b', 1000),
      place('c.port', 'c', 0),
      place('c.exit', 'c', 5),
    ],
    travel: [link('direct.near', 'a.near', 'b.far'), link('direct.far', 'a.far', 'b.near')],
  };
  expect(worldDestination(w, 'b.near', 'a', { fromPosition: { x: 0, z: 0 } })?.travelId).toBe(
    'direct.far',
  );
  expect(
    worldDestination(w, 'b.near', 'a', {
      fromPosition: { x: 0, z: 0 },
      destinationPosition: { x: 1000, z: 0 },
    })?.travelId,
  ).toBe('direct.near');
  w.travel.push(link('via.c', 'a.near', 'c.port'), link('via.b', 'c.exit', 'b.near'));
  expect(worldDestination(w, 'b.near', 'a', { fromPosition: { x: 0, z: 0 } })?.travelId).toBe(
    'via.c',
  );
  w.travel.find((t) => t.id === 'via.b')!.requiredQuestId = 'quest.pass';
  expect(worldDestination(w, 'b.near', 'a', { fromPosition: { x: 0, z: 0 } })?.travelId).toBe(
    'direct.far',
  );
  expect(
    worldDestination(w, 'b.near', 'a', {
      fromPosition: { x: 0, z: 0 },
      completedQuestIds: new Set(['quest.pass']),
    })?.travelId,
  ).toBe('via.c');
  w.travel.find((t) => t.id === 'via.b')!.enabled = false;
  expect(
    worldDestination(w, 'b.near', 'a', {
      fromPosition: { x: 0, z: 0 },
      completedQuestIds: new Set(['quest.pass']),
    })?.travelId,
  ).toBe('direct.far');
  w.travel.forEach((t) => {
    t.enabled = false;
  });
  expect(worldDestination(w, 'b.near', 'a')).toBeNull();
  expect(worldDestination(w, 'b.near', 'b')?.travelId).toBeNull();
});
