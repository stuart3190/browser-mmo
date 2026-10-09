import { expect, it } from 'vitest';
import { getGameData } from '@mmo/game-data';
import { ZoneSimulation } from './zone-simulation';
const gd = getGameData();
it('heals once, persists the application receipt with health and never revives a dead character', () => {
  const zone = new ZoneSimulation(gd, 'zone.greenvale.broken_vault', {
    runtimeId: 'instance:test',
    nowMs: 1000,
  });
  const profile = {
    characterId: 'a',
    name: 'A',
    maxSpeed: 6,
    combat: {
      classId: 'class.warrior',
      level: 4,
      stats: {},
      maxHealth: 100,
      health: 20,
      weapon: { min: 1, max: 1, attackSpeedMs: 1000 },
    },
  };
  zone.addPlayer(profile, { x: 8, y: 0, z: 32 }, 0, 1000);
  zone.drainOutbox();
  expect(zone.applyConsumable('a', 'heal-one', 60)).toBe(true);
  expect(zone.applyConsumable('a', 'heal-one', 60)).toBe(false);
  expect(zone.getPlayer('a')!.health).toBe(80);
  const vitals = zone
    .drainOutbox()
    .get('a')
    ?.filter((m) => m.t === 'player.vitals');
  expect(vitals).toHaveLength(1);
  expect(vitals![0]).toMatchObject({ t: 'player.vitals', d: { health: 80 } });
  const saved = zone.checkpoint(),
    restored = new ZoneSimulation(gd, zone.zone.id, { runtimeId: 'instance:test' });
  restored.restoreCheckpoint(saved);
  expect(restored.applyConsumable('a', 'heal-one', 60)).toBe(false);
  expect(restored.getPlayer('a')!.health).toBe(80);
  zone.addPlayer(
    { ...profile, characterId: 'b', combat: { ...profile.combat, health: 0 } },
    { x: 8, y: 0, z: 32 },
    0,
    1000,
  );
  zone.applyConsumable('b', 'late-heal', 60);
  expect(zone.getPlayer('b')!.dead).toBe(true);
  expect(zone.getPlayer('b')!.health).toBe(0);
  expect(zone.applyConsumable('missing', 'no-player', 60)).toBe(false);
  expect(zone.appliedEffects.has('no-player')).toBe(false);
});
