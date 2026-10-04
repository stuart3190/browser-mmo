import { expect, it } from 'vitest';
import { getGameData } from './index';
it('Hollow is additive to the exact prior content hash; existing terrain is unchanged', async () => {
  const raw = getGameData().raw;
  const old = structuredClone(raw);
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
