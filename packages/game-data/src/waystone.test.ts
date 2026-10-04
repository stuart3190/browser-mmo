import { describe, it, expect } from 'vitest';
import { getGameData } from './index';
import { applyTalk, objectiveProgress, questAvailability } from './rules/quests';
const gd = getGameData();
const Q = gd.quest('quest.greenvale.old_waystone');
describe('short Waystone follow-on', () => {
  it('requires the wolf quest, credits only Rill once and uses existing reward definitions', () => {
    expect(questAvailability(Q, 2, new Map())).toMatchObject({ reason: 'PREREQUISITE' });
    expect(applyTalk(Q, {}, 'npc.greenvale.elder_maren')).toBeNull();
    expect(applyTalk(Q, {}, 'npc.greenvale.keeper_rill')).toEqual({ speak_to_rill: 1 });
    expect(applyTalk(Q, { speak_to_rill: 1 }, 'npc.greenvale.keeper_rill')).toBeNull();
    expect(
      objectiveProgress(
        Q,
        {
          questId: Q.id,
          status: 'active',
          progress: { speak_to_rill: 1 },
          acceptedAt: null,
          completedAt: null,
        },
        () => 0,
      )[0]!.done,
    ).toBe(true);
  });
  it('adds only the NPC/quest to prior content; the checkpoint migration hash is exact', async () => {
    const raw = structuredClone(gd.raw);
    raw.quests = raw.quests.filter((q) => q.id !== Q.id && q.id !== 'quest.greenvale.hollow_trail');
    raw.enemies = raw.enemies.filter((e) => e.id !== 'enemy.greenvale.brackenmaw');
    raw.lootTables = raw.lootTables.filter((l) => l.id !== 'loot.greenvale.brackenmaw');
    raw.itemTemplates = raw.itemTemplates.filter((i) => i.id !== 'accessory.trinket.keepers_token');
    raw.npcs = raw.npcs.filter((n) => n.id !== 'npc.greenvale.keeper_rill');
    for (const chunk of raw.chunks)
      chunk.spawnPoints = chunk.spawnPoints.filter(
        (s) => s.id !== 'spawn.greenvale.waystone_keeper' && s.id !== 'spawn.greenvale.brackenmaw',
      );
    const digest = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(JSON.stringify(raw)),
    );
    const hash = [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
    expect(hash).toBe('7ec6af1a212a9c4fa1997d1f9f8b50f736f476361b6eb6f3f902abdf94447c51');
    expect(gd.collisionWorld('zone.greenvale.meadows').nearestFree({ x: -8, z: -90 }, 0.4)).toEqual(
      { x: -8, z: -90 },
    );
  });
});
