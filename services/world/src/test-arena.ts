import { GameData, rawGameData } from '@mmo/game-data';
import type { RawGameData } from '@mmo/game-data';
import type { Collider, SpawnGroup, SpawnPoint } from '@mmo/schemas';

/** Test-only: a small deterministic zone (128 m square) reusing the real content definitions. */
export const ARENA = 'zone.test.arena';
export const WOLF_HOME = { x: 2, y: 0, z: 14 };

type Prop = RawGameData['chunks'][number]['props'][number];

export function arenaGameData(
  opts: {
    colliders?: Collider[];
    props?: Prop[];
    spawns?: SpawnPoint[];
    groups?: SpawnGroup[];
    respawnPoints?: { id: string; name: string; position: { x: number; y: number; z: number } }[];
  } = {},
): GameData {
  const raw = structuredClone(rawGameData);
  const spawns: SpawnPoint[] = opts.spawns ?? [
    {
      id: 'spawn.test.wolf',
      kind: 'enemy',
      position: WOLF_HOME,
      rotationY: 0,
      refId: 'enemy.greenvale.grey_wolf',
      quantity: 1,
      respawnMs: 8000,
      interactRadius: 3,
      groupId: null,
      wanderRadius: 0,
    },
    {
      id: 'spawn.test.sword',
      kind: 'pickup',
      position: { x: 8, y: 0, z: -14 },
      rotationY: 0,
      refId: 'weapon.sword.iron_longsword',
      quantity: 1,
      respawnMs: 20_000,
      interactRadius: 3,
      groupId: null,
      wanderRadius: 0,
    },
    {
      id: 'spawn.test.ore',
      kind: 'pickup',
      position: { x: -10, y: 0, z: -12 },
      rotationY: 0,
      refId: 'material.ore.copper_ore',
      quantity: 3,
      respawnMs: 15_000,
      interactRadius: 3,
      groupId: null,
      wanderRadius: 0,
    },
    {
      id: 'spawn.test.elder',
      kind: 'npc',
      position: { x: -6, y: 0, z: 6 },
      rotationY: 0,
      refId: 'npc.greenvale.elder_maren',
      quantity: 1,
      respawnMs: null,
      interactRadius: 4,
      groupId: null,
      wanderRadius: 0,
    },
  ];
  raw.regions = raw.regions.map((r, i) => (i === 0 ? { ...r, zoneIds: [...r.zoneIds, ARENA] } : r));
  raw.zones = [
    ...raw.zones,
    {
      id: ARENA,
      regionId: raw.regions[0]!.id,
      name: 'Test Arena',
      kind: 'wilderness',
      instanced: false,
      chunkSize: 64,
      bounds: { minCx: -1, maxCx: 0, minCz: -1, maxCz: 0 },
      defaultSpawn: { x: 0, y: 0, z: -8 },
      transitions: [],
      environment: { dayNightCycle: false, weatherProfileId: null, ambientColor: '#9fc5e8' },
      respawnPoints: opts.respawnPoints ?? [],
      safeZones: [],
      spawnGroups: opts.groups ?? [],
      landmarks: [],
    },
  ];
  for (let cx = -1; cx <= 0; cx++) {
    for (let cz = -1; cz <= 0; cz++) {
      const inChunk = (p: { x: number; z: number }) =>
        Math.floor(p.x / 64) === cx && Math.floor(p.z / 64) === cz;
      raw.chunks.push({
        zoneId: ARENA,
        coord: { cx, cz },
        terrainAssetId: null,
        groundColor: '#5f8f3a',
        props: (opts.props ?? []).filter((p) => inChunk(p.position)),
        colliders: cx === 0 && cz === 0 ? (opts.colliders ?? []) : [],
        spawnPoints: spawns.filter((s) => inChunk(s.position)),
      });
    }
  }
  return GameData.load(raw);
}
