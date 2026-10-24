import { expect, it } from 'vitest';
import { getGameData, livingSeal, applyExploration, worldDestination } from './index';
const gd = getGameData();
it('connects a living-seal chapter to the coastal story with accessible survey sites and boat guidance', () => {
  let previous = 'quest.amber_coast.last_bell';
  for (const id of livingSeal.questIds) {
    const q = gd.quest(id);
    expect(q.prerequisites).toEqual([previous]);
    expect(q.placeholder).toBe(false);
    previous = id;
  }
  const q = gd.quest(livingSeal.questIds[1]!);
  expect(
    applyExploration(q, {}, gd.zone(livingSeal.zoneId), livingSeal.landmarks[0]!.position, 100),
  ).toEqual({ listening_roots: 1 });
  expect(
    applyExploration(q, {}, gd.zone(livingSeal.zoneId), livingSeal.landmarks[0]!.position, 0),
  ).toBeNull();
  expect(
    worldDestination(gd.raw.worldCatalog, 'location.elderwood.port', 'zone.aurelian.amber_coast', {
      fromPosition: { x: 272, z: 104 },
      destinationPosition: { x: 270, z: 3988 },
    })?.travelId,
  ).toBe('travel.amber_coast.port.to.greenvale_marches.port');
  const road = gd.raw.worldCatalog!.roads.find((r) => r.id === 'road.elderwood.living_seal')!;
  const collision = gd.collisionWorld(livingSeal.zoneId);
  for (let i = 1; i < road.points.length; i++) {
    const a = road.points[i - 1]!,
      b = road.points[i]!,
      steps = Math.ceil(Math.hypot(a.x - b.x, a.z - b.z));
    for (let n = 0; n <= steps; n++)
      expect(
        collision.overlaps(
          { x: a.x + ((b.x - a.x) * n) / steps, z: a.z + ((b.z - a.z) * n) / steps },
          0.45,
        ),
      ).toBe(false);
  }
  const reward = gd.template(gd.quest(livingSeal.questIds[2]!).rewards.items[0]!.itemTemplateId);
  expect(reward.allowedClassIds).toEqual([]);
  expect(reward.equipment!.baseStats.stamina!.min).toBe(8);
  expect(livingSeal.questIds.reduce((s, id) => s + gd.quest(id).rewards.xp, 0)).toBe(3000);
});
