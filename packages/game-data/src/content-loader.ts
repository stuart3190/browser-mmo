import { ContentPackSchema, type ContentPack } from '@mmo/schemas';
import { GameData, type RawGameData } from './registry';
import { appendWorldCatalog } from './world-catalog';

export type ContentReference = { contentRef: string };
type ReferenceList<T> = (T | ContentReference)[];
/** Manifest references preserve legacy order and prohibit silent definition overrides. */
export type ContentManifest = Omit<RawGameData, 'quests' | 'npcs' | 'enemies' | 'lootTables'> & {
  quests: ReferenceList<RawGameData['quests'][number]>;
  npcs: ReferenceList<RawGameData['npcs'][number]>;
  enemies: ReferenceList<RawGameData['enemies'][number]>;
  lootTables: ReferenceList<RawGameData['lootTables'][number]>;
};

/** Pure, all-or-nothing compilation. No IO, hot reload, scripts, or partial runtime installation. */
export function compileContentCatalog(
  manifest: ContentManifest,
  inputs: readonly unknown[],
): RawGameData {
  const packs = inputs.map((input) => ContentPackSchema.parse(input));
  const inlineIds = new Set<string>();
  for (const value of Object.values(manifest))
    if (Array.isArray(value)) {
      for (const entry of value)
        if (typeof entry === 'object' && entry !== null && 'id' in entry)
          inlineIds.add(entry.id as string);
    }
  const ids = new Set<string>();
  const claim = (id: string) => {
    if (inlineIds.has(id)) throw new Error(`Conflicting inline/pack ID ${id}`);
    if (ids.has(id)) throw new Error(`Duplicate content ID ${id}`);
    ids.add(id);
  };
  const rewards = new Map<string, ContentPack['rewards'][number]>();
  for (const pack of packs) {
    claim(pack.id);
    if (pack.schemaVersion === 2) {
      for (const values of Object.values(pack.world))
        if (Array.isArray(values)) for (const entry of values) claim(entry.id as string);
      for (const family of pack.world.monsterFamilies)
        for (const variant of family.variants) claim(variant.id);
    }
    if (pack.schemaVersion === 3) {
      for (const offer of pack.serviceOffers) claim(offer.id);
      for (const entry of pack.dungeonEntries) claim(entry.id);
    }
    for (const reward of pack.rewards) {
      claim(reward.id);
      rewards.set(reward.id, reward);
    }
    for (const npc of pack.npcs) claim(npc.definition.id);
    for (const quest of pack.quests) claim(quest.id);
    for (const encounter of pack.encounters) {
      claim(encounter.id);
      claim(encounter.enemy.id);
    }
  }
  const rewardFor = (id: string, kind: 'quest' | 'loot') => {
    const reward = rewards.get(id);
    if (!reward || reward.kind !== kind)
      throw new Error(`Missing or wrong-kind ${kind} reward ${id}`);
    return reward;
  };
  const quests = packs.flatMap((p) =>
    p.quests.map(({ rewardId, ...quest }) => {
      const reward = rewardFor(rewardId, 'quest');
      if (reward.kind !== 'quest') throw new Error('Invalid quest reward');
      return { ...quest, rewards: reward.value };
    }),
  );
  const npcs = packs.flatMap((p) => p.npcs.map((npc) => npc.definition));
  const enemies = packs.flatMap((p) =>
    p.encounters.map(({ enemy, lootRewardId }) => {
      if (lootRewardId) rewardFor(lootRewardId, 'loot');
      return { ...enemy, lootTableId: lootRewardId };
    }),
  );
  const lootTables = [...rewards.values()].flatMap((r) =>
    r.kind === 'loot' ? [{ id: r.id, ...r.value }] : [],
  );
  const resolve = <T extends { id: string }>(entries: ReferenceList<T>, definitions: T[]): T[] => {
    const remaining = new Map(definitions.map((d) => [d.id, d]));
    const result = entries.map((entry) => {
      if (!('contentRef' in entry)) {
        if (remaining.has(entry.id)) throw new Error(`Conflicting inline/pack ID ${entry.id}`);
        return entry;
      }
      const value = remaining.get(entry.contentRef);
      if (!value) throw new Error(`Missing or duplicate manifest reference ${entry.contentRef}`);
      remaining.delete(entry.contentRef);
      return value;
    });
    if (remaining.size)
      throw new Error(`Unregistered pack definitions: ${[...remaining.keys()].join(', ')}`);
    return result;
  };
  let raw: RawGameData = {
    ...manifest,
    quests: resolve(manifest.quests, quests),
    npcs: resolve(manifest.npcs, npcs),
    enemies: resolve(manifest.enemies, enemies),
    lootTables: resolve(manifest.lootTables, lootTables),
    chunks: manifest.chunks.map((c) => ({ ...c, spawnPoints: [...c.spawnPoints] })),
  };
  // Install catalog dependencies before ordinary packs resolve world placements/reward items.
  for (const pack of packs) if (pack.schemaVersion === 2) raw = appendWorldCatalog(raw, pack.world);
  for (const pack of packs) {
    const owners = [
      ...pack.npcs.map((n) => ({ id: n.definition.id, kind: 'npc', placements: n.placements })),
      ...pack.encounters.map((e) => ({ id: e.enemy.id, kind: 'enemy', placements: e.placements })),
    ];
    for (const owner of owners)
      for (const { zoneId, spawn } of owner.placements) {
        if (spawn.kind !== owner.kind || spawn.refId !== owner.id)
          throw new Error(
            `Placement ${spawn.id} must reference its ${owner.kind} owner ${owner.id}`,
          );
        const zone = raw.zones.find((z) => z.id === zoneId);
        let chunk =
          zone &&
          raw.chunks.find(
            (c) =>
              c.zoneId === zoneId &&
              c.coord.cx === Math.floor(spawn.position.x / zone.chunkSize) &&
              c.coord.cz === Math.floor(spawn.position.z / zone.chunkSize),
          );
        if (!chunk && zone && raw.worldCatalog?.regions.some((r) => r.zoneId === zoneId)) {
          const coord = {
            cx: Math.floor(spawn.position.x / zone.chunkSize),
            cz: Math.floor(spawn.position.z / zone.chunkSize),
          };
          const b = zone.bounds;
          if (
            coord.cx >= b.minCx &&
            coord.cx <= b.maxCx &&
            coord.cz >= b.minCz &&
            coord.cz <= b.maxCz
          ) {
            chunk = {
              zoneId,
              coord,
              terrainAssetId: null,
              groundColor: zone.environment.ambientColor,
              props: [],
              colliders: [],
              spawnPoints: [],
            };
            raw.chunks.push(chunk);
          }
        }
        if (!chunk) throw new Error(`Placement ${spawn.id}: unknown zone/chunk ${zoneId}`);
        chunk.spawnPoints.push(spawn);
      }
  }
  // Validate even unreferenced reusable quest rewards: authoring errors must never lurk until use.
  for (const reward of rewards.values())
    if (reward.kind === 'quest') {
      for (const c of reward.value.currency)
        if (!raw.currencies.some((v) => v.id === c.currencyId))
          throw new Error(`Reward ${reward.id}: unknown currency ${c.currencyId}`);
      for (const i of reward.value.items) {
        const template = raw.itemTemplates.find((t) => t.id === i.itemTemplateId);
        if (!template || i.quantity > template.maxStack)
          throw new Error(`Reward ${reward.id}: invalid item/quantity ${i.itemTemplateId}`);
      }
    }
  const extensions = packs.filter((p) => p.schemaVersion === 3);
  if (extensions.length) {
    raw.serviceOffers = extensions.flatMap((p) => p.serviceOffers);
    raw.dungeonEntries = extensions.flatMap((p) => p.dungeonEntries);
  }
  for (const offer of raw.serviceOffers ?? []) {
    if (!raw.npcs.some((n) => n.id === offer.npcId))
      throw new Error(`Service ${offer.id}: missing NPC`);
    if (new Set(offer.inputs.map((i) => i.itemTemplateId)).size !== offer.inputs.length)
      throw new Error(`Service ${offer.id}: duplicate inputs`);
    for (const i of [...offer.inputs, ...(offer.output ? [offer.output] : [])]) {
      const t = raw.itemTemplates.find((t) => t.id === i.itemTemplateId);
      if (!t || i.quantity > t.maxStack)
        throw new Error(`Service ${offer.id}: invalid item/quantity`);
    }
    if (
      (offer.kind === 'sell' && (offer.output || !offer.inputs.length || offer.copper <= 0)) ||
      (offer.kind === 'buy' && (!offer.output || offer.inputs.length || offer.copper >= 0)) ||
      (offer.kind === 'craft' && (!offer.output || !offer.inputs.length || offer.copper > 0))
    )
      throw new Error(`Service ${offer.id}: invalid exchange`);
  }
  for (const entry of raw.dungeonEntries ?? []) {
    const location = raw.worldCatalog?.locations.find((l) => l.id === entry.locationId);
    if (
      location?.kind !== 'dungeon' ||
      !entry.enemyIds.every(
        (id) =>
          raw.enemies.some((e) => e.id === id) &&
          raw.chunks.some(
            (c) => c.zoneId === location.zoneId && c.spawnPoints.some((s) => s.refId === id),
          ),
      )
    )
      throw new Error(`Dungeon ${entry.id}: invalid entrance/encounter`);
  }
  GameData.load(raw); // All legacy and new links, collision/spawn safety, rewards and prerequisites.
  return raw;
}
