import { z } from 'zod';
import {
  AbilityDefinitionSchema,
  CombatRulesSchema,
  CharacterClassSchema,
  CharacterSpecialisationSchema,
  CurrencyDefinitionSchema,
  DungeonDefinitionSchema,
  EnemyDefinitionSchema,
  EquipmentSlotDefinitionSchema,
  EquipmentTypeDefinitionSchema,
  ExperienceCurveSchema,
  ItemModifierDefinitionSchema,
  ItemRarityDefinitionSchema,
  ItemTemplateSchema,
  LootTableSchema,
  MarketplaceRulesSchema,
  NpcDefinitionSchema,
  QuestDefinitionSchema,
  SkillDefinitionSchema,
  WorldChunkSchema,
  WorldRegionSchema,
  WorldZoneSchema,
} from '@mmo/schemas';
import type {
  AbilityDefinition,
  CharacterClass,
  CharacterSpecialisation,
  CurrencyDefinition,
  EnemyDefinition,
  EquipmentSlotDefinition,
  EquipmentTypeDefinition,
  ItemRarityDefinition,
  ItemTemplate,
  LootTable,
  NpcDefinition,
  WorldChunk,
  WorldRegion,
  WorldZone,
} from '@mmo/schemas';
import { chunkKey } from './rules/world';

export const RawGameDataSchema = z.object({
  rarities: z.array(ItemRarityDefinitionSchema),
  equipmentSlots: z.array(EquipmentSlotDefinitionSchema),
  equipmentTypes: z.array(EquipmentTypeDefinitionSchema),
  currencies: z.array(CurrencyDefinitionSchema),
  marketplaceRules: MarketplaceRulesSchema,
  experienceCurve: ExperienceCurveSchema,
  combatRules: CombatRulesSchema,
  abilities: z.array(AbilityDefinitionSchema),
  specialisations: z.array(CharacterSpecialisationSchema),
  classes: z.array(CharacterClassSchema),
  skills: z.array(SkillDefinitionSchema),
  itemTemplates: z.array(ItemTemplateSchema),
  itemModifiers: z.array(ItemModifierDefinitionSchema),
  lootTables: z.array(LootTableSchema),
  regions: z.array(WorldRegionSchema),
  zones: z.array(WorldZoneSchema),
  chunks: z.array(WorldChunkSchema),
  npcs: z.array(NpcDefinitionSchema),
  enemies: z.array(EnemyDefinitionSchema),
  quests: z.array(QuestDefinitionSchema),
  dungeons: z.array(DungeonDefinitionSchema),
});
export type RawGameData = z.input<typeof RawGameDataSchema>;
export type ParsedGameData = z.output<typeof RawGameDataSchema>;

function indexById<T extends { id: string }>(
  kind: string,
  list: T[],
  errors: string[],
): Map<string, T> {
  const map = new Map<string, T>();
  for (const item of list) {
    if (map.has(item.id)) errors.push(`duplicate ${kind} id "${item.id}"`);
    map.set(item.id, item);
  }
  return map;
}

/** Validated, indexed, read-only game data. Built once at startup on both server and client. */
export class GameData {
  readonly raw: ParsedGameData;
  readonly rarities: ReadonlyMap<string, ItemRarityDefinition>;
  readonly equipmentSlots: ReadonlyMap<string, EquipmentSlotDefinition>;
  readonly equipmentTypes: ReadonlyMap<string, EquipmentTypeDefinition>;
  readonly currencies: ReadonlyMap<string, CurrencyDefinition>;
  readonly abilities: ReadonlyMap<string, AbilityDefinition>;
  readonly specialisations: ReadonlyMap<string, CharacterSpecialisation>;
  readonly classes: ReadonlyMap<string, CharacterClass>;
  readonly itemTemplates: ReadonlyMap<string, ItemTemplate>;
  readonly lootTables: ReadonlyMap<string, LootTable>;
  readonly regions: ReadonlyMap<string, WorldRegion>;
  readonly zones: ReadonlyMap<string, WorldZone>;
  readonly npcs: ReadonlyMap<string, NpcDefinition>;
  readonly enemies: ReadonlyMap<string, EnemyDefinition>;
  /** key: `${zoneId}|${cx},${cz}` */
  readonly chunks: ReadonlyMap<string, WorldChunk>;

  private constructor(raw: ParsedGameData, errors: string[]) {
    this.raw = raw;
    this.rarities = indexById('rarity', raw.rarities, errors);
    this.equipmentSlots = indexById('equipment slot', raw.equipmentSlots, errors);
    this.equipmentTypes = indexById('equipment type', raw.equipmentTypes, errors);
    this.currencies = indexById('currency', raw.currencies, errors);
    this.abilities = indexById('ability', raw.abilities, errors);
    this.specialisations = indexById('specialisation', raw.specialisations, errors);
    this.classes = indexById('class', raw.classes, errors);
    this.itemTemplates = indexById('item template', raw.itemTemplates, errors);
    this.lootTables = indexById('loot table', raw.lootTables, errors);
    this.regions = indexById('region', raw.regions, errors);
    this.zones = indexById('zone', raw.zones, errors);
    this.npcs = indexById('npc', raw.npcs, errors);
    this.enemies = indexById('enemy', raw.enemies, errors);
    const chunks = new Map<string, WorldChunk>();
    for (const c of raw.chunks) {
      const key = `${c.zoneId}|${chunkKey(c.coord)}`;
      if (chunks.has(key)) errors.push(`duplicate chunk ${key}`);
      chunks.set(key, c);
    }
    this.chunks = chunks;
  }

  /** Parses and cross-validates content. Throws with every problem listed if anything is wrong. */
  static load(input: RawGameData): GameData {
    const raw = RawGameDataSchema.parse(input);
    const errors: string[] = [];
    const gd = new GameData(raw, errors);
    gd.crossValidate(errors);
    if (errors.length > 0) {
      throw new Error(`Invalid game data:\n  - ${errors.join('\n  - ')}`);
    }
    return gd;
  }

  private crossValidate(errors: string[]): void {
    const need = (map: ReadonlyMap<string, unknown>, id: string, ctx: string) => {
      if (!map.has(id)) errors.push(`${ctx} references unknown id "${id}"`);
    };
    for (const t of this.raw.itemTemplates) {
      need(this.rarities, t.rarityId, `item ${t.id}.rarityId`);
      t.allowedClassIds.forEach((c) => need(this.classes, c, `item ${t.id}.allowedClassIds`));
      if (t.equipment)
        need(this.equipmentTypes, t.equipment.equipmentTypeId, `item ${t.id}.equipment`);
      if (
        t.equipment &&
        !this.raw.equipmentSlots.some((s) => s.accepts.includes(t.equipment!.slotType))
      ) {
        errors.push(`item ${t.id} slotType ${t.equipment.slotType} fits no equipment slot`);
      }
    }
    for (const c of this.raw.classes) {
      c.specialisationIds.forEach((s) => need(this.specialisations, s, `class ${c.id}`));
      c.baseAbilityIds.forEach((a) => need(this.abilities, a, `class ${c.id}`));
      [...c.armorProficiencies, ...c.weaponProficiencies].forEach((p) =>
        need(this.equipmentTypes, p, `class ${c.id} proficiency`),
      );
    }
    for (const s of this.raw.specialisations) {
      need(this.classes, s.classId, `spec ${s.id}`);
      s.abilityIds.forEach((a) => need(this.abilities, a, `spec ${s.id}`));
    }
    for (const lt of this.raw.lootTables) {
      lt.entries.forEach((e) => {
        need(this.itemTemplates, e.itemTemplateId, `loot ${lt.id}`);
        if (e.rarityId) need(this.rarities, e.rarityId, `loot ${lt.id}`);
      });
      if (lt.currency) need(this.currencies, lt.currency.currencyId, `loot ${lt.id}`);
    }
    for (const r of this.raw.regions)
      r.zoneIds.forEach((z) => need(this.zones, z, `region ${r.id}`));
    for (const z of this.raw.zones) {
      need(this.regions, z.regionId, `zone ${z.id}`);
      z.transitions.forEach((t) =>
        need(this.zones, t.targetZoneId, `zone ${z.id} transition ${t.id}`),
      );
    }
    for (const c of this.raw.chunks) {
      const zone = this.zones.get(c.zoneId);
      if (!zone) {
        errors.push(`chunk ${chunkKey(c.coord)} references unknown zone ${c.zoneId}`);
        continue;
      }
      const { minCx, maxCx, minCz, maxCz } = zone.bounds;
      if (c.coord.cx < minCx || c.coord.cx > maxCx || c.coord.cz < minCz || c.coord.cz > maxCz) {
        errors.push(`chunk ${chunkKey(c.coord)} is outside zone ${zone.id} bounds`);
      }
      for (const sp of c.spawnPoints) {
        const ref =
          sp.kind === 'npc' ? this.npcs : sp.kind === 'enemy' ? this.enemies : this.itemTemplates;
        need(ref, sp.refId, `spawn ${sp.id}`);
        const cx = Math.floor(sp.position.x / zone.chunkSize);
        const cz = Math.floor(sp.position.z / zone.chunkSize);
        if (cx !== c.coord.cx || cz !== c.coord.cz)
          errors.push(`spawn ${sp.id} lies outside its chunk`);
        if (sp.kind === 'pickup') {
          const t = this.itemTemplates.get(sp.refId);
          if (t && sp.quantity > t.maxStack)
            errors.push(`spawn ${sp.id} quantity exceeds maxStack`);
        }
      }
    }
    for (const e of this.raw.enemies)
      if (e.lootTableId) need(this.lootTables, e.lootTableId, `enemy ${e.id}`);
    need(this.currencies, this.raw.marketplaceRules.currencyId, 'marketplaceRules');
    const spawnIds = this.raw.chunks.flatMap((c) => c.spawnPoints.map((s) => s.id));
    if (new Set(spawnIds).size !== spawnIds.length) errors.push('duplicate spawn point ids');
  }

  /** Lookup helpers that throw — use when the ID came from trusted persisted data. */
  template(id: string): ItemTemplate {
    const t = this.itemTemplates.get(id);
    if (!t) throw new Error(`Unknown item template ${id}`);
    return t;
  }
  rarity(id: string): ItemRarityDefinition {
    const r = this.rarities.get(id);
    if (!r) throw new Error(`Unknown rarity ${id}`);
    return r;
  }
  characterClass(id: string): CharacterClass {
    const c = this.classes.get(id);
    if (!c) throw new Error(`Unknown class ${id}`);
    return c;
  }
  enemy(id: string): EnemyDefinition {
    const e = this.enemies.get(id);
    if (!e) throw new Error(`Unknown enemy ${id}`);
    return e;
  }
  zone(id: string): WorldZone {
    const z = this.zones.get(id);
    if (!z) throw new Error(`Unknown zone ${id}`);
    return z;
  }
  chunksForZone(zoneId: string): WorldChunk[] {
    return this.raw.chunks.filter((c) => c.zoneId === zoneId);
  }
}
