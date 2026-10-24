import { expect, it } from 'vitest';
import { GameData } from '@mmo/game-data';
import { ARENA, arenaGameData } from './test-arena';
import { ZoneSimulation } from './zone-simulation';
import { legacyCheckpoint } from './checkpoint-test-reference';

const GUARD = 'ability.warrior.guard';
const NOVA = 'ability.mage.frost_nova';
const gd = arenaGameData();
function setup(classId = 'class.warrior', level = 3, data = gd, z = 12) {
  const sim = new ZoneSimulation(data, ARENA, { nowMs: 1000, rng: { next: () => 0.5 } });
  const id = sim.addPlayer(
    {
      characterId: 'p',
      name: 'Player',
      maxSpeed: 6,
      combat: {
        classId,
        level,
        stats: { strength: 12, intellect: 14 },
        health: 500,
        maxHealth: 500,
        weapon: { min: 1, max: 2, attackSpeedMs: 2000 },
      },
    },
    { x: 2, y: 0, z },
    0,
    1000,
  );
  return { sim, id, enemy: sim.enemyIds()[0]! };
}
const statuses = (sim: ZoneSimulation, id: string) =>
  sim.listEntities().find((e) => e.id === id)?.statuses ?? [];

it('requires the correct class, earned level, alive state and server cooldown for tactical abilities', () => {
  const low = setup('class.warrior', 2);
  expect(() => low.sim.useAbility('p', GUARD, 1000)).toThrow(
    expect.objectContaining({ code: 'ABILITY_LOCKED' }),
  );
  const t = setup();
  expect(() => t.sim.useAbility('p', NOVA, 1000)).toThrow(
    expect.objectContaining({ code: 'ABILITY_NOT_AVAILABLE' }),
  );
  t.sim.useAbility('p', GUARD, 1000); // no selected target required
  expect(statuses(t.sim, t.id)).toEqual([{ kind: 'guard', magnitude: 0.5, expiresAtMs: 5000 }]);
  expect(() => t.sim.useAbility('p', GUARD, 1001)).toThrow(
    expect.objectContaining({ code: 'ON_COOLDOWN' }),
  );
  t.sim.setTarget('p', t.enemy);
  expect(() => t.sim.useAbility('p', 'ability.warrior.heavy_strike', 1001)).toThrow(
    expect.objectContaining({ code: 'ON_COOLDOWN' }),
  );
  const state = JSON.parse(t.sim.checkpoint());
  state.players.$map[0][1].dead = true;
  t.sim.restoreCheckpoint(JSON.stringify(state));
  expect(() => t.sim.useAbility('p', GUARD, 30000)).toThrow(
    expect.objectContaining({ code: 'YOU_ARE_DEAD' }),
  );
});

it('reduces actual incoming damage, survives recovery, expires and retains its cooldown', () => {
  const guarded = setup(),
    plain = setup();
  guarded.sim.useAbility('p', GUARD, 1000);
  for (const sim of [guarded.sim, plain.sim]) {
    sim.step(1050);
    sim.step(1100);
  }
  const normalDamage = 500 - plain.sim.getHealth('p')!;
  expect(normalDamage).toBeGreaterThan(0);
  expect(500 - guarded.sim.getHealth('p')!).toBe(Math.max(1, Math.round(normalDamage / 2)));
  expect(guarded.sim.checkpoint()).toBe(legacyCheckpoint(guarded.sim));
  const recovered = new ZoneSimulation(gd, ARENA, { nowMs: 2000, rng: { next: () => 0.5 } });
  recovered.restoreCheckpoint(guarded.sim.checkpoint());
  expect(statuses(recovered, guarded.id)).toEqual(statuses(guarded.sim, guarded.id));
  recovered.step(5000);
  expect(statuses(recovered, guarded.id)).toEqual([]);
  expect(() => recovered.useAbility('p', GUARD, 5000)).toThrow(
    expect.objectContaining({ code: 'ON_COOLDOWN' }),
  );
  const saved = recovered.persistentState('p')!;
  expect(saved.abilityCooldowns).toMatchObject({ [GUARD]: 21000 });
  expect(recovered.checkpoint()).toBe(legacyCheckpoint(recovered));
});

it('roots nearby enemies, keeps them stationary until expiry and restores the same root after recovery', () => {
  const t = setup('class.mage', 3, gd, 9);
  const before = t.sim.getEnemy(t.enemy)!.position;
  expect(t.sim.useAbility('p', NOVA, 1000).damage).toBeGreaterThan(0);
  expect(statuses(t.sim, t.enemy)).toEqual([{ kind: 'root', magnitude: 0, expiresAtMs: 4000 }]);
  t.sim.step(1050);
  t.sim.step(2000);
  t.sim.step(3950);
  expect(t.sim.getEnemy(t.enemy)!.position).toEqual(before);
  const recovered = new ZoneSimulation(gd, ARENA, { nowMs: 3950, rng: { next: () => 0.5 } });
  recovered.restoreCheckpoint(t.sim.checkpoint());
  expect(statuses(recovered, t.enemy)[0]?.expiresAtMs).toBe(4000);
  recovered.step(3990);
  expect(recovered.getEnemy(t.enemy)!.position).toEqual(before);
  recovered.step(4100);
  expect(statuses(recovered, t.enemy)).toEqual([]);
  expect(recovered.getEnemy(t.enemy)!.position.z).toBeLessThan(before.z);
  expect(recovered.checkpoint()).toBe(legacyCheckpoint(recovered));
});

it('rooted enemies can still attack in reach and bosses take damage without being rooted', () => {
  const t = setup('class.mage');
  t.sim.useAbility('p', NOVA, 1000);
  t.sim.step(1050);
  expect(t.sim.getHealth('p')).toBeLessThan(500);
  const raw = structuredClone(gd.raw);
  raw.enemies.find((e) => e.id === 'enemy.greenvale.grey_wolf')!.isBoss = true;
  const boss = setup('class.mage', 3, GameData.load(raw));
  const before = boss.sim.getEnemy(boss.enemy)!.health;
  boss.sim.useAbility('p', NOVA, 1000);
  expect(boss.sim.getEnemy(boss.enemy)!.health).toBeLessThan(before);
  expect(statuses(boss.sim, boss.enemy)).toEqual([]);
});

it('does not hit through walls or beyond six metres, and commits cooldown even on an empty burst', () => {
  const wall = arenaGameData({
    colliders: [
      {
        shape: 'box',
        x: 2,
        z: 11.5,
        halfWidth: 4,
        halfDepth: 0.2,
        blocksSight: true,
        rotationY: 0,
      },
    ],
  });
  const blocked = setup('class.mage', 3, wall, 9);
  const far = setup('class.mage', 3, gd, 7);
  for (const t of [blocked, far]) {
    const health = t.sim.getEnemy(t.enemy)!.health;
    expect(t.sim.useAbility('p', NOVA, 1000).damage).toBe(0);
    expect(t.sim.getEnemy(t.enemy)!.health).toBe(health);
    expect(statuses(t.sim, t.enemy)).toEqual([]);
    expect(() => t.sim.useAbility('p', NOVA, 2000)).toThrow(
      expect.objectContaining({ code: 'ON_COOLDOWN' }),
    );
  }
});

it('bursts across several nearby enemies without damaging another player', () => {
  const raw = structuredClone(gd.raw);
  const chunk = raw.chunks.find((c) => c.zoneId === ARENA && c.coord.cx === 0 && c.coord.cz === 0)!;
  const spawn = chunk.spawnPoints.find((s) => s.kind === 'enemy')!;
  chunk.spawnPoints.push({ ...spawn, id: 'spawn.test.second', position: { x: 4, y: 0, z: 14 } });
  const t = setup('class.mage', 3, GameData.load(raw));
  t.sim.addPlayer(
    {
      characterId: 'friend',
      name: 'Friend',
      maxSpeed: 6,
      combat: {
        classId: 'class.warrior',
        level: 3,
        stats: {},
        health: 100,
        maxHealth: 100,
        weapon: { min: 1, max: 2, attackSpeedMs: 2000 },
      },
    },
    { x: 3, y: 0, z: 12 },
    0,
    1000,
  );
  t.sim.useAbility('p', NOVA, 1000);
  for (const id of t.sim.enemyIds()) {
    expect(t.sim.getEnemy(id)!.health).toBeLessThan(80);
    expect(statuses(t.sim, id)).toContainEqual({ kind: 'root', magnitude: 0, expiresAtMs: 4000 });
  }
  expect(t.sim.getHealth('friend')).toBe(100);
});
