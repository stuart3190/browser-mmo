import { expect, it } from 'vitest';
import { GameData, getGameData, DEMO_ZONE_ID } from '@mmo/game-data';
import { uuidv7 } from '@mmo/shared';
import { ZoneSimulation } from './zone-simulation';
it('additive Waystone recovery preserves old entities and live player state and adds Rill exactly once', () => {
  const current = getGameData();
  const raw = structuredClone(current.raw);
  raw.quests = raw.quests.filter(
    (q) =>
      q.id !== 'quest.greenvale.old_waystone' &&
      q.id !== 'quest.greenvale.hollow_trail' &&
      q.id !== 'quest.greenvale.root_wound' &&
      q.id !== 'quest.greenvale.stillwater' &&
      q.id !== 'quest.greenvale.well_records',
  );
  raw.npcs = raw.npcs.filter((n) => n.id !== 'npc.greenvale.keeper_rill');
  for (const c of raw.chunks)
    c.spawnPoints = c.spawnPoints.filter((s) => s.id !== 'spawn.greenvale.waystone_keeper');
  const old = new ZoneSimulation(GameData.load(raw), DEMO_ZONE_ID);
  const id = uuidv7(),
    cooldown = Date.now() + 12000;
  old.addPlayer(
    {
      characterId: id,
      name: 'Saved',
      maxSpeed: 6,
      combat: {
        level: 2,
        health: 32,
        maxHealth: 144,
        stats: {},
        weapon: { min: 1, max: 3, attackSpeedMs: 2000 },
        abilityCooldowns: { 'ability.warrior.heavy_strike': cooldown },
      },
    },
    { x: 0, y: 0, z: -8 },
    0,
    Date.now(),
  );
  const image = JSON.parse(old.checkpoint());
  image.version = 1;
  delete image.parties;
  const recovered = new ZoneSimulation(current, DEMO_ZONE_ID);
  recovered.restoreCheckpoint(JSON.stringify(image));
  for (const entity of old.listEntities())
    expect(recovered.listEntities().find((e) => e.id === entity.id)).toEqual(entity);
  expect(recovered.persistentState(id)).toEqual(old.persistentState(id));
  expect(
    recovered.listEntities().filter((e) => e.refId === 'npc.greenvale.keeper_rill'),
  ).toHaveLength(1);
  recovered.restoreCheckpoint(recovered.checkpoint());
  expect(
    recovered.listEntities().filter((e) => e.refId === 'npc.greenvale.keeper_rill'),
  ).toHaveLength(1);
  expect(JSON.parse(recovered.checkpoint()).version).toBe(2);
});
