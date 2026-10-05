import type {
  ChunkPropSchema,
  DungeonDefinition,
  EnemyDefinition,
  NpcDefinition,
  QuestDefinitionInput,
  SpawnPoint,
  WorldChunk,
  WorldRegion,
  WorldZone,
} from '@mmo/schemas';
import type { z } from 'zod';
import { seededRng } from '../rules/random';

/**
 * GREENVALE MEADOWS — first playable zone (256 m × 256 m, 4×4 chunks of 64 m).
 *
 *   north:  Northwood (forest) with a wolf den behind a broken fence line
 *   east:   Eastern Rocks behind a rock ridge, second den
 *   south-west: the Hollow, third den
 *   centre: Greenvale Village (safe zone: no enemy spawns), elder, pickups, respawn point
 *   south:  Old Waystone (second respawn point)
 *
 * Hand-placed: village, fences, ridge, dens, spawn points, landmarks.
 * Generated (deterministic seed, so identical on every server and client): scattered trees and
 * rocks, kept clear of roads, spawn points, the village and each other.
 * Colliders come from props via the shared prop-shape table (see props.ts).
 */

type Prop = z.input<typeof ChunkPropSchema>;
const ZONE_ID = 'zone.greenvale.meadows';
const CHUNK = 64;

export const regions: WorldRegion[] = [
  {
    id: 'region.greenvale',
    name: 'Greenvale',
    description: 'Placeholder starting region: farmland and forest on the edge of the old kingdom.',
    levelRange: { min: 1, max: 10 },
    zoneIds: [ZONE_ID],
    themes: ['medieval', 'pastoral'],
  },
];

const village = { x: 0, z: 0, radius: 32 };

const wolfPoint = (id: string, x: number, z: number, groupId: string): SpawnPoint => ({
  id: `spawn.greenvale.${id}`,
  kind: 'enemy',
  position: { x, y: 0, z },
  rotationY: 0,
  refId: 'enemy.greenvale.grey_wolf',
  quantity: 1,
  respawnMs: null,
  interactRadius: 3,
  groupId,
  wanderRadius: 5,
});

const spawnPoints: SpawnPoint[] = [
  // Village (safe zone): NPC + resource pickups
  {
    id: 'spawn.greenvale.elder',
    kind: 'npc',
    position: { x: -6, y: 0, z: 6 },
    rotationY: Math.PI,
    refId: 'npc.greenvale.elder_maren',
    quantity: 1,
    respawnMs: null,
    interactRadius: 4,
    groupId: null,
    wanderRadius: 0,
  },
  {
    id: 'spawn.greenvale.ore_pile',
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
    id: 'spawn.greenvale.sword_rack',
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
  // Northwood den
  wolfPoint('wolf_north_1', 4, 62, 'group.greenvale.den_north'),
  wolfPoint('wolf_north_2', 15, 70, 'group.greenvale.den_north'),
  wolfPoint('wolf_north_3', -7, 73, 'group.greenvale.den_north'),
  // Eastern Rocks den
  wolfPoint('wolf_east_1', 76, -6, 'group.greenvale.den_east'),
  wolfPoint('wolf_east_2', 86, 4, 'group.greenvale.den_east'),
  wolfPoint('wolf_east_3', 70, -20, 'group.greenvale.den_east'),
  // South-west Hollow den
  wolfPoint('wolf_sw_1', -62, -62, 'group.greenvale.den_sw'),
  wolfPoint('wolf_sw_2', -73, -50, 'group.greenvale.den_sw'),
  wolfPoint('wolf_sw_3', -50, -75, 'group.greenvale.den_sw'),
  // Roamers: lone wolves in the wider meadows
  wolfPoint('wolf_roam_1', -84, 40, 'group.greenvale.roamers'),
  wolfPoint('wolf_roam_2', 45, -84, 'group.greenvale.roamers'),
  wolfPoint('wolf_roam_3', 92, 86, 'group.greenvale.roamers'),
  wolfPoint('wolf_roam_4', -32, 104, 'group.greenvale.roamers'),
];

const handPlaced: Prop[] = [
  // Village
  {
    id: 'house_a',
    kind: 'building',
    position: { x: -20, y: 0, z: 18 },
    rotationY: 0.2,
    scale: 1,
    modelId: null,
  },
  {
    id: 'house_b',
    kind: 'building',
    position: { x: 19, y: 0, z: 19 },
    rotationY: -0.3,
    scale: 1,
    modelId: null,
  },
  {
    id: 'house_c',
    kind: 'building',
    position: { x: -21, y: 0, z: -20 },
    rotationY: 0.1,
    scale: 1,
    modelId: null,
  },
  {
    id: 'fence_v1',
    kind: 'fence',
    position: { x: 15, y: 0, z: -5 },
    rotationY: 0,
    scale: 1,
    modelId: null,
  },
  {
    id: 'marker_square',
    kind: 'marker',
    position: { x: 0, y: 0, z: 0 },
    rotationY: 0,
    scale: 1,
    modelId: null,
  },
  // Broken fence line guarding the north road (gap at the road)
  {
    id: 'fence_n1',
    kind: 'fence',
    position: { x: -16, y: 0, z: 48 },
    rotationY: 0,
    scale: 1,
    modelId: null,
  },
  {
    id: 'fence_n2',
    kind: 'fence',
    position: { x: -26, y: 0, z: 48 },
    rotationY: 0,
    scale: 1,
    modelId: null,
  },
  {
    id: 'fence_n3',
    kind: 'fence',
    position: { x: 16, y: 0, z: 48 },
    rotationY: 0,
    scale: 1,
    modelId: null,
  },
  {
    id: 'fence_n4',
    kind: 'fence',
    position: { x: 26, y: 0, z: 48 },
    rotationY: 0,
    scale: 1,
    modelId: null,
  },
  // Rock ridge between the village and the Eastern Rocks (gap at the east road)
  ...[-30, -24, -18, -12, 12, 18, 24, 30].map((z, i): Prop => ({
    id: `ridge_${i}`,
    kind: 'rock',
    position: { x: 48, y: 0, z },
    rotationY: i,
    scale: 2.2,
    modelId: null,
  })),
  // Den dressing
  {
    id: 'den_n_rock',
    kind: 'rock',
    position: { x: 6, y: 0, z: 80 },
    rotationY: 0.4,
    scale: 2.5,
    modelId: null,
  },
  {
    id: 'den_e_rock',
    kind: 'rock',
    position: { x: 92, y: 0, z: -12 },
    rotationY: 1.2,
    scale: 2.8,
    modelId: null,
  },
  {
    id: 'den_sw_rock',
    kind: 'rock',
    position: { x: -70, y: 0, z: -72 },
    rotationY: 2.1,
    scale: 2.4,
    modelId: null,
  },
  {
    id: 'waystone',
    kind: 'marker',
    position: { x: -5, y: 0, z: -95 },
    rotationY: 0,
    scale: 1,
    modelId: null,
  },
];

/** Corridors kept free of generated props (main roads). */
const onRoad = (x: number, z: number) =>
  (z > 28 && Math.abs(x) < 7) || // north road
  (x > 28 && Math.abs(z) < 7) || // east road
  (z < -28 && Math.abs(x + z * 0.05) < 7) || // south road to the waystone
  (x < -20 && z < -20 && Math.abs(x - z) < 9); // south-west track

function scatter(): Prop[] {
  const rng = seededRng(20261004);
  const out: Prop[] = [];
  const clear = (x: number, z: number, r: number) =>
    Math.hypot(x - village.x, z - village.z) > village.radius + 6 &&
    !onRoad(x, z) &&
    spawnPoints.every((s) => Math.hypot(s.position.x - x, s.position.z - z) > 7) &&
    [...handPlaced, ...out].every(
      (p) => Math.hypot(p.position.x - x, p.position.z - z) > r + 2.5 * p.scale,
    ) &&
    Math.hypot(x + 5, z + 95) > 10;
  const place = (
    kind: 'tree' | 'rock',
    count: number,
    area: (x: number, z: number) => boolean,
    scale: [number, number],
  ) => {
    let made = 0;
    for (let tries = 0; made < count && tries < count * 40; tries++) {
      const x = -124 + rng.next() * 248;
      const z = -124 + rng.next() * 248;
      const s = scale[0] + rng.next() * (scale[1] - scale[0]);
      if (!area(x, z) || !clear(x, z, s * 1.5)) continue;
      out.push({
        id: `${kind}_${out.length}`,
        kind,
        position: { x: Math.round(x * 10) / 10, y: 0, z: Math.round(z * 10) / 10 },
        rotationY: Math.round(rng.next() * 62) / 10,
        scale: Math.round(s * 100) / 100,
        modelId: null,
      });
      made++;
    }
  };
  place('tree', 110, (_x, z) => z > 40, [0.9, 1.4]); // Northwood
  place('tree', 45, (x, z) => z <= 40 && !(x > 50), [0.8, 1.3]); // scattered meadow trees
  place('rock', 40, (x) => x > 52, [1, 2]); // Eastern Rocks
  place('rock', 20, (x, z) => x < -30 && z < -30, [1, 1.8]); // Hollow
  return out;
}

const allProps = [...handPlaced, ...scatter()];

const GROUND: Record<string, string> = {
  '-2,1': '#4f7d32',
  '-1,1': '#4c7a30',
  '0,1': '#4a782f',
  '1,1': '#557f36',
  '-2,0': '#5c8a37',
  '-1,0': '#5a8a36',
  '0,0': '#689a40',
  '1,0': '#7a8f4a',
  '-2,-1': '#5f8a3a',
  '-1,-1': '#5f8f3a',
  '0,-1': '#64943d',
  '1,-1': '#7d8d4c',
  '-2,-2': '#667f3c',
  '-1,-2': '#6a8c42',
  '0,-2': '#6d9244',
  '1,-2': '#7b8e4e',
};

export const chunks: WorldChunk[] = [];
for (let cx = -2; cx <= 1; cx++) {
  for (let cz = -2; cz <= 1; cz++) {
    const inChunk = (p: { x: number; z: number }) =>
      Math.floor(p.x / CHUNK) === cx && Math.floor(p.z / CHUNK) === cz;
    chunks.push({
      zoneId: ZONE_ID,
      coord: { cx, cz },
      terrainAssetId: null,
      groundColor: GROUND[`${cx},${cz}`] ?? '#5f8f3a',
      props: allProps
        .filter((p) => inChunk(p.position))
        .map((p) => ({
          ...p,
          position: { x: p.position.x, y: 0, z: p.position.z },
        })) as WorldChunk['props'],
      colliders: [],
      spawnPoints: spawnPoints.filter((s) => inChunk(s.position)),
    });
  }
}

// Additive landmark NPC: appended after terrain scattering so existing props/colliders do not move.
chunks
  .find((c) => c.coord.cx === -1 && c.coord.cz === -2)!
  .spawnPoints.push({
    id: 'spawn.greenvale.waystone_keeper',
    kind: 'npc',
    refId: 'npc.greenvale.keeper_rill',
    position: { x: -8, y: 0, z: -90 },
    rotationY: 0,
    quantity: 1,
    respawnMs: null,
    interactRadius: 4,
    groupId: null,
    wanderRadius: 0,
  });

chunks
  .find((c) => c.coord.cx === -1 && c.coord.cz === -2)!
  .spawnPoints.push({
    id: 'spawn.greenvale.brackenmaw',
    kind: 'enemy',
    refId: 'enemy.greenvale.brackenmaw',
    position: { x: -57, y: 0, z: -92 },
    rotationY: 1.5,
    quantity: 1,
    respawnMs: 60_000,
    interactRadius: 3,
    groupId: null,
    wanderRadius: 2,
  });

// Additive Root-Wound encounter: no existing props, colliders or spawns are changed.
chunks
  .find((c) => c.coord.cx === -2 && c.coord.cz === -2)!
  .spawnPoints.push({
    id: 'spawn.greenvale.hollow_lantern',
    kind: 'enemy',
    refId: 'enemy.greenvale.hollow_lantern',
    position: { x: -93, y: 0, z: -82 },
    rotationY: 1.5,
    quantity: 1,
    respawnMs: 60000,
    interactRadius: 3,
    groupId: null,
    wanderRadius: 0,
  });

// Stillwater expedition is appended after terrain scatter; old obstacle placement is unchanged.
for (const spawn of [
  {
    id: 'spawn.greenvale.surveyor_tess',
    kind: 'npc' as const,
    refId: 'npc.greenvale.surveyor_tess',
    position: { x: 63, y: 0, z: 38 },
    respawnMs: null,
    interactRadius: 4,
  },
  {
    id: 'spawn.greenvale.siltbound_warden',
    kind: 'enemy' as const,
    refId: 'enemy.greenvale.siltbound_warden',
    position: { x: 75, y: 0, z: 27 },
    respawnMs: 60000,
    interactRadius: 3,
  },
]) {
  chunks
    .find(
      (c) =>
        c.coord.cx === Math.floor(spawn.position.x / CHUNK) &&
        c.coord.cz === Math.floor(spawn.position.z / CHUNK),
    )!
    .spawnPoints.push({
      ...spawn,
      rotationY: 0,
      quantity: 1,
      groupId: null,
      wanderRadius: 0,
    });
}

// Shared geometry for the ruined pillars: visible footprint equals authoritative collision.
export const keeperOutpostPillars = [
  [24, 115, 1.3],
  [24, 122, 1.7],
  [38, 122, 1.2],
  [38, 115, 1.8],
] as const;
chunks
  .find((c) => c.coord.cx === 0 && c.coord.cz === 1)!
  .colliders.push(
    ...keeperOutpostPillars.map(([x, z]) => ({
      shape: 'circle' as const,
      x,
      z,
      radius: 0.5,
      blocksSight: true,
    })),
  );

// Additive keeper outpost: preserve all previously shipped terrain/spawns.
chunks
  .find((c) => c.coord.cx === 0 && c.coord.cz === 1)!
  .spawnPoints.push({
    id: 'spawn.greenvale.last_door_sentinel',
    kind: 'enemy',
    refId: 'enemy.greenvale.last_door_sentinel',
    position: { x: 33, y: 0, z: 118 },
    rotationY: Math.PI,
    quantity: 1,
    respawnMs: 60000,
    interactRadius: 3,
    groupId: null,
    wanderRadius: 0,
  });

export const zones: WorldZone[] = [
  {
    id: ZONE_ID,
    regionId: 'region.greenvale',
    name: 'Greenvale Meadows',
    kind: 'wilderness',
    instanced: false,
    chunkSize: CHUNK,
    bounds: { minCx: -2, maxCx: 1, minCz: -2, maxCz: 1 },
    defaultSpawn: { x: 0, y: 0, z: -8 },
    transitions: [],
    environment: { dayNightCycle: false, weatherProfileId: null, ambientColor: '#9fc5e8' },
    respawnPoints: [
      {
        id: 'respawn.greenvale.village',
        name: 'Greenvale Village',
        position: { x: 0, y: 0, z: -8 },
      },
      { id: 'respawn.greenvale.waystone', name: 'Old Waystone', position: { x: -5, y: 0, z: -90 } },
    ],
    safeZones: [
      {
        id: 'safe.greenvale.village',
        name: 'Greenvale Village',
        center: { x: 0, y: 0, z: 0 },
        radius: village.radius,
      },
    ],
    spawnGroups: [
      {
        id: 'group.greenvale.den_north',
        name: 'Northwood Den',
        maxAlive: 2,
        respawnMs: { min: 20_000, max: 35_000 },
        minPlayerDistance: 18,
      },
      {
        id: 'group.greenvale.den_east',
        name: 'Eastern Rocks Den',
        maxAlive: 2,
        respawnMs: { min: 20_000, max: 35_000 },
        minPlayerDistance: 18,
      },
      {
        id: 'group.greenvale.den_sw',
        name: 'Hollow Den',
        maxAlive: 2,
        respawnMs: { min: 20_000, max: 35_000 },
        minPlayerDistance: 18,
      },
      {
        id: 'group.greenvale.roamers',
        name: 'Meadow Roamers',
        maxAlive: 2,
        respawnMs: { min: 30_000, max: 60_000 },
        minPlayerDistance: 25,
      },
    ],
    landmarks: [
      {
        id: 'landmark.greenvale.keeper_outpost',
        name: 'Keeper Outpost inscription',
        position: { x: 24, y: 0, z: 110 },
      },
      { id: 'landmark.greenvale.old_well', name: 'Old Well', position: { x: 8, y: 0, z: 12 } },
      {
        id: 'landmark.greenvale.spring_culvert',
        name: 'Spring Culvert',
        position: { x: 8, y: 0, z: 110 },
      },
      {
        id: 'landmark.greenvale.stillwater',
        name: 'Stillwater Steps',
        position: { x: 63, y: 0, z: 38 },
      },
      {
        id: 'landmark.greenvale.village',
        name: 'Greenvale Village',
        position: { x: 0, y: 0, z: 0 },
      },
      {
        id: 'landmark.greenvale.northwood',
        name: 'Northwood Den',
        position: { x: 5, y: 0, z: 68 },
      },
      {
        id: 'landmark.greenvale.eastern_rocks',
        name: 'Eastern Rocks',
        position: { x: 78, y: 0, z: -6 },
      },
      { id: 'landmark.greenvale.hollow', name: 'The Hollow', position: { x: -62, y: 0, z: -62 } },
      {
        id: 'landmark.greenvale.waystone',
        name: 'Old Waystone',
        position: { x: -5, y: 0, z: -95 },
      },
    ],
  },
];

export const npcs: NpcDefinition[] = [
  {
    id: 'npc.greenvale.surveyor_tess',
    name: 'Surveyor Tess',
    title: 'Keeper of the eastern records',
    role: 'ambient',
    modelId: null,
    dialogue: [
      'Maren sent you? These steps carried water to the village before the wardens sealed them. The siltbound guardian is drawing power from the same marks Rill found. ',
      'Its surge fixes on the ground beneath you: move out of the blue circle before it breaks. Spread out if you travel together. I can read the inscription when it falls.',
    ],
  },
  {
    id: 'npc.greenvale.keeper_rill',
    name: 'Keeper Rill',
    title: 'Watcher of the Old Waystone',
    role: 'quest_giver',
    modelId: null,
    dialogue: [
      'The stone is warm again. Last night its old markings lit toward the Hollow. Tell Maren: the wolves are fleeing something beneath the roots. I will keep watch here.',
    ],
  },
  {
    id: 'npc.greenvale.elder_maren',
    name: 'Elder Maren',
    title: 'Village Elder',
    role: 'quest_giver',
    modelId: null,
    dialogue: [
      'Welcome to Greenvale, traveller.',
      'There is a sword on the rack by the fence. Take it.',
    ],
  },
];

export const enemies: EnemyDefinition[] = [
  {
    id: 'enemy.greenvale.last_door_sentinel',
    name: 'Aster, Last Door Sentinel',
    level: 4,
    maxHealth: 300,
    family: 'construct',
    lootTableId: 'loot.greenvale.last_door_sentinel',
    xpReward: 220,
    modelId: null,
    isBoss: true,
    isWorldBoss: false,
    combat: {
      damage: { min: 22, max: 28 },
      attackSpeedMs: 2400,
      windupMs: 2200,
      cleaveArcDegrees: 100,
      attackRange: 6,
      aggroRange: 8,
      leashRange: 16,
      moveSpeed: 2.2,
      armor: 8,
      corpseMs: 6000,
    },
  },
  {
    id: 'enemy.greenvale.siltbound_warden',
    name: 'Siltbound Warden',
    level: 4,
    maxHealth: 280,
    family: 'construct',
    lootTableId: 'loot.greenvale.siltbound_warden',
    xpReward: 220,
    modelId: null,
    isBoss: false,
    isWorldBoss: false,
    combat: {
      damage: { min: 20, max: 28 },
      attackSpeedMs: 3200,
      windupMs: 1700,
      groundStrikeRadius: 2.5,
      attackRange: 9,
      aggroRange: 8,
      leashRange: 18,
      moveSpeed: 2,
      armor: 10,
      corpseMs: 6000,
    },
  },
  {
    id: 'enemy.greenvale.hollow_lantern',
    name: 'Hollow Lantern',
    level: 3,
    maxHealth: 210,
    family: 'elemental',
    lootTableId: 'loot.greenvale.hollow_lantern',
    xpReward: 180,
    modelId: null,
    isBoss: false,
    isWorldBoss: false,
    combat: {
      damage: { min: 14, max: 20 },
      attackSpeedMs: 3500,
      windupMs: 1800,
      attackRange: 10,
      aggroRange: 10,
      leashRange: 22,
      moveSpeed: 1.8,
      armor: 3,
      corpseMs: 6000,
    },
  },
  {
    id: 'enemy.greenvale.brackenmaw',
    name: 'Brackenmaw, Hollow Packleader',
    level: 3,
    maxHealth: 260,
    family: 'beast',
    lootTableId: 'loot.greenvale.brackenmaw',
    xpReward: 160,
    modelId: null,
    isBoss: true,
    isWorldBoss: false,
    combat: {
      damage: { min: 12, max: 18 },
      attackSpeedMs: 3000,
      windupMs: 1400,
      attackRange: 3,
      aggroRange: 9,
      leashRange: 20,
      moveSpeed: 4.5,
      armor: 12,
      corpseMs: 6000,
    },
  },
  {
    id: 'enemy.greenvale.grey_wolf',
    name: 'Grey Wolf',
    level: 2,
    maxHealth: 80,
    family: 'beast',
    lootTableId: 'loot.greenvale.wolf',
    xpReward: 45,
    modelId: null,
    isBoss: false,
    isWorldBoss: false,
    combat: {
      damage: { min: 4, max: 7 },
      attackSpeedMs: 2000,
      attackRange: 2.5,
      aggroRange: 8,
      leashRange: 30,
      moveSpeed: 5,
      armor: 10,
      corpseMs: 3000,
    },
  },
];

export const quests: QuestDefinitionInput[] = [
  {
    id: 'quest.greenvale.keeper_outpost',
    name: 'The Names Behind the Door',
    description:
      'Follow the north road past the Spring Culvert, then take the eastward stone path to the ruined keeper outpost. Read its oath stone within four metres and quiet Aster, the Last Door Sentinel. His amber sweep freezes its direction: flank him, pass behind him, or leave the marked sector before it lands. Return to Maren. Each companion must accept and survey personally; eligible nearby party members share the kill.',
    giverNpcId: 'npc.greenvale.elder_maren',
    minLevel: 3,
    prerequisites: ['quest.greenvale.well_records'],
    objectives: [
      {
        id: 'read_oath',
        kind: 'explore',
        zoneId: ZONE_ID,
        areaId: 'landmark.greenvale.keeper_outpost',
        label: 'Read the keeper oath at the ruined outpost',
      },
      {
        id: 'quiet_aster',
        kind: 'kill',
        enemyId: 'enemy.greenvale.last_door_sentinel',
        count: 1,
        label: 'Quiet Aster, Last Door Sentinel',
      },
    ],
    rewards: {
      xp: 700,
      currency: [{ currencyId: 'gold', amount: 300 }],
      items: [{ itemTemplateId: 'accessory.cloak.oathkeepers_mantle', quantity: 1 }],
    },
    dialogue: {
      offer:
        'The culvert marks lead east to a ruined watchpost. Its keepers swore an oath before their names vanished from our book. Read their stone without opening the seal. Aster still guards the courtyard, but his memory has turned every visitor into a trespasser. Quiet him. Watch his amber sweep: once he raises his blade, its direction is fixed. Step to his flank or behind him. Bring the oath back to me.',
      inProgress:
        'Beyond the culvert, follow the pale path east. Read the oath stone, quiet Aster, and return. Every companion must read the stone; you may face the sentinel together. His sweep cannot turn during its warning.',
      readyToTurnIn:
        '“We closed the door so the spring could dream, not so it could die.” Aster was a keeper, not a jailer. Our founders erased their names to spare their families the blame. And this last line: “When the dream calls back, seek the bell below the roots.” Take this mantle. We must learn whether that bell is a warning or an invitation before anyone touches the Last Door.',
      completed:
        'Aster’s watch is quiet, and the seal is unbroken. The keepers chose sleep over destruction. The bell below the roots is our next question; we will not open the door blindly.',
    },
  },
  {
    id: 'quest.greenvale.well_records',
    name: 'The Water Remembers',
    description:
      'Read the old well inscription in Greenvale, then follow the north road beyond the wolf den to the Spring Culvert. Approach each stone within four metres to survey it. Return to Elder Maren with the matching marks. Each companion must accept and visit both sites personally. This is a survey, not a request to break either seal.',
    giverNpcId: 'npc.greenvale.elder_maren',
    minLevel: 3,
    prerequisites: ['quest.greenvale.stillwater'],
    objectives: [
      {
        id: 'survey_well',
        kind: 'explore',
        zoneId: ZONE_ID,
        areaId: 'landmark.greenvale.old_well',
        label: 'Survey the Old Well inscription',
      },
      {
        id: 'survey_culvert',
        kind: 'explore',
        zoneId: ZONE_ID,
        areaId: 'landmark.greenvale.spring_culvert',
        label: 'Survey the Spring Culvert beyond Northwood',
      },
    ],
    rewards: {
      xp: 450,
      currency: [{ currencyId: 'gold', amount: 150 }],
      items: [{ itemTemplateId: 'accessory.necklace.springward_pendant', quantity: 1 }],
    },
    dialogue: {
      offer:
        'The well book names two watchers: one beneath our square, one beyond Northwood. Neither was built to keep water out. Read the stone at the old well, then follow the north road past the wolves to the culvert. Compare the marks without disturbing them. The gold compass will guide you; a visit within four metres is enough. Bring your companions, but each must see the inscriptions.',
      inProgress:
        'The well is just northeast of our square. The culvert lies beyond Northwood, beside the north road. Read both stones, then bring their marks back to me. Leave the seals intact.',
      readyToTurnIn:
        'The same mark, facing inward at both ends. Our founders were not guarding Greenvale from a flood — they were keeping something from remembering the way out. The well book calls its watchers the Keepers of the Last Door. Wear this pendant. Next we must find who closed that door, and why their names were scratched out.',
      completed:
        'The water remembers a door. Now we know where to look for its keepers. The seals must hold until we know what waits behind them.',
    },
  },
  {
    id: 'quest.greenvale.stillwater',
    name: 'What the Ward Held',
    description:
      'Bring Rill’s discovery to Maren, then follow the east road. Turn north before the rock ridge, follow the pale steps around its north end, and speak to Surveyor Tess at Stillwater. Silence the Siltbound Warden below her camp and return to Maren. Step out of each blue ground mark before the surge; spread out in a party. Every member must accept and speak to Tess personally; eligible nearby members share the kill.',
    giverNpcId: 'npc.greenvale.elder_maren',
    minLevel: 3,
    prerequisites: ['quest.greenvale.root_wound'],
    objectives: [
      {
        id: 'speak_to_tess',
        kind: 'talk',
        npcId: 'npc.greenvale.surveyor_tess',
        label: 'Read the ward records with Tess (Stillwater Steps)',
      },
      {
        id: 'silence_warden',
        kind: 'kill',
        enemyId: 'enemy.greenvale.siltbound_warden',
        count: 1,
        label: 'Silence the Siltbound Warden (below Tess’s camp)',
      },
    ],
    rewards: {
      xp: 600,
      currency: [{ currencyId: 'gold', amount: 250 }],
      items: [{ itemTemplateId: 'accessory.ring.stillwater_seal', quantity: 1 }],
    },
    dialogue: {
      offer:
        'Rill’s ward was not a weapon. Our founders used those lights to hold something beneath Greenvale asleep. If its voice has reached the roots, another seal may be failing. Tess kept the eastern water records at Stillwater Steps. Follow the east road, turn north before the ridge, and round its north end to her camp. Hear her account, then silence the guardian. It marks the ground before its surge — move, and give your companions room. Bring the truth back to me.',
      inProgress:
        'Find Tess beyond the north end of the eastern ridge. The blue mark stays where it appeared: step clear before the Warden’s surge. Speak to Tess and silence the guardian, then return here.',
      readyToTurnIn:
        'Tess’s inscription says “Keep the deep spring sleeping.” So the voice was never Rill’s ward — it came from the water below it. The wardens sealed a living spring, and we have been drinking from its banks for generations. You have quieted its guardian without breaking the seal. Take this seal-ring; Greenvale trusts you with what our founders hid. I will compare Tess’s records with the old well book before we go further.',
      completed:
        'The eastern seal holds for now. Rill watches the roots, Tess watches the water, and I will find out why our founders feared the deep spring. You have given us a question we can finally name.',
    },
  },
  {
    id: 'quest.greenvale.root_wound',
    name: 'The Light Beneath',
    description:
      "Beyond Brackenmaw's clearing, follow the violet roots west, then north to the broken ward. Silence the Hollow Lantern and report to Rill. Its light reaches farther than a wolf's bite: break sight behind the boulder north of the ward, or leave its violet ring during the wind-up. Each party member must accept and return individually; nearby eligible members share the kill.",
    giverNpcId: 'npc.greenvale.keeper_rill',
    minLevel: 2,
    prerequisites: ['quest.greenvale.hollow_trail'],
    objectives: [
      {
        id: 'silence_lantern',
        kind: 'kill',
        enemyId: 'enemy.greenvale.hollow_lantern',
        count: 1,
        label: 'Silence the Hollow Lantern (beyond Brackenmaw)',
      },
    ],
    rewards: {
      xp: 450,
      currency: [{ currencyId: 'gold', amount: 200 }],
      items: [{ itemTemplateId: 'accessory.cloak.rootward_mantle', quantity: 1 }],
    },
    dialogue: {
      offer:
        "The wolf guarded an old ward, not a den. Follow the violet roots beyond its clearing, west then north. A Hollow Lantern has turned the ward's light against living things. Silence it. Its violet ring shows its reach; hide behind the boulder north of the ward while it gathers light, or step beyond its reach. It moves slowly — use that time to close in.",
      inProgress:
        'Follow the violet roots beyond Brackenmaw. The Lantern strikes at range, but cannot strike through stone. Return when its light goes out.',
      readyToTurnIn:
        "The roots have cooled. That was a keeper's ward — something below has been calling through it. You have cut that voice off from Greenvale. Take this mantle; it was woven for the old wardens. For tonight, the village can sleep. Tomorrow we must learn who is calling.",
      completed:
        'The ward is quiet, and Greenvale has breathing room. Keep your mantle close. A broken ward can be mended; the voice beneath it still needs an answer.',
    },
  },
  {
    id: 'quest.greenvale.hollow_trail',
    name: 'Teeth Beneath the Roots',
    description:
      "Rill's warning leads west from the Old Waystone. Follow the pale trail stones past the clawed marker into the Hollow. Defeat Brackenmaw, then return to Rill. When the packleader braces inside an amber ring, step out before its bite lands.",
    giverNpcId: 'npc.greenvale.keeper_rill',
    minLevel: 2,
    prerequisites: ['quest.greenvale.old_waystone'],
    objectives: [
      {
        id: 'slay_brackenmaw',
        kind: 'kill',
        enemyId: 'enemy.greenvale.brackenmaw',
        count: 1,
        label: 'Brackenmaw slain (west of Old Waystone)',
      },
    ],
    rewards: {
      xp: 350,
      currency: [{ currencyId: 'gold', amount: 125 }],
      items: [{ itemTemplateId: 'accessory.trinket.keepers_token', quantity: 1 }],
    },
    dialogue: {
      offer:
        'Maren believes me, then. Follow the pale stones west. Something has scarred the roots — Brackenmaw guards them now. Watch its paws: when it braces in amber, step back from its bite. Hunt together if you can, and return to me when the trail is safe.',
      inProgress:
        'West, along the pale stones. Brackenmaw waits beyond the clawed marker. Step out of the amber ring while it winds up; then strike back.',
      readyToTurnIn:
        'The howling has stopped, but the roots still glow. Brackenmaw was guarding the wound, not making it. Take my ward-token. You have given us time to learn what lies below.',
      completed:
        'The trail is quiet again. I will watch the roots. Whatever woke them is deeper than one wolf can go.',
    },
  },
  {
    id: 'quest.greenvale.old_waystone',
    name: 'A Whisper at the Waystone',
    description:
      'Maren has heard that the Old Waystone is stirring. Follow the southern road to Keeper Rill beside the stone, then bring his warning back to the village.',
    giverNpcId: 'npc.greenvale.elder_maren',
    minLevel: 2,
    prerequisites: ['quest.greenvale.wolves_at_the_edge'],
    objectives: [
      {
        id: 'speak_to_rill',
        kind: 'talk',
        npcId: 'npc.greenvale.keeper_rill',
        label: 'Speak to Rill at the Old Waystone (south road)',
      },
    ],
    rewards: {
      xp: 150,
      currency: [{ currencyId: 'gold', amount: 75 }],
      items: [{ itemTemplateId: 'accessory.ring.copper_band', quantity: 1 }],
    },
    dialogue: {
      offer:
        'You have bought us a little peace. Take the south road to Keeper Rill at the Old Waystone. He says the stone has begun to stir. Hear him out, then return to me.',
      inProgress:
        'Follow the south road past the fields. Rill watches the Old Waystone. I need to know what he has seen.',
      readyToTurnIn:
        "A light toward the Hollow… perhaps the wolves were a warning. Thank you for bringing Rill's words home. Keep this ring; Greenvale may need you again.",
      completed:
        'Rill will keep watch. Rest here a while — we must understand what is waking before we venture deeper.',
    },
  },
  {
    id: 'quest.greenvale.wolves_at_the_edge',
    name: 'Wolves at the Edge',
    description:
      'Grey wolves have grown bold around Greenvale. Thin their numbers in the dens outside the ' +
      'village and bring Elder Maren proof of the hunt.',
    giverNpcId: 'npc.greenvale.elder_maren',
    minLevel: 1,
    objectives: [
      {
        id: 'kill_wolves',
        kind: 'kill',
        enemyId: 'enemy.greenvale.grey_wolf',
        count: 5,
        label: 'Grey Wolves slain',
      },
      {
        id: 'wolf_pelts',
        kind: 'collect',
        itemTemplateId: 'material.hide.wolf_pelt',
        count: 3,
        consumeOnTurnIn: true,
        label: 'Wolf Pelts',
      },
    ],
    rewards: {
      xp: 300,
      currency: [{ currencyId: 'gold', amount: 250 }],
      items: [{ itemTemplateId: 'accessory.cloak.wayfarer_cloak', quantity: 1 }],
    },
    dialogue: {
      offer:
        'The wolves come closer to the fences every night. Slay five of them and bring me three ' +
        'of their pelts — the villagers need proof they can sleep easy.',
      inProgress: 'The wolves still prowl. Five slain, three pelts — then come back to me.',
      readyToTurnIn: "You have done it! Hand me those pelts and take this with Greenvale's thanks.",
      completed: 'The nights are quieter thanks to you, friend.',
    },
  },
  {
    // Placeholder: referenced by the Elder's Letter quest item; never offered yet.
    id: 'quest.greenvale.letter_to_captain',
    name: 'A Letter for the Captain',
    giverNpcId: 'npc.greenvale.elder_maren',
    minLevel: 1,
    objectives: [
      {
        id: 'deliver',
        kind: 'talk',
        npcId: 'npc.greenvale.elder_maren',
        label: 'Deliver the letter',
      },
    ],
    rewards: { xp: 100, currency: [{ currencyId: 'gold', amount: 50 }] },
    placeholder: true,
  },
];

export const dungeons: DungeonDefinition[] = [];
