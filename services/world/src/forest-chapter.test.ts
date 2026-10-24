import { expect, it } from 'vitest';
import { getGameData, livingSeal } from '@mmo/game-data';
import { uuidv7 } from '@mmo/shared';
import { ZoneSimulation } from './zone-simulation';
it.each(['enemy.elderwood.briar_spitter', 'enemy.elderwood.rootbound_cantor'])(
  'keeps %s ground strikes fixed, dodgeable and recoverable without duplicate damage',
  (ref) => {
    const gd = getGameData(),
      sim = new ZoneSimulation(gd, livingSeal.zoneId, { nowMs: 1000, rng: { next: () => 0.5 } });
    const enemy = sim.listEntities().find((e) => e.refId === ref)!;
    const id = uuidv7(),
      at = { x: enemy.position.x, y: 0, z: enemy.position.z + 8 };
    sim.addPlayer(
      {
        characterId: id,
        name: 'Reader',
        maxSpeed: 6,
        combat: {
          level: 6,
          health: 200,
          maxHealth: 200,
          stats: {},
          weapon: { min: 1, max: 1, attackSpeedMs: 2000 },
        },
      },
      at,
      0,
      1000,
    );
    let now = 1000;
    const step = (ms: number) => {
      for (const until = now + ms; now < until;) {
        now += 50;
        sim.step(now);
      }
    };
    step(100);
    const cue = structuredClone(enemy.attackCue)!;
    expect(cue.groundPosition).toEqual(at);
    const restored = new ZoneSimulation(gd, livingSeal.zoneId, { rng: { next: () => 0.5 } });
    restored.restoreCheckpoint(sim.checkpoint());
    restored.step(cue.endsAtMs);
    expect(restored.persistentState(id)!.health).toBeLessThan(200);
    const hit = restored.persistentState(id)!.health;
    restored.step(cue.endsAtMs + 50);
    expect(restored.persistentState(id)!.health).toBe(hit);
    for (let n = 1; n <= 20; n++) {
      step(50);
      sim.handleMove(id, { x: at.x + n * 0.3, y: 0, z: at.z }, 0, now);
    }
    expect(enemy.attackCue?.groundPosition).toEqual(cue.groundPosition);
    step(cue.endsAtMs - now + 50);
    expect(sim.persistentState(id)!.health).toBe(200);
    expect(enemy.attackCue).toBeNull();
  },
);

it.each([
  ['zone.aurelian.elderwood', { x: 384, y: 0, z: 3860 }, { x: 270, z: 3988 }],
  ['zone.aurelian.amber_coast', { x: 360, y: 0, z: 220 }, { x: 272, z: 104 }],
] as const)('returns fallen chapter adventurers to the nearby camp in %s', (zone, death, camp) => {
  const sim = new ZoneSimulation(getGameData(), zone, { nowMs: 0 });
  const characterId = uuidv7();
  sim.addPlayer(
    {
      characterId,
      name: 'Fallen reader',
      maxSpeed: 6,
      combat: {
        level: 5,
        health: 0,
        maxHealth: 200,
        stats: {},
        weapon: { min: 1, max: 1, attackSpeedMs: 2000 },
      },
    },
    death,
    0,
    0,
  );
  sim.respawn(characterId, 10000);
  expect(sim.getPlayer(characterId)!.position).toMatchObject(camp);
  expect(sim.persistentState(characterId)!.health).toBe(200);
});
