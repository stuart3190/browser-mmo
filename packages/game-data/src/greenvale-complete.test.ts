import { expect, it } from 'vitest';
import { ContentPackSchema } from '@mmo/schemas';
import {
  compileContentCatalog,
  contentManifest,
  contentPacks,
  getGameData,
  CollisionWorld,
  chunkColliders,
} from './index';
import { questAvailability, questState } from './rules/quests';
const gd = getGameData();
it('connects a complete Marches closure to deployed progression, existing geography and catalogs', () => {
  const ids = [
    'marches_call',
    'marches_supply',
    'marches_boundary',
    'marches_vault',
    'marches_home',
  ];
  let previous = 'quest.greenvale.keeper_outpost';
  for (const id of ids) {
    const q = gd.quest(`quest.greenvale.${id}`);
    expect(q.prerequisites).toEqual([previous]);
    expect(q.placeholder).toBe(false);
    previous = q.id;
  }
  expect(gd.raw.dungeonEntries![0]!.mode).toBe('private_instance');
  expect(gd.raw.serviceOffers!.filter((s) => s.kind === 'craft')).toHaveLength(4);
  expect(new Set(gd.raw.worldCatalog!.resourceNodes.map((n) => n.resourceId)).size).toBe(3);
});
it.each([
  'missing npc',
  'missing item',
  'free buy',
  'free craft',
  'duplicate input',
  'missing cave',
  'missing encounter',
  'duplicate service',
])('fails closed on invalid %s', (fault) => {
  const packs = contentPacks.map((p) => ContentPackSchema.parse(structuredClone(p)));
  const pack = packs.find((p) => p.schemaVersion === 3)!;
  if (pack.schemaVersion !== 3) throw Error('wrong fixture');
  const offer = pack.serviceOffers[0]!;
  if (fault === 'missing npc') offer.npcId = 'npc.missing';
  if (fault === 'missing item') offer.output!.itemTemplateId = 'item.missing';
  if (fault === 'free buy') offer.copper = 0;
  if (fault === 'free craft') {
    offer.kind = 'craft';
    offer.inputs = [];
  }
  if (fault === 'duplicate input') {
    offer.kind = 'craft';
    offer.inputs = [
      { itemTemplateId: 'material.world.hardwood', quantity: 1 },
      { itemTemplateId: 'material.world.hardwood', quantity: 1 },
    ];
  }
  if (fault === 'missing cave') pack.dungeonEntries[0]!.locationId = 'location.missing';
  if (fault === 'missing encounter') pack.dungeonEntries[0]!.enemyIds = ['enemy.missing'];
  if (fault === 'duplicate service') pack.serviceOffers.push(offer);
  expect(() => compileContentCatalog(contentManifest, packs)).toThrow();
});
it('requires a new explicit acceptance after a daily cooldown and resets no old completion', () => {
  const q = gd.quest('quest.greenvale.marches_patrol');
  const records = new Map([
    [
      q.id,
      {
        questId: q.id,
        status: 'completed' as const,
        progress: { boars: 2 },
        acceptedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      },
    ],
  ]);
  expect(questAvailability(q, 3, records).ok).toBe(false);
  expect(questState(q, 3, records, () => 0)).toBe('completed');
  records.get(q.id)!.completedAt = new Date(Date.now() - 86400001).toISOString();
  expect(questAvailability(q, 3, records).ok).toBe(true);
  expect(questState(q, 3, records, () => 0)).toBe('available');
  expect(
    questAvailability(
      gd.quest('quest.greenvale.wolves_at_the_edge'),
      3,
      new Map([
        [
          'quest.greenvale.wolves_at_the_edge',
          { ...records.get(q.id)!, questId: 'quest.greenvale.wolves_at_the_edge' },
        ],
      ]),
    ).ok,
  ).toBe(false);
});
it('keeps new river and vault road widths walkable around settlement props', () => {
  const collision = new CollisionWorld(
    gd.chunksForZone('zone.aurelian.greenvale_marches').flatMap(chunkColliders),
  );
  for (const road of gd.raw.worldCatalog!.roads.filter((r) =>
    ['road.greenvale_marches.river_route', 'road.greenvale_marches.vault_route'].includes(r.id),
  ))
    for (let i = 1; i < road.points.length; i++)
      expect(
        collision.sweepBlocked(road.points[i - 1]!, road.points[i]!, road.width / 2 + 0.45),
      ).toBe(false);
});
