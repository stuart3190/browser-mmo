import { expect, it } from 'vitest';
import { GameData, getGameData, tidewatch } from '@mmo/game-data';
import { ZoneSimulation } from './zone-simulation';
const gd = getGameData();
it('lets a mage escape the Bellkeeper sweep while a guarded warrior absorbs a reduced hit; the boss resists roots', () => {
  const sim = new ZoneSimulation(gd, tidewatch.zoneId, { nowMs: 1000, rng: { next: () => 0.5 } });
  for (const [id, classId, z] of [
    ['mage', 'class.mage', 214],
    ['warrior', 'class.warrior', 215],
  ] as const)
    sim.addPlayer(
      {
        characterId: id,
        name: id,
        maxSpeed: 6,
        combat: {
          classId,
          level: 5,
          health: 200,
          maxHealth: 200,
          stats: { intellect: 22, strength: 20 },
          weapon: { min: 1, max: 2, attackSpeedMs: 2000 },
        },
      },
      { x: 360, y: 0, z },
      0,
      1000,
    );
  sim.useAbility('mage', 'ability.mage.frost_nova', 1000);
  sim.useAbility('warrior', 'ability.warrior.guard', 1000);
  const boss = sim.listEntities().find((e) => e.refId === 'enemy.amber_coast.drowned_bellkeeper')!;
  expect(boss.statuses?.some((s) => s.kind === 'root') ?? false).toBe(false);
  sim.step(1050);
  sim.step(1100);
  expect(boss.attackCue?.cleave).toBeTruthy();
  const cue = structuredClone(boss.attackCue)!;
  for (let i = 1; i <= 20; i++) {
    const now = 1100 + i * 50;
    sim.handleMove('mage', { x: 360 - i * 0.25, y: 0, z: 214 }, 0, now);
    sim.step(now);
  }
  expect(boss.attackCue).toEqual(cue);
  for (let now = 2150; now <= 3100; now += 50) sim.step(now);
  expect(sim.getHealth('mage')).toBe(200);
  expect(sim.getHealth('warrior')).toBeLessThan(200);
  expect(sim.getHealth('warrior')).toBeGreaterThanOrEqual(185);
});
it('adds the new coastal actors to an older zone image while preserving existing players and entities', () => {
  const raw = structuredClone(gd.raw);
  for (const chunk of raw.chunks)
    chunk.spawnPoints = chunk.spawnPoints.filter((s) => !s.id.startsWith('spawn.amber_coast.'));
  const old = new ZoneSimulation(GameData.load(raw), tidewatch.zoneId, { nowMs: 1000 });
  old.addPlayer(
    {
      characterId: 'existing',
      name: 'Existing',
      maxSpeed: 6,
      combat: {
        classId: 'class.warrior',
        level: 5,
        health: 77,
        maxHealth: 200,
        stats: {},
        weapon: { min: 1, max: 2, attackSpeedMs: 2000 },
      },
    },
    { x: 256, y: 0, z: 96 },
    0,
    1000,
  );
  const before = structuredClone(old.listEntities());
  const restored = new ZoneSimulation(gd, tidewatch.zoneId, { nowMs: 1000 });
  restored.restoreCheckpoint(old.checkpoint());
  expect(restored.persistentState('existing')).toEqual(old.persistentState('existing'));
  for (const entity of before)
    expect(restored.listEntities().find((e) => e.id === entity.id)).toEqual(entity);
  expect(
    restored.listEntities().filter((e) => e.refId?.startsWith('enemy.amber_coast.')),
  ).toHaveLength(3);
  expect(restored.listEntities().filter((e) => e.refId === tidewatch.npcId)).toHaveLength(1);
});
