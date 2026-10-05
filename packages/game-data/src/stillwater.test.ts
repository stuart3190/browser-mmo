import { expect, it } from 'vitest';
import { getGameData, questAvailability } from './index';
it('adds Stillwater to the exact existing content, keeps terrain/progression, and gates it after Root-Wound', async () => {
  const gd = getGameData(),
    old = structuredClone(gd.raw);

  for (const c of old.chunks)
    c.colliders = c.colliders.filter(
      (p) =>
        ![
          [24, 115],
          [24, 122],
          [38, 122],
          [38, 115],
        ].some(([x, z]) => p.x === x && p.z === z),
    );

  old.quests = old.quests.filter((q) => q.id !== 'quest.greenvale.keeper_outpost');
  old.enemies = old.enemies.filter((e) => e.id !== 'enemy.greenvale.last_door_sentinel');
  old.lootTables = old.lootTables.filter((l) => l.id !== 'loot.greenvale.last_door_sentinel');
  old.itemTemplates = old.itemTemplates.filter(
    (i) => i.id !== 'accessory.cloak.oathkeepers_mantle',
  );
  for (const z of old.zones)
    z.landmarks = z.landmarks.filter((l) => l.id !== 'landmark.greenvale.keeper_outpost');
  for (const c of old.chunks)
    c.spawnPoints = c.spawnPoints.filter((s) => s.id !== 'spawn.greenvale.last_door_sentinel');
  old.quests = old.quests.filter((q) => q.id !== 'quest.greenvale.well_records');
  old.itemTemplates = old.itemTemplates.filter(
    (i) => i.id !== 'accessory.necklace.springward_pendant',
  );
  for (const z of old.zones)
    z.landmarks = z.landmarks.filter(
      (l) => !['landmark.greenvale.old_well', 'landmark.greenvale.spring_culvert'].includes(l.id),
    );
  const stillwater = structuredClone(old);
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

  const hash = [
    ...new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(old))),
    ),
  ]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  expect(hash).toBe('8d18c22459d9ad219d56832b052805115cf907fd8bbceacdb22e4bb88af2674b');
  const currentHash = [
    ...new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(stillwater))),
    ),
  ]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  expect(currentHash).toBe('9614a98b965120cf0f6ff2e419b5b71042d96226a9aa1df19d3fbd755944f50b');
  expect(questAvailability(gd.quest('quest.greenvale.stillwater'), 3, new Map())).toMatchObject({
    reason: 'PREREQUISITE',
  });
  const c = gd.collisionWorld('zone.greenvale.meadows');
  for (const [x, z] of [
    [63, 38],
    [75, 27],
    [72, 27],
    [78, 27],
    [75, 24],
    [75, 30],
  ])
    expect(c.overlaps({ x: x!, z: z! }, 0.4)).toBe(false);
});
