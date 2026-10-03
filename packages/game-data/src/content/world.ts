import type {
  DungeonDefinition,
  EnemyDefinition,
  NpcDefinition,
  QuestDefinition,
  WorldChunk,
  WorldRegion,
  WorldZone,
} from '@mmo/schemas';

/**
 * DEMO WORLD — just enough data to prove the region → zone → chunk architecture.
 * One region, one zone, a 2×2 grid of 64 m chunks (128 m × 128 m) centred on the origin.
 */

export const regions: WorldRegion[] = [
  {
    id: 'region.greenvale',
    name: 'Greenvale',
    description: 'Placeholder starting region: farmland and forest on the edge of the old kingdom.',
    levelRange: { min: 1, max: 10 },
    zoneIds: ['zone.greenvale.meadows'],
    themes: ['medieval', 'pastoral'],
  },
];

export const zones: WorldZone[] = [
  {
    id: 'zone.greenvale.meadows',
    regionId: 'region.greenvale',
    name: 'Greenvale Meadows',
    kind: 'wilderness',
    instanced: false,
    chunkSize: 64,
    bounds: { minCx: -1, maxCx: 0, minCz: -1, maxCz: 0 },
    defaultSpawn: { x: 0, y: 0, z: -8 },
    transitions: [],
    environment: { dayNightCycle: false, weatherProfileId: null, ambientColor: '#9fc5e8' },
  },
];

const Z = 'zone.greenvale.meadows';

export const chunks: WorldChunk[] = [
  {
    zoneId: Z,
    coord: { cx: -1, cz: -1 },
    terrainAssetId: null,
    groundColor: '#5f8f3a',
    props: [
      {
        id: 'tree_a',
        kind: 'tree',
        position: { x: -30, y: 0, z: -20 },
        rotationY: 0,
        scale: 1.2,
        modelId: null,
      },
      {
        id: 'tree_b',
        kind: 'tree',
        position: { x: -45, y: 0, z: -40 },
        rotationY: 0,
        scale: 1,
        modelId: null,
      },
      {
        id: 'rock_a',
        kind: 'rock',
        position: { x: -12, y: 0, z: -30 },
        rotationY: 0.4,
        scale: 1.5,
        modelId: null,
      },
    ],
    spawnPoints: [
      {
        id: 'spawn.greenvale.ore_pile',
        kind: 'pickup',
        position: { x: -10, y: 0, z: -12 },
        rotationY: 0,
        refId: 'material.ore.copper_ore',
        quantity: 3,
        respawnMs: 15_000,
        interactRadius: 3,
      },
    ],
  },
  {
    zoneId: Z,
    coord: { cx: 0, cz: -1 },
    terrainAssetId: null,
    groundColor: '#64943d',
    props: [
      {
        id: 'tree_c',
        kind: 'tree',
        position: { x: 25, y: 0, z: -35 },
        rotationY: 0,
        scale: 1.3,
        modelId: null,
      },
      {
        id: 'fence_a',
        kind: 'fence',
        position: { x: 15, y: 0, z: -5 },
        rotationY: 0,
        scale: 1,
        modelId: null,
      },
    ],
    spawnPoints: [
      {
        id: 'spawn.greenvale.sword_rack',
        kind: 'pickup',
        position: { x: 8, y: 0, z: -14 },
        rotationY: 0,
        refId: 'weapon.sword.iron_longsword',
        quantity: 1,
        respawnMs: 20_000,
        interactRadius: 3,
      },
    ],
  },
  {
    zoneId: Z,
    coord: { cx: -1, cz: 0 },
    terrainAssetId: null,
    groundColor: '#5a8a36',
    props: [
      {
        id: 'house_a',
        kind: 'building',
        position: { x: -20, y: 0, z: 18 },
        rotationY: 0.2,
        scale: 1,
        modelId: null,
      },
      {
        id: 'tree_d',
        kind: 'tree',
        position: { x: -50, y: 0, z: 40 },
        rotationY: 0,
        scale: 1.1,
        modelId: null,
      },
    ],
    spawnPoints: [
      {
        id: 'spawn.greenvale.elder',
        kind: 'npc',
        position: { x: -6, y: 0, z: 6 },
        rotationY: Math.PI,
        refId: 'npc.greenvale.elder_maren',
        quantity: 1,
        respawnMs: null,
        interactRadius: 4,
      },
    ],
  },
  {
    zoneId: Z,
    coord: { cx: 0, cz: 0 },
    terrainAssetId: null,
    groundColor: '#689a40',
    props: [
      {
        id: 'rock_b',
        kind: 'rock',
        position: { x: 35, y: 0, z: 30 },
        rotationY: 1.1,
        scale: 2,
        modelId: null,
      },
      {
        id: 'marker_spawn',
        kind: 'marker',
        position: { x: 0, y: 0, z: 0 },
        rotationY: 0,
        scale: 1,
        modelId: null,
      },
    ],
    spawnPoints: [],
  },
];

export const npcs: NpcDefinition[] = [
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
    id: 'enemy.greenvale.grey_wolf',
    name: 'Grey Wolf',
    level: 2,
    maxHealth: 60,
    family: 'beast',
    lootTableId: 'loot.greenvale.wolf',
    xpReward: 45,
    modelId: null,
    isBoss: false,
    isWorldBoss: false,
  },
];

export const quests: QuestDefinition[] = [
  {
    id: 'quest.greenvale.letter_to_captain',
    name: 'A Letter for the Captain',
    giverNpcId: 'npc.greenvale.elder_maren',
    minLevel: 1,
    objectives: [{ kind: 'talk', npcId: 'npc.greenvale.elder_maren' }],
    rewards: { xp: 100, currency: [{ currencyId: 'gold', amount: 50 }], itemTemplateIds: [] },
    placeholder: true,
  },
];

export const dungeons: DungeonDefinition[] = [];
