import type { ParsedGameData } from './registry';
import type { WorldZone, WorldChunk } from '@mmo/schemas';
export const brokenVault = {
  id: 'dungeon.greenvale.broken_vault',
  zoneId: 'zone.greenvale.broken_vault',
  entranceLocationId: 'location.greenvale_marches.cave',
  minLevel: 4,
  maxMembers: 5,
  lifetimeMs: 2 * 60 * 60 * 1000,
  objectives: ['spawn.vault.guard_west', 'spawn.vault.guard_east', 'spawn.vault.keeper'],
  rewardTemplateId: 'material.world.iron_shard',
  rewardQuantity: 4,
  rewardCopper: 150,
};
export function withDungeonContent(raw: ParsedGameData): ParsedGameData {
  const stonekin = raw.enemies.find((e) => e.id === 'enemy.world.greenvale_marches.stonekin.5')!;
  const zone: WorldZone = {
    id: brokenVault.zoneId,
    regionId: 'region.greenvale',
    name: 'Broken Vault',
    kind: 'dungeon',
    instanced: true,
    chunkSize: 64,
    bounds: { minCx: 0, maxCx: 1, minCz: 0, maxCz: 0 },
    defaultSpawn: { x: 8, y: 0, z: 32 },
    transitions: [],
    respawnPoints: [
      { id: 'respawn.vault.entry', name: 'Vault Threshold', position: { x: 8, y: 0, z: 32 } },
    ],
    safeZones: [
      { id: 'safe.vault.entry', name: 'Vault Threshold', center: { x: 8, y: 0, z: 32 }, radius: 8 },
    ],
    spawnGroups: [],
    landmarks: [
      {
        id: 'landmark.vault.exit',
        name: 'Return to Broken Vault Watch',
        position: { x: 8, y: 0, z: 32 },
      },
      { id: 'landmark.vault.keeper', name: 'The Bell Keeper', position: { x: 100, y: 0, z: 32 } },
    ],
    environment: { dayNightCycle: false, weatherProfileId: null, ambientColor: '#41414a' },
  };
  const chunks: WorldChunk[] = [0, 1].map((cx) => ({
    zoneId: zone.id,
    coord: { cx, cz: 0 },
    terrainAssetId: null,
    groundColor: '#3b4141',
    props: [],
    colliders: [],
    spawnPoints: [],
  }));
  // Open greybox encounter floor; the marked threshold is the recovery point.
  chunks[0]!.spawnPoints = [
    {
      id: brokenVault.objectives[0]!,
      kind: 'enemy',
      refId: stonekin.id,
      position: { x: 32, y: 0, z: 24 },
      rotationY: 0,
      respawnMs: brokenVault.lifetimeMs,
      groupId: null,
      quantity: 1,
      interactRadius: 3,
      wanderRadius: 0,
    },
    {
      id: brokenVault.objectives[1]!,
      kind: 'enemy',
      refId: stonekin.id,
      position: { x: 58, y: 0, z: 40 },
      rotationY: 0,
      respawnMs: brokenVault.lifetimeMs,
      groupId: null,
      quantity: 1,
      interactRadius: 3,
      wanderRadius: 0,
    },
  ];
  chunks[1]!.spawnPoints = [
    {
      id: brokenVault.objectives[2]!,
      kind: 'enemy',
      refId: 'enemy.greenvale.vault_keeper',
      position: { x: 100, y: 0, z: 32 },
      rotationY: 0,
      respawnMs: brokenVault.lifetimeMs,
      groupId: null,
      quantity: 1,
      interactRadius: 3,
      wanderRadius: 0,
    },
  ];
  const boss = {
    ...stonekin,
    id: 'enemy.greenvale.vault_keeper',
    name: 'The Bell Keeper',
    maxHealth: stonekin.maxHealth * 2,
    combat: stonekin.combat ? { ...stonekin.combat, windupMs: 1800, groundStrikeRadius: 5 } : null,
  };
  return {
    ...raw,
    dungeonEntries: raw.dungeonEntries?.map((e) =>
      e.id === brokenVault.id
        ? {
            ...e,
            mode: 'private_instance' as const,
            description:
              'Private solo or fixed-party run. Clear two guardians and the Bell Keeper; personal completion supplies are awarded once per run.',
          }
        : e,
    ),
    zones: [...raw.zones, zone],
    chunks: [...raw.chunks, ...chunks],
    enemies: [...raw.enemies, boss],
  };
}
