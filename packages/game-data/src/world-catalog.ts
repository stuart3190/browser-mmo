import type { WorldCatalog, WorldChunk, WorldZone } from '@mmo/schemas';
import type { RawGameData } from './registry';
import { chunkCoordFor, chunkKey, isInsideZone, distance2D } from './rules/world';

export function appendWorldCatalog(raw: RawGameData, world: WorldCatalog): RawGameData {
  if (raw.worldCatalog) throw new Error('Only one composed world atlas may be installed');
  const out = {
    ...raw,
    worldCatalog: world,
    regions: [...raw.regions],
    zones: [...raw.zones],
    chunks: [...raw.chunks],
    itemTemplates: [...raw.itemTemplates, ...world.materials],
    enemies: [...raw.enemies],
    npcs: [...raw.npcs],
    lootTables: [...raw.lootTables],
  };
  for (const { category: _category, ...loot } of world.lootProfiles) out.lootTables.push(loot);
  for (const family of world.monsterFamilies)
    for (const v of family.variants)
      out.enemies.push({
        id: v.id,
        name: v.name,
        family: family.id,
        level: v.level,
        maxHealth: v.maxHealth,
        lootTableId: v.lootProfileId,
        xpReward: v.xpReward,
        modelId: family.id.includes('outlaw')
          ? 'greybox:humanoid'
          : ['family.stonekin'].includes(family.id)
            ? 'greybox:construct'
            : ['family.cinderling', 'family.veilshade'].includes(family.id)
              ? 'greybox:elemental'
              : 'greybox:quadruped',
        isBoss: false,
        isWorldBoss: false,
        combat: v.combat,
      });
  for (const region of world.regions) {
    const width = region.bounds.maxX - region.bounds.minX,
      height = region.bounds.maxZ - region.bounds.minZ;
    const biome = world.biomes.find((b) => b.id === region.biomeId);
    if (!biome) throw new Error(`Region ${region.id}: missing biome ${region.biomeId}`);
    const settlement = world.locations.find(
      (l) => l.regionId === region.id && l.kind === 'settlement',
    );
    if (!settlement) throw new Error(`Region ${region.id}: needs a settlement`);
    out.regions.push({
      id: region.id,
      name: region.name,
      description: region.transitionIntent,
      levelRange: region.levelBand,
      zoneIds: [region.zoneId],
      themes: [region.biomeId, region.danger],
    });
    out.zones.push({
      id: region.zoneId,
      regionId: region.id,
      name: region.name,
      kind: 'wilderness',
      instanced: false,
      chunkSize: 64,
      bounds: { minCx: 0, minCz: 0, maxCx: width / 64 - 1, maxCz: height / 64 - 1 },
      defaultSpawn: settlement.position,
      transitions: [],
      respawnPoints: [
        { id: `respawn.${region.id}`, name: settlement.name, position: settlement.position },
      ],
      safeZones: [
        { id: `safe.${region.id}`, name: settlement.name, center: settlement.position, radius: 48 },
      ],
      spawnGroups: [],
      landmarks: world.locations
        .filter((l) => l.zoneId === region.zoneId)
        .map((l) => ({ id: l.id, name: l.name, position: l.position })),
      environment: { dayNightCycle: true, weatherProfileId: null, ambientColor: biome.groundColor },
    });
  }
  const chunks = new Map<string, WorldChunk>();
  const chunkAt = (zoneId: string, position: { x: number; z: number }) => {
    const zone = out.zones.find((z) => z.id === zoneId)!;
    const coord = chunkCoordFor(zone, position),
      key = `${zoneId}|${chunkKey(coord)}`;
    let chunk = chunks.get(key);
    if (!chunk) {
      chunk = {
        zoneId,
        coord,
        terrainAssetId: null,
        groundColor: zone.environment.ambientColor,
        props: [],
        colliders: [],
        spawnPoints: [],
      };
      chunks.set(key, chunk);
    }
    return chunk;
  };
  const usedSpawnIds = new Set(out.chunks.flatMap((c) => c.spawnPoints.map((s) => s.id)));
  for (const location of world.locations) {
    if (location.zoneId === world.enclave.zoneId) continue;
    const chunk = chunkAt(location.zoneId, location.position);
    chunk.props.push({
      id: `mark_${location.id}`.slice(0, 64),
      kind: 'marker',
      position: location.position,
      rotationY: 0,
      scale: 1,
      modelId: null,
    });
    if (location.kind === 'settlement' || location.kind === 'quest_hub')
      for (const [x, z] of [
        [-24, 24],
        [24, 24],
        [-24, -24],
        [24, -24],
      ]) {
        const pos = { x: location.position.x + x!, y: 0, z: location.position.z + z! };
        chunkAt(location.zoneId, pos).props.push({
          id: `house_${location.id}_${x}_${z}`.slice(0, 64),
          kind: 'building',
          position: pos,
          rotationY: 0,
          scale: 1,
          modelId: null,
        });
      }
    if (location.kind === 'habitat')
      for (const [i, id] of location.variantIds.entries()) {
        const pos = { ...location.position, x: location.position.x + i * 8 };
        // Preserve established first-placement IDs while allowing the same catalog variant
        // at any number of distinct habitats. No regional ID/name conventions required.
        const originalId = `spawn.${id}`;
        const spawnId = usedSpawnIds.has(originalId) ? `spawn.${location.id}.${i}` : originalId;
        usedSpawnIds.add(spawnId);
        chunkAt(location.zoneId, pos).spawnPoints.push({
          id: spawnId,
          kind: 'enemy',
          refId: id,
          position: pos,
          rotationY: 0,
          quantity: 1,
          respawnMs: 45000,
          interactRadius: 3,
          groupId: null,
          wanderRadius: 4,
        });
        const treePos = { x: pos.x + 20, y: 0, z: pos.z + 20 };
        chunkAt(location.zoneId, treePos).props.push({
          id:
            spawnId === originalId
              ? `grove_${id}`.slice(0, 64)
              : `grove_${location.id}_${i}`.slice(0, 64),
          kind: 'tree',
          position: treePos,
          rotationY: 0,
          scale: 1.4,
          modelId: null,
        });
      }
    if (location.kind === 'dungeon') {
      const pos = { ...location.position, x: location.position.x + 9 };
      chunkAt(location.zoneId, pos).props.push({
        id: `cave_${location.id}`.slice(0, 64),
        kind: 'rock',
        position: pos,
        rotationY: 0,
        scale: 3,
        modelId: null,
      });
    }
  }
  for (const pop of world.populations) {
    const loc = world.locations.find((l) => l.id === pop.locationId),
      archetype = world.npcArchetypes.find((a) => a.id === pop.archetypeId);
    if (!loc || !archetype) throw new Error(`Population ${pop.id}: missing location/archetype`);
    const position = { x: loc.position.x + pop.offset.x, y: 0, z: loc.position.z + pop.offset.z };
    out.npcs.push({
      id: pop.id,
      name: pop.name,
      title: archetype.name,
      role: pop.runtimeRole ?? archetype.runtimeRole,
      modelId: null,
      dialogue: pop.dialogue,
    });
    chunkAt(loc.zoneId, position).spawnPoints.push({
      id: `spawn.${pop.id}`,
      kind: 'npc',
      refId: pop.id,
      position,
      rotationY: 0,
      quantity: 1,
      respawnMs: null,
      interactRadius: 4,
      groupId: null,
      wanderRadius: 0,
    });
  }
  for (const node of world.resourceNodes) {
    const loc = world.locations.find((l) => l.id === node.locationId)!;
    const resource = world.resources.find((r) => r.id === node.resourceId)!;
    if (!loc || !resource) throw new Error(`${node.id}: missing resource/location`);
    const pos = { x: loc.position.x + node.offset.x, y: 0, z: loc.position.z + node.offset.z };
    chunkAt(loc.zoneId, pos).spawnPoints.push({
      id: node.id,
      kind: 'resource_node',
      refId: resource.itemTemplateId,
      position: pos,
      rotationY: 0,
      quantity: node.quantity,
      respawnMs: node.regrowMs,
      interactRadius: 3,
      groupId: null,
      wanderRadius: 0,
    });
  }
  for (const prop of world.dressing) {
    const loc = world.locations.find((l) => l.id === prop.locationId);
    if (!loc) throw new Error(`${prop.id}: missing location`);
    const position = { x: loc.position.x + prop.offset.x, y: 0, z: loc.position.z + prop.offset.z };
    if (!isInsideZone(out.zones.find((z) => z.id === loc.zoneId)! as WorldZone, position))
      throw new Error(`${prop.id}: dressing outside zone`);
    chunkAt(loc.zoneId, position).props.push({
      id: prop.id.slice(0, 64),
      kind: prop.kind,
      position,
      scale: prop.scale,
      rotationY: prop.rotationY,
      modelId: null,
    });
  }
  out.chunks.push(...chunks.values());
  validateWorldCatalog(out, world);
  return out;
}

export function validateWorldCatalog(raw: RawGameData, w: WorldCatalog): void {
  const claimed = new Set<string>();
  for (const entries of [
    w.landmasses,
    w.regions,
    w.biomes,
    w.locations,
    w.travel,
    w.roads,
    w.monsterFamilies,
    w.npcArchetypes,
    w.populations,
    w.materials,
    w.resources,
    w.resourceNodes,
    w.dressing,
    w.lootProfiles,
    w.dungeonArchetypes,
    ...w.monsterFamilies.map((f) => f.variants),
  ])
    for (const entry of entries) {
      if (claimed.has(entry.id)) throw new Error(`Duplicate world ID ${entry.id}`);
      claimed.add(entry.id);
    }
  const requireRef = <T extends { id: string }>(list: readonly T[], id: string, owner: string) => {
    const value = list.find((v) => v.id === id);
    if (!value) throw new Error(`${owner}: missing reference ${id}`);
    return value;
  };
  const inside = (b: WorldCatalog['regions'][number]['bounds'], x: number, z: number) =>
    x >= b.minX && z >= b.minZ && x < b.maxX && z < b.maxZ;
  for (const land of w.landmasses) {
    const regions = land.regionIds.map((id) => requireRef(w.regions, id, land.id));
    if (new Set(land.regionIds).size !== land.regionIds.length)
      throw new Error(`${land.id}: duplicate regions`);
    const area = (b: typeof land.bounds) => (b.maxX - b.minX) * (b.maxZ - b.minZ);
    if (regions.reduce((sum, r) => sum + area(r.bounds), 0) !== area(land.bounds))
      throw new Error(`${land.id}: regions must cover its bounds`);
    for (const r of regions)
      if (
        r.landmassId !== land.id ||
        !inside(land.bounds, r.bounds.minX, r.bounds.minZ) ||
        r.bounds.maxX > land.bounds.maxX ||
        r.bounds.maxZ > land.bounds.maxZ
      )
        throw new Error(`${r.id}: outside landmass`);
    for (const a of regions)
      for (const b of regions)
        if (
          a.id !== b.id &&
          Math.max(a.bounds.minX, b.bounds.minX) < Math.min(a.bounds.maxX, b.bounds.maxX) &&
          Math.max(a.bounds.minZ, b.bounds.minZ) < Math.min(a.bounds.maxZ, b.bounds.maxZ)
        )
          throw new Error(`${land.id}: overlapping regions`);
    for (const a of regions)
      for (const b of regions) {
        const touches =
          ((a.bounds.maxX === b.bounds.minX || b.bounds.maxX === a.bounds.minX) &&
            Math.max(a.bounds.minZ, b.bounds.minZ) < Math.min(a.bounds.maxZ, b.bounds.maxZ)) ||
          ((a.bounds.maxZ === b.bounds.minZ || b.bounds.maxZ === a.bounds.minZ) &&
            Math.max(a.bounds.minX, b.bounds.minX) < Math.min(a.bounds.maxX, b.bounds.maxX));
        if (touches && !a.neighborIds.includes(b.id))
          throw new Error(`${a.id}: missing physical adjacency ${b.id}`);
      }
  }
  const variants = w.monsterFamilies.flatMap((f) => f.variants);
  for (const r of w.regions) {
    const land = requireRef(w.landmasses, r.landmassId, r.id);
    if (!land.regionIds.includes(r.id)) throw new Error(`${r.id}: unregistered region`);
    const zone = requireRef(raw.zones, r.zoneId, r.id);
    if (
      zone.regionId !== r.id ||
      (r.bounds.maxX - r.bounds.minX) % 64 ||
      (r.bounds.maxZ - r.bounds.minZ) % 64
    )
      throw new Error(`${r.id}: zone/bounds mismatch`);
    requireRef(w.biomes, r.biomeId, r.id);
    if (!w.locations.some((l) => l.regionId === r.id && l.kind === 'port'))
      throw new Error(`${r.id}: needs a port`);
    for (const id of r.monsterVariantIds) {
      const v = requireRef(variants, id, r.id),
        f = w.monsterFamilies.find((f) => f.variants.some((v) => v.id === id))!;
      if (v.level < r.levelBand.min || v.level > r.levelBand.max || !f.biomeIds.includes(r.biomeId))
        throw new Error(`${r.id}: incompatible monster ${id}`);
    }
    for (const id of r.resourceIds)
      if (!requireRef(w.resources, id, r.id).biomeIds.includes(r.biomeId))
        throw new Error(`${r.id}: incompatible resource ${id}`);
    for (const id of r.npcArchetypeIds) requireRef(w.npcArchetypes, id, r.id);
    for (const id of r.dungeonArchetypeIds) requireRef(w.dungeonArchetypes, id, r.id);
    for (const id of r.neighborIds) {
      const n = requireRef(w.regions, id, r.id),
        a = r.bounds,
        b = n.bounds;
      const adjacent =
        ((a.maxX === b.minX || b.maxX === a.minX) &&
          Math.max(a.minZ, b.minZ) < Math.min(a.maxZ, b.maxZ)) ||
        ((a.maxZ === b.minZ || b.maxZ === a.minZ) &&
          Math.max(a.minX, b.minX) < Math.min(a.maxX, b.maxX));
      if (
        n.landmassId !== r.landmassId ||
        !n.neighborIds.includes(r.id) ||
        !adjacent ||
        Math.max(r.levelBand.min, n.levelBand.min) > Math.min(r.levelBand.max, n.levelBand.max)
      )
        throw new Error(`${r.id}: bad adjacency/progression buffer ${id}`);
    }
  }
  const enclaveZone = requireRef(raw.zones, w.enclave.zoneId, 'enclave');
  const enclaveRegion = requireRef(w.regions, w.enclave.regionId, 'enclave');
  if (
    w.enclave.atlasOrigin.x + enclaveZone.bounds.minCx * enclaveZone.chunkSize < 0 ||
    w.enclave.atlasOrigin.z + enclaveZone.bounds.minCz * enclaveZone.chunkSize < 0 ||
    w.enclave.atlasOrigin.x + (enclaveZone.bounds.maxCx + 1) * enclaveZone.chunkSize >
      enclaveRegion.bounds.maxX - enclaveRegion.bounds.minX ||
    w.enclave.atlasOrigin.z + (enclaveZone.bounds.maxCz + 1) * enclaveZone.chunkSize >
      enclaveRegion.bounds.maxZ - enclaveRegion.bounds.minZ
  )
    throw new Error('Enclave outside region');
  for (const l of w.locations) {
    const r = requireRef(w.regions, l.regionId, l.id),
      z = requireRef(raw.zones, l.zoneId, l.id);
    if (
      !(r.zoneId === l.zoneId || (l.zoneId === w.enclave.zoneId && r.id === w.enclave.regionId)) ||
      !isInsideZone(z as WorldZone, l.position) ||
      l.position.y !== 0
    )
      throw new Error(`${l.id}: invalid location coordinates/region`);
    for (const id of l.variantIds)
      if (!r.monsterVariantIds.includes(id))
        throw new Error(`${l.id}: variant not in region ${id}`);
    for (const id of l.resourceIds)
      if (!r.resourceIds.includes(id)) throw new Error(`${l.id}: resource not in region ${id}`);
    if (l.dungeonArchetypeId && !r.dungeonArchetypeIds.includes(l.dungeonArchetypeId))
      throw new Error(`${l.id}: invalid dungeon archetype`);
  }
  for (const t of w.travel) {
    const a = requireRef(w.locations, t.fromLocationId, t.id),
      b = requireRef(w.locations, t.toLocationId, t.id);
    if (a.zoneId === b.zoneId || a.id === b.id)
      throw new Error(`${t.id}: travel must change zones`);
    if (t.mode === 'boat' && (a.kind !== 'port' || b.kind !== 'port'))
      throw new Error(`${t.id}: boats require ports`);
    if (t.mode === 'road' && (a.kind !== 'gate' || b.kind !== 'gate'))
      throw new Error(`${t.id}: roads require gates`);
    if (t.mode === 'road') {
      const ar = requireRef(w.regions, a.regionId, t.id),
        br = requireRef(w.regions, b.regionId, t.id);
      const enclaveRoad = a.zoneId === w.enclave.zoneId || b.zoneId === w.enclave.zoneId;
      if (
        enclaveRoad
          ? ar.id !== w.enclave.regionId || br.id !== w.enclave.regionId
          : !ar.neighborIds.includes(br.id)
      )
        throw new Error(`${t.id}: road must follow region adjacency`);
    }
    if (
      t.enabled &&
      !w.travel.some(
        (r) =>
          r.enabled && r.fromLocationId === b.id && r.toLocationId === a.id && r.mode === t.mode,
      )
    )
      throw new Error(`${t.id}: missing return route`);
    if (t.requiredQuestId) requireRef(raw.quests, t.requiredQuestId, t.id);
  }
  const reachable = new Set([w.enclave.zoneId]);
  for (let changed = true; changed;) {
    changed = false;
    for (const t of w.travel.filter((t) => t.enabled)) {
      const a = w.locations.find((l) => l.id === t.fromLocationId)!,
        b = w.locations.find((l) => l.id === t.toLocationId)!;
      if (reachable.has(a.zoneId) && !reachable.has(b.zoneId)) {
        reachable.add(b.zoneId);
        changed = true;
      }
    }
  }
  for (const r of w.regions)
    if (!reachable.has(r.zoneId)) throw new Error(`${r.id}: unreachable zone`);
  for (const f of w.monsterFamilies) {
    for (const id of f.biomeIds) requireRef(w.biomes, id, f.id);
    for (const v of f.variants) requireRef(w.lootProfiles, v.lootProfileId, v.id);
  }
  for (const r of w.resources) {
    requireRef(raw.itemTemplates, r.itemTemplateId, r.id);
    for (const id of r.biomeIds) requireRef(w.biomes, id, r.id);
  }
  for (const node of w.resourceNodes) {
    const loc = requireRef(w.locations, node.locationId, node.id);
    const resource = requireRef(w.resources, node.resourceId, node.id);
    if (!resource.gatheringImplemented || !loc.resourceIds.includes(resource.id))
      throw new Error(`${node.id}: resource not harvestable at location`);
    if (node.quantity > requireRef(raw.itemTemplates, resource.itemTemplateId, node.id).maxStack)
      throw new Error(`${node.id}: yield exceeds stack`);
  }
  for (const a of w.npcArchetypes)
    for (const id of a.stockTemplateIds) requireRef(raw.itemTemplates, id, a.id);
  for (const p of w.populations) {
    const l = requireRef(w.locations, p.locationId, p.id),
      r = requireRef(w.regions, l.regionId, p.id);
    if (!r.npcArchetypeIds.includes(p.archetypeId))
      throw new Error(`${p.id}: role outside regional catalog`);
  }
  for (const road of w.roads) {
    const z = requireRef(raw.zones, road.zoneId, road.id);
    for (const p of road.points)
      if (!isInsideZone(z as WorldZone, p)) throw new Error(`${road.id}: road outside zone`);
  }
}

export function travelAt(
  w: WorldCatalog | undefined,
  zoneId: string,
  pos: { x: number; z: number },
) {
  return (
    w?.travel.filter(
      (t) =>
        t.enabled &&
        w.locations.some(
          (l) =>
            l.id === t.fromLocationId && l.zoneId === zoneId && distance2D(l.position, pos) <= 5,
        ),
    ) ?? []
  );
}

/** Guidance to a real place, via the first edge of the current zone's shortest travel path. */
export function worldDestination(w: WorldCatalog | undefined, id: string | null, zoneId: string) {
  const destination = w?.locations.find((l) => l.id === id);
  if (!w || !destination) return null;
  if (destination.zoneId === zoneId) return { location: destination, destination };
  const queue: [string, WorldCatalog['locations'][number] | null][] = [[zoneId, null]],
    seen = new Set([zoneId]);
  while (queue.length) {
    const [zone, first] = queue.shift()!;
    for (const t of w.travel.filter((t) => t.enabled)) {
      const a = w.locations.find((l) => l.id === t.fromLocationId)!,
        b = w.locations.find((l) => l.id === t.toLocationId)!;
      if (a.zoneId !== zone || seen.has(b.zoneId)) continue;
      const node = first ?? a;
      if (b.zoneId === destination.zoneId) return { location: node, destination };
      seen.add(b.zoneId);
      queue.push([b.zoneId, node]);
    }
  }
  return null;
}
