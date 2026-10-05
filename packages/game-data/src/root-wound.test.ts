import { expect, it } from 'vitest';
import { getGameData, questAvailability } from './index';
it('adds the exact Root-Wound content without changing existing terrain or rewards', async () => {
  const gd = getGameData();
  const old = structuredClone(gd.raw);
  old.quests = old.quests.filter((q) => q.id !== 'quest.greenvale.well_records');
  old.itemTemplates = old.itemTemplates.filter(
    (i) => i.id !== 'accessory.necklace.springward_pendant',
  );
  for (const z of old.zones)
    z.landmarks = z.landmarks.filter(
      (l) => !['landmark.greenvale.old_well', 'landmark.greenvale.spring_culvert'].includes(l.id),
    );
  old.quests = old.quests.filter((q) => q.id !== 'quest.greenvale.stillwater');
  old.enemies = old.enemies.filter((e) => e.id !== 'enemy.greenvale.siltbound_warden');
  old.lootTables = old.lootTables.filter((l) => l.id !== 'loot.greenvale.siltbound_warden');
  old.itemTemplates = old.itemTemplates.filter((i) => i.id !== 'accessory.ring.stillwater_seal');
  old.npcs = old.npcs.filter((n) => n.id !== 'npc.greenvale.surveyor_tess');
  for (const z of old.zones)
    z.landmarks = z.landmarks.filter((l) => l.id !== 'landmark.greenvale.stillwater');
  for (const c of old.chunks)
    c.spawnPoints = c.spawnPoints.filter(
      (s) => !['spawn.greenvale.surveyor_tess', 'spawn.greenvale.siltbound_warden'].includes(s.id),
    );

  const rootWound = structuredClone(old);
  old.quests = old.quests.filter((q) => q.id !== 'quest.greenvale.root_wound');
  old.enemies = old.enemies.filter((e) => e.id !== 'enemy.greenvale.hollow_lantern');
  old.lootTables = old.lootTables.filter((l) => l.id !== 'loot.greenvale.hollow_lantern');
  old.itemTemplates = old.itemTemplates.filter((i) => i.id !== 'accessory.cloak.rootward_mantle');
  for (const c of old.chunks)
    c.spawnPoints = c.spawnPoints.filter((s) => s.id !== 'spawn.greenvale.hollow_lantern');
  const hash = async (data: unknown) =>
    [
      ...new Uint8Array(
        await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(data))),
      ),
    ]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  expect(await hash(old)).toBe('f8f438e06fed39f2d91ced946322aa87bba54bab3631e49cde5ef11fbeffb113');
  expect(await hash(rootWound)).toBe(
    '8d18c22459d9ad219d56832b052805115cf907fd8bbceacdb22e4bb88af2674b',
  );
  expect(questAvailability(gd.quest('quest.greenvale.root_wound'), 3, new Map())).toMatchObject({
    reason: 'PREREQUISITE',
  });
  const collision = gd.collisionWorld('zone.greenvale.meadows');
  expect(collision.overlaps({ x: -93, z: -82 }, 0.5)).toBe(false);
  expect(collision.overlaps({ x: -93, z: -72 }, 0.4)).toBe(false);
  expect(collision.hasLineOfSight({ x: -93, z: -82 }, { x: -93, z: -72 })).toBe(false);
});
