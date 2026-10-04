import { describe, expect, it } from 'vitest';
import { DEMO_ZONE_ID, getGameData } from '@mmo/game-data';
import { uuidv7 } from '@mmo/shared';
import { ZoneSimulation } from './zone-simulation';

const gd = getGameData();
const player = (name: string) => ({
  characterId: uuidv7(),
  name,
  maxSpeed: 6,
  combat: {
    level: 1,
    stats: { strength: 12 },
    maxHealth: 144,
    health: 144,
    weapon: { min: 1, max: 3, attackSpeedMs: 2000 },
  },
});

function sim() {
  return new ZoneSimulation(gd, DEMO_ZONE_ID);
}

describe('ZoneSimulation', () => {
  it('spawns NPCs and pickups from chunk data and sends a snapshot on join', () => {
    const s = sim();
    const a = player('Aria');
    s.addPlayer(a, { x: 0, y: 0, z: 0 }, 0, 0);
    const out = s.drainOutbox().get(a.characterId)!;
    const snap = out.find((m) => m.t === 'zone.snapshot');
    expect(snap).toBeDefined();
    if (snap?.t === 'zone.snapshot') {
      const kinds = new Set(snap.d.entities.map((e) => e.kind));
      expect([...kinds].sort()).toEqual(['enemy', 'npc', 'pickup', 'player']);
      expect(snap.d.entities.filter((e) => e.kind === 'pickup')).toHaveLength(2);
    }
  });

  it('tells existing players about newcomers and departures (presence of entities)', () => {
    const s = sim();
    const a = player('Aria');
    const b = player('Bram');
    s.addPlayer(a, { x: 0, y: 0, z: 0 }, 0, 0);
    s.drainOutbox();
    const bEntity = s.addPlayer(b, { x: 2, y: 0, z: 2 }, 0, 0);
    expect(s.drainOutbox().get(a.characterId)).toEqual([
      expect.objectContaining({ t: 'entity.spawn' }),
    ]);
    s.removePlayer(b.characterId);
    expect(s.drainOutbox().get(a.characterId)).toEqual([
      { t: 'entity.despawn', d: { entityId: bEntity, reason: 'left' } },
    ]);
  });

  it('accepts plausible movement and batches it to observers each tick', () => {
    const s = sim();
    const a = player('Aria');
    const b = player('Bram');
    const aEntity = s.addPlayer(a, { x: 0, y: 0, z: 0 }, 0, 0);
    s.addPlayer(b, { x: 1, y: 0, z: 1 }, 0, 0);
    s.drainOutbox();
    expect(s.handleMove(a.characterId, { x: 0.5, y: 0, z: 0 }, 1, 100)).toBe(true);
    s.step(100);
    const msgs = s.drainOutbox();
    expect(msgs.get(b.characterId)).toEqual([
      { t: 'world.moves', d: { tick: 1, moves: [[aEntity, 0.5, 0, 0, 1]] } },
    ]);
    expect(msgs.get(a.characterId)).toBeUndefined(); // no echo of your own move
  });

  it('rejects speed hacks and out-of-bounds positions with a correction', () => {
    const s = sim();
    const a = player('Aria');
    s.addPlayer(a, { x: 0, y: 0, z: 0 }, 0, 0);
    s.drainOutbox();
    expect(s.handleMove(a.characterId, { x: 50, y: 0, z: 0 }, 0, 100)).toBe(false);
    expect(s.handleMove(a.characterId, { x: 0, y: 0, z: 9999 }, 0, 5000)).toBe(false);
    const out = s.drainOutbox().get(a.characterId)!;
    expect(out.map((m) => m.t)).toEqual(['move.correction', 'move.correction']);
    expect(s.getPlayer(a.characterId)!.position).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('reserves a pickup for exactly one player, enforces range, and respawns after commit', () => {
    const s = sim();
    const near = player('Near');
    const far = player('Far');
    const other = player('Other');
    s.addPlayer(near, { x: 8, y: 0, z: -13 }, 0, 0);
    s.addPlayer(other, { x: 8, y: 0, z: -15 }, 0, 0);
    s.addPlayer(far, { x: -40, y: 0, z: 40 }, 0, 0);
    const sword = s
      .listEntities()
      .find((e) => e.kind === 'pickup' && e.refId === 'weapon.sword.iron_longsword')!;

    expect(() => s.reservePickup(far.characterId, sword.id)).toThrow(
      expect.objectContaining({ code: 'OUT_OF_RANGE' }),
    );
    const r = s.reservePickup(near.characterId, sword.id);
    expect(r).toMatchObject({
      templateId: 'weapon.sword.iron_longsword',
      quantity: 1,
      spawnPointId: 'spawn.greenvale.sword_rack',
    });
    expect(() => s.reservePickup(other.characterId, sword.id)).toThrow(
      expect.objectContaining({ code: 'ALREADY_CLAIMED' }),
    );

    s.drainOutbox();
    s.commitPickup(sword.id, 1_000);
    expect(s.drainOutbox().get(other.characterId)).toEqual([
      { t: 'entity.despawn', d: { entityId: sword.id, reason: 'picked_up' } },
    ]);
    expect(() => s.reservePickup(near.characterId, sword.id)).toThrow(
      expect.objectContaining({ code: 'NOT_FOUND' }),
    );

    s.step(1_000 + 19_999);
    expect(s.listEntities().filter((e) => e.refId === 'weapon.sword.iron_longsword')).toHaveLength(
      0,
    );
    s.step(1_000 + 20_000);
    const respawned = s.listEntities().find((e) => e.refId === 'weapon.sword.iron_longsword')!;
    expect(respawned.id).not.toBe(sword.id);
    // New spawn cycle => new spawnInstanceId => a fresh DB dedupe key.
    expect(s.reservePickup(near.characterId, respawned.id).spawnInstanceId).not.toBe(
      r.spawnInstanceId,
    );
  });

  it('releases a reservation when persistence fails so others can try', () => {
    const s = sim();
    const a = player('A');
    const b = player('B');
    s.addPlayer(a, { x: 8, y: 0, z: -13 }, 0, 0);
    s.addPlayer(b, { x: 8, y: 0, z: -13 }, 0, 0);
    const sword = s.listEntities().find((e) => e.refId === 'weapon.sword.iron_longsword')!;
    s.reservePickup(a.characterId, sword.id);
    s.releasePickup(sword.id);
    expect(() => s.reservePickup(b.characterId, sword.id)).not.toThrow();
  });
});

describe('NPC interaction validation', () => {
  it('requires a real NPC entity in this zone, range and a living player', async () => {
    const { ARENA, arenaGameData } = await import('./test-arena');
    const { seededRng } = await import('@mmo/game-data');
    const { uuidv7 } = await import('@mmo/shared');
    const sim = new ZoneSimulation(arenaGameData(), ARENA, { rng: seededRng(1), nowMs: 0 });
    const npc = sim.listEntities().find((e) => e.kind === 'npc')!;
    const pickup = sim.listEntities().find((e) => e.kind === 'pickup')!;
    const near = uuidv7();
    sim.addPlayer(
      {
        characterId: near,
        name: 'A',
        maxSpeed: 6,
        combat: {
          level: 1,
          stats: {},
          maxHealth: 100,
          health: 100,
          weapon: { min: 1, max: 2, attackSpeedMs: 2000 },
        },
      },
      { x: npc.position.x + 2, y: 0, z: npc.position.z },
      0,
      0,
    );
    expect(sim.npcInteraction(near, npc.id)).toEqual({ entityId: npc.id, npcId: npc.refId });
    expect(() => sim.npcInteraction(near, pickup.id)).toThrow(
      expect.objectContaining({ code: 'INVALID_TARGET' }),
    );
    expect(() => sim.npcInteraction(near, 'e:999')).toThrow(
      expect.objectContaining({ code: 'INVALID_TARGET' }),
    );
    const far = uuidv7();
    sim.addPlayer(
      {
        characterId: far,
        name: 'B',
        maxSpeed: 6,
        combat: {
          level: 1,
          stats: {},
          maxHealth: 100,
          health: 100,
          weapon: { min: 1, max: 2, attackSpeedMs: 2000 },
        },
      },
      { x: npc.position.x + 20, y: 0, z: npc.position.z },
      0,
      0,
    );
    expect(() => sim.npcInteraction(far, npc.id)).toThrow(
      expect.objectContaining({ code: 'OUT_OF_RANGE' }),
    );
    const dead = uuidv7();
    sim.addPlayer(
      {
        characterId: dead,
        name: 'C',
        maxSpeed: 6,
        combat: {
          level: 1,
          stats: {},
          maxHealth: 100,
          health: 0,
          weapon: { min: 1, max: 2, attackSpeedMs: 2000 },
        },
      },
      { x: npc.position.x + 1, y: 0, z: npc.position.z },
      0,
      0,
    );
    expect(() => sim.npcInteraction(dead, npc.id)).toThrow(
      expect.objectContaining({ code: 'YOU_ARE_DEAD' }),
    );
  });
});
