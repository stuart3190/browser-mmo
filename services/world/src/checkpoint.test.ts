import { expect, it } from 'vitest';
import { getGameData, seededRng } from '@mmo/game-data';
import { ZoneSimulation } from './zone-simulation';
import { ARENA, arenaGameData } from './test-arena';
import { legacyCheckpoint } from './checkpoint-test-reference';

it('preserves the exact version-2 recovery image for every authored zone', () => {
  const gd = getGameData();
  for (const zone of gd.zones.values()) {
    const sim = new ZoneSimulation(gd, zone.id, { nowMs: 1000, rng: seededRng(7) });
    expect(sim.checkpoint(), zone.id).toBe(legacyCheckpoint(sim));
    sim.step(1050);
    expect(sim.checkpoint(), zone.id).toBe(legacyCheckpoint(sim));
  }
});

it('preserves combat, party, cooldown, collection and applied-effect state through recovery', () => {
  const gd = arenaGameData();
  const sim = new ZoneSimulation(gd, ARENA, { nowMs: 1000, rng: seededRng(7) });
  for (const id of ['a', 'b']) {
    sim.addPlayer(
      {
        characterId: id,
        name: id,
        maxSpeed: 6,
        combat: {
          level: 1,
          stats: { strength: 12 },
          health: 144,
          maxHealth: 144,
          weapon: { min: 7, max: 13, attackSpeedMs: 2400 },
          abilityCooldowns: { 'ability.warrior.battle_strike': 6000 },
        },
      },
      { x: 2, y: 0, z: 12 },
      0,
      1000,
    );
    sim.setConnected(id, true, 1000);
  }
  sim.parties.invite('a', 'b', 1000);
  sim.appliedEffects.add('durable-heal-once');
  sim.setTarget('a', sim.enemyIds()[0]!);
  sim.useAbility('a', 'ability.warrior.heavy_strike', 1000);
  sim.step(1050);
  expect(sim.checkpoint()).toBe(legacyCheckpoint(sim));
  const restored = new ZoneSimulation(gd, ARENA, { nowMs: 1050 });
  expect(restored.restoreCheckpoint(sim.checkpoint())).toEqual(['a', 'b']);
  expect(restored.persistentState('a')).toEqual(sim.persistentState('a'));
  expect(restored.appliedEffects.has('durable-heal-once')).toBe(true);
  expect(restored.checkpoint()).toBe(legacyCheckpoint(restored));
});
