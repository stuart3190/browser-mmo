import { expect, it } from 'vitest';
import {
  getGameData,
  tidewatch,
  questAvailability,
  applyExploration,
  worldDestination,
} from './index';
const gd = getGameData();
it('connects the coastal chapter to earned Greenvale closure and ordinary quest authority', () => {
  let prior = 'quest.greenvale.marches_home';
  for (const id of tidewatch.questIds) {
    const q = gd.quest(id);
    expect(q.prerequisites).toEqual([prior]);
    expect(q.minLevel).toBe(5);
    expect(q.placeholder).toBe(false);
    expect(questAvailability(q, 5, new Map())).toMatchObject({ reason: 'PREREQUISITE' });
    prior = id;
  }
  const q = gd.quest(tidewatch.questIds[1]!);
  expect(
    applyExploration(q, {}, gd.zone(tidewatch.zoneId), tidewatch.landmarks[0]!.position, 100),
  ).toEqual({ tide_gauge: 1 });
  expect(
    applyExploration(q, {}, gd.zone(tidewatch.zoneId), tidewatch.landmarks[0]!.position, 0),
  ).toBeNull();
  expect(
    worldDestination(gd.raw.worldCatalog!, 'location.amber_coast.port', 'zone.greenvale.meadows')
      ?.location.id,
  ).toBe('location.greenvale.north_gate');
});
it('keeps the shore walking route and oath readable with real collision, rewards and distinct encounters', () => {
  const collision = gd.collisionWorld(tidewatch.zoneId);
  const road = gd.raw.worldCatalog!.roads.find((r) => r.id === 'road.amber_coast.tidewatch')!;
  for (let i = 1; i < road.points.length; i++) {
    const a = road.points[i - 1]!,
      b = road.points[i]!;
    const steps = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z));
    for (let j = 0; j <= steps; j++)
      expect(
        collision.overlaps(
          { x: a.x + ((b.x - a.x) * j) / steps, z: a.z + ((b.z - a.z) * j) / steps },
          0.45,
        ),
      ).toBe(false);
  }
  expect(gd.enemies.get('enemy.amber_coast.drowned_bellkeeper')).toMatchObject({
    isBoss: true,
    combat: { windupMs: 1800, cleaveArcDegrees: 120 },
  });
  expect(gd.enemies.get('enemy.amber_coast.glassback_crab')!.modelId).toBe('authored:crab');
  const reward = gd.template(gd.quest(tidewatch.questIds[2]!).rewards.items[0]!.itemTemplateId);
  expect(reward.requiredLevel).toBe(5);
  expect(reward.equipment?.baseStats.strength).toBeDefined();
  expect(reward.equipment?.baseStats.intellect).toBeDefined();
});
it('offers earned weapon upgrades for both classes, from guaranteed solo shore salvage and story rewards', () => {
  for (const type of ['sword', 'staff']) {
    const offer = gd.raw.serviceOffers!.find((o) => o.id === `service.amber_coast.craft_${type}`)!;
    expect(offer.requiresQuestId).toBe(tidewatch.questIds[2]);
    expect(offer.npcId).toBe(tidewatch.npcId);
    expect(offer.copper).toBe(-100);
    const gear = gd.template(offer.output!.itemTemplateId);
    const starter = gd.template(
      type === 'sword' ? 'weapon.sword.iron_longsword' : 'weapon.staff.oak_staff',
    );
    expect(gear.requiredLevel).toBe(5);
    expect(gear.equipment!.weapon!.minDamage).toBeGreaterThan(starter.equipment!.weapon!.minDamage);
    expect(gear.allowedClassIds).toEqual([type === 'sword' ? 'class.warrior' : 'class.mage']);
    for (const cost of offer.inputs) {
      const reward = ['enemy.amber_coast.glassback_crab', 'enemy.amber_coast.drowned_bellkeeper']
        .map((id) => gd.lootTables.get(gd.enemies.get(id)!.lootTableId!)!)
        .find((loot) => loot.entries.some((e) => e.itemTemplateId === cost.itemTemplateId))!;
      expect(reward.emptyChance).toBe(0);
      const entry = reward.entries.find((e) => e.itemTemplateId === cost.itemTemplateId)!;
      const kills = cost.itemTemplateId.endsWith('field_hide') ? 2 : 1;
      expect(entry.minQuantity * kills).toBeGreaterThanOrEqual(cost.quantity);
    }
  }
});
