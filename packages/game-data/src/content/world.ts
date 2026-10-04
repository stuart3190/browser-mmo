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
