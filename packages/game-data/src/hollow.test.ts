import { getStarterGameData as getGameData } from './starter-testing';
import { expect, it } from 'vitest';

it('Hollow is additive to the exact prior content hash; existing terrain is unchanged', async () => {
  const raw = getGameData().raw;
  const old = structuredClone(raw);

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

  old.quests = old.quests.filter((q) => q.id !== 'quest.greenvale.root_wound');
  old.enemies = old.enemies.filter((e) => e.id !== 'enemy.greenvale.hollow_lantern');
  old.lootTables = old.lootTables.filter((l) => l.id !== 'loot.greenvale.hollow_lantern');
  old.itemTemplates = old.itemTemplates.filter((i) => i.id !== 'accessory.cloak.rootward_mantle');
  for (const c of old.chunks)
    c.spawnPoints = c.spawnPoints.filter((s) => s.id !== 'spawn.greenvale.hollow_lantern');
  old.quests = old.quests.filter((q) => q.id !== 'quest.greenvale.hollow_trail');
  old.enemies = old.enemies.filter((e) => e.id !== 'enemy.greenvale.brackenmaw');
  old.lootTables = old.lootTables.filter((l) => l.id !== 'loot.greenvale.brackenmaw');
  old.itemTemplates = old.itemTemplates.filter((i) => i.id !== 'accessory.trinket.keepers_token');
  old.npcs.find((n) => n.id === 'npc.greenvale.keeper_rill')!.role = 'ambient';
  for (const c of old.chunks)
    c.spawnPoints = c.spawnPoints.filter((s) => s.id !== 'spawn.greenvale.brackenmaw');
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(old)),
  );
  expect([...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')).toBe(
    '1aeb2392850b5f0455d5eda2ffcaf57ada86fe44e8024fbd71110be41ff94011',
  );
});
