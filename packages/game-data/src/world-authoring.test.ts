import { expect, it } from 'vitest';
import { ContentPackSchema } from '@mmo/schemas';
import { compileContentCatalog, contentManifest, contentPacks, GameData } from './index';

const fixture = () => contentPacks.map((p) => ContentPackSchema.parse(structuredClone(p)));
it('lets future authored quests reference existing world inhabitants, monsters and material rewards', () => {
  const packs = fixture(),
    old = packs.find((p) => p.schemaVersion === 1)!,
    atlas = packs.find((p) => p.schemaVersion === 2)!;
  if (atlas.schemaVersion !== 2) throw Error('atlas fixture');
  const archetype = atlas.world.npcArchetypes.find((a) => a.role === 'faction')!;
  // Giving an existing inhabitant quests is a data-only role promotion, not a new NPC/spawn.
  archetype.runtimeRole = 'quest_giver';
  const npcId = atlas.world.populations.find((p) => p.archetypeId === archetype.id)!.id,
    materialId = atlas.world.materials[0]!.id,
    enemyId = atlas.world.regions[0]!.monsterVariantIds[0]!;
  old.quests[0]!.giverNpcId = npcId;
  old.quests[0]!.turnInNpcId = npcId;
  for (const o of old.quests[0]!.objectives) {
    if (o.kind === 'talk') o.npcId = npcId;
    if (o.kind === 'kill') o.enemyId = enemyId;
  }
  const reward = old.rewards.find((r) => r.kind === 'quest')!;
  if (reward.kind !== 'quest') throw Error('quest fixture');
  reward.value.items = [{ itemTemplateId: materialId, quantity: 1 }];
  const gd = GameData.load(compileContentCatalog(contentManifest, packs));
  expect(gd.quest(old.quests[0]!.id).giverNpcId).toBe(npcId);
  expect(gd.quest(old.quests[0]!.id).rewards.items[0]!.itemTemplateId).toBe(materialId);
  expect(gd.enemies.has(enemyId)).toBe(true);
});
it('places ordinary content-pack inhabitants into valid sparse region chunks', () => {
  const packs = fixture(),
    old = packs.find((p) => p.schemaVersion === 1)!,
    atlas = packs.find((p) => p.schemaVersion === 2)!;
  if (atlas.schemaVersion !== 2) throw Error('atlas fixture');
  const zoneId = atlas.world.regions[0]!.zoneId;
  const placement = old.npcs[0]!.placements[0]!;
  placement.zoneId = zoneId;
  placement.spawn.position = { x: 1200, y: 0, z: 1300 };
  const gd = GameData.load(compileContentCatalog(contentManifest, packs));
  expect(gd.worldChunk(zoneId, { cx: 18, cz: 20 }).spawnPoints).toContainEqual(placement.spawn);
});
it('rejects world IDs that conflict with legacy content in another catalog category', () => {
  const packs = fixture(),
    atlas = packs.find((p) => p.schemaVersion === 2)!;
  if (atlas.schemaVersion !== 2) throw Error('atlas fixture');
  atlas.world.locations.find((l) => l.kind === 'landmark')!.id =
    'quest.greenvale.wolves_at_the_edge';
  expect(() => compileContentCatalog(contentManifest, packs)).toThrow('Conflicting');
});
it('rejects undeclared physical adjacency even if boats still make every zone reachable', () => {
  const packs = fixture(),
    atlas = packs.find((p) => p.schemaVersion === 2)!;
  if (atlas.schemaVersion !== 2) throw Error('atlas fixture');
  const a = atlas.world.regions[0]!,
    b = atlas.world.regions.find((r) => r.id === a.neighborIds[0])!;
  a.neighborIds = a.neighborIds.filter((id) => id !== b.id);
  b.neighborIds = b.neighborIds.filter((id) => id !== a.id);
  expect(() => compileContentCatalog(contentManifest, packs)).toThrow('adjacency');
});
it('rejects reciprocal road links jumping between unrelated continents', () => {
  const packs = fixture(),
    atlas = packs.find((p) => p.schemaVersion === 2)!;
  if (atlas.schemaVersion !== 2) throw Error('atlas fixture');
  const w = atlas.world,
    route = w.travel.find((t) => t.mode === 'road')!,
    reverse = w.travel.find(
      (t) => t.fromLocationId === route.toLocationId && t.toLocationId === route.fromLocationId,
    )!,
    far = w.locations.find((l) => l.kind === 'gate' && l.regionId.startsWith('region.frostmere.'))!;
  route.toLocationId = far.id;
  reverse.fromLocationId = far.id;
  expect(() => compileContentCatalog(contentManifest, packs)).toThrow('adjacency');
});
