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

it('keeps idle snapshots current through public party/effect changes and recovery', () => {
  const gd = arenaGameData();
  const sim = new ZoneSimulation(gd, ARENA, { nowMs: 1000, rng: seededRng(7) });
  const verify = () => {
    const image = sim.checkpoint();
    expect(image).toBe(legacyCheckpoint(sim));
    expect(sim.checkpoint()).toBe(image);
    return image;
  };
  const initial = verify();
  sim.drainKills();
  sim.drainOutbox();
  expect(verify()).toBe(initial);
  sim.parties.install(
    'cohort',
    'a',
    [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
    ],
    1000,
  );
  expect(verify()).not.toBe(initial);
  sim.parties.checkpoint().parties[0]!.lootCursor++;
  const partyImage = verify();
  sim.appliedEffects.add('first');
  const effectImage = verify();
  expect(effectImage).not.toBe(partyImage);
  sim.appliedEffects.delete('first');
  sim.appliedEffects.add('second');
  expect(verify()).not.toBe(effectImage);
  sim.restoreCheckpoint(initial);
  expect(verify()).toBe(initial);
  sim.step(1050);
  expect(verify()).not.toBe(initial);
});

it('refreshes idle pickup commits, releases and durable resource restoration', () => {
  const gd = getGameData();
  const zone = [...gd.zones.values()].find((z) =>
    gd.chunksForZone(z.id).some((c) => c.spawnPoints.some((s) => s.kind === 'resource_node')),
  )!;
  const sim = new ZoneSimulation(gd, zone.id, { nowMs: 1000 });
  // Read IDs from the recovery image, without exposing mutable simulation entities.
  const before = sim.checkpoint();
  const state = JSON.parse(before);
  const pickup = state.pickups.$map[0];
  expect(pickup).toBeDefined();
  pickup[1].reservedBy = 'departed-player';
  sim.restoreCheckpoint(JSON.stringify(state));
  // Recovery intentionally clears reservations; a release must remain byte compatible too.
  sim.checkpoint();
  sim.releasePickup(pickup[0]);
  expect(sim.checkpoint()).toBe(legacyCheckpoint(sim));
  sim.commitPickup(pickup[0], 1100);
  expect(sim.checkpoint()).toBe(legacyCheckpoint(sim));
  expect(sim.checkpoint()).not.toBe(before);
  const depleted = sim.checkpoint();
  const node = gd
    .chunksForZone(sim.zone.id)
    .flatMap((c) => c.spawnPoints)
    .find((s) => s.kind === 'resource_node')!;
  expect(node).toBeDefined();
  sim.restoreResources([{ nodeId: node.id, readyAt: new Date(10000) }], 1200);
  expect(sim.checkpoint()).toBe(legacyCheckpoint(sim));
  expect(sim.checkpoint()).not.toBe(depleted);
});

it('does not cache aliased debug entities or player-used simulations after departure', () => {
  const gd = arenaGameData();
  const sim = new ZoneSimulation(gd, ARENA, { nowMs: 1000 });
  sim.checkpoint();
  const entity = sim.listEntities()[0]!;
  sim.checkpoint();
  entity.position.x += 1;
  expect(sim.checkpoint()).toBe(legacyCheckpoint(sim));

  const active = new ZoneSimulation(gd, ARENA, { nowMs: 1000 });
  active.checkpoint();
  active.addPlayer(
    {
      characterId: 'a',
      name: 'A',
      maxSpeed: 6,
      combat: {
        level: 1,
        stats: { strength: 12 },
        health: 144,
        maxHealth: 144,
        weapon: { min: 7, max: 13, attackSpeedMs: 2400 },
      },
    },
    { x: 2, y: 0, z: 12 },
    0,
    1000,
  );
  const snapshot = active
    .drainOutbox()
    .get('a')!
    .find((m) => m.t === 'zone.snapshot')!;
  expect(snapshot.t).toBe('zone.snapshot');
  active.removePlayer('a');
  active.checkpoint();
  if (snapshot.t === 'zone.snapshot') {
    const enemy = snapshot.d.entities.find((e) => e.kind === 'enemy')!;
    enemy.position.x += 2;
  }
  expect(active.checkpoint()).toBe(legacyCheckpoint(active));
});

it('recovers and confirms a pending kill after the last player leaves an idle zone', () => {
  const gd = arenaGameData();
  const sim = new ZoneSimulation(gd, ARENA, { nowMs: 1000, rng: seededRng(7) });
  sim.addPlayer(
    {
      characterId: 'a',
      name: 'A',
      maxSpeed: 6,
      combat: {
        level: 1,
        stats: { strength: 12 },
        health: 144,
        maxHealth: 144,
        weapon: { min: 1000, max: 1000, attackSpeedMs: 1000 },
      },
    },
    { x: 2, y: 0, z: 12 },
    0,
    1000,
  );
  const enemy = sim.enemyIds()[0]!;
  sim.setTarget('a', enemy);
  sim.startAttack('a');
  for (let now = 1050; now <= 5000 && sim.getEnemy(enemy)!.mode !== 'dying'; now += 50)
    sim.step(now);
  expect(sim.getEnemy(enemy)!.mode).toBe('dying');
  sim.removePlayer('a');
  const recovered = new ZoneSimulation(gd, ARENA, { nowMs: 5000 });
  expect(recovered.restoreCheckpoint(sim.checkpoint())).toEqual([]);
  const pending = recovered.checkpoint();
  const kills = recovered.drainKills();
  expect(kills).toHaveLength(1);
  expect(recovered.checkpoint()).not.toBe(pending);
  expect(recovered.checkpoint()).toBe(legacyCheckpoint(recovered));
  expect(recovered.confirmKill(kills[0]!.killId, 5100)).toBe(true);
  expect(recovered.getEnemy(enemy)!.mode).toBe('dead');
  expect(recovered.checkpoint()).toBe(legacyCheckpoint(recovered));
  recovered.step(15000);
  expect(recovered.checkpoint()).toBe(legacyCheckpoint(recovered));
});
