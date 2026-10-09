import { expect, it } from 'vitest';
import {
  brokenVault,
  getGameData,
  professions,
  professionItems,
  professionOffers,
  professionRank,
  toolFor,
  craftDuration,
} from './index';
const gd = getGameData();
it('profession items/services reference real stock, NPCs and material sinks with bounded timing', () => {
  for (const offer of professionOffers) {
    expect(gd.npcs.has(offer.npcId)).toBe(true);
    expect(gd.itemTemplates.has(offer.output!.itemTemplateId)).toBe(true);
    for (const cost of offer.inputs)
      expect(gd.template(cost.itemTemplateId).goesToMaterialPouch).toBe(true);
    expect(craftDuration(offer)).toBe(offer.kind === 'craft' ? 5000 : 0);
  }
  for (const profession of professions.filter((p) => p.materialId))
    for (const tier of [1, 2])
      expect(
        professionItems.some((i) => i.id === toolFor(profession.id, tier) && i.maxStack === 1),
      ).toBe(true);
  expect([0, 99, 100, 399, 400, 500, 1000].map(professionRank)).toEqual([1, 1, 2, 4, 5, 5, 5]);
});
it('private Vault uses a bounded separate catalog space and three nonrespawning run objectives', () => {
  const zone = gd.zone(brokenVault.zoneId);
  expect(zone.instanced).toBe(true);
  expect(
    gd.raw.worldCatalog!.locations.find((l) => l.id === brokenVault.entranceLocationId),
  ).toBeDefined();
  const spawns = gd.chunksForZone(zone.id).flatMap((c) => c.spawnPoints);
  expect(spawns.map((s) => s.id)).toEqual(brokenVault.objectives);
  expect(spawns.every((s) => s.respawnMs! >= brokenVault.lifetimeMs)).toBe(true);
  expect(gd.enemy('enemy.greenvale.vault_keeper').combat!.groundStrikeRadius).toBe(5);
  expect(gd.template(brokenVault.rewardTemplateId).goesToMaterialPouch).toBe(true);
});
