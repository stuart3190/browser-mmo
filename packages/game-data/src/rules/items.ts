import type {
  ContainerKind,
  ItemBindingState,
  ItemDurability,
  ItemModifier,
  ItemModifierDefinition,
  ItemRarityDefinition,
  ItemSocket,
  ItemTemplate,
  StatBlock,
  StatKey,
} from '@mmo/schemas';
import type { Rng } from './random';
import { randomInt } from './random';
import { addStats } from './stats';

/** The rolled, per-instance properties of a newly created item. */
export interface RolledItemProperties {
  rarityId: string;
  stats: StatBlock;
  modifiers: ItemModifier[];
  sockets: ItemSocket[];
  durability: ItemDurability | null;
}

/**
 * Rolls instance properties from a template and a rarity definition. SERVER-ONLY in practice:
 * clients may import it for tooltips/previews but their output is never trusted.
 */
export function rollItemProperties(
  template: ItemTemplate,
  rarity: ItemRarityDefinition,
  modifierPool: readonly ItemModifierDefinition[],
  rng: Rng,
): RolledItemProperties {
  const eq = template.equipment;
  if (!eq) {
    return { rarityId: rarity.id, stats: {}, modifiers: [], sockets: [], durability: null };
  }

  const stats: StatBlock = {};
  for (const [key, range] of Object.entries(eq.baseStats) as [
    StatKey,
    { min: number; max: number },
  ][]) {
    stats[key] = Math.round(randomInt(rng, range.min, range.max) * rarity.statMultiplier);
  }

  const category = template.category as 'weapon' | 'armor' | 'accessory';
  const pool = modifierPool.filter((m) => m.allowedCategories.includes(category));
  const modifierCount = Math.min(
    pool.length,
    randomInt(rng, rarity.modifierCount.min, rarity.modifierCount.max),
  );
  const remaining = [...pool];
  const modifiers: ItemModifier[] = [];
  for (let i = 0; i < modifierCount; i++) {
    const idx = Math.floor(rng.next() * remaining.length);
    const def = remaining.splice(idx, 1)[0]!;
    modifiers.push({
      modifierId: def.id,
      stat: def.stat,
      value: randomInt(rng, def.range.min, def.range.max),
    });
  }

  const socketCount = randomInt(rng, rarity.socketCount.min, rarity.socketCount.max);
  const colors = ['red', 'blue', 'yellow'] as const;
  const sockets: ItemSocket[] = Array.from({ length: socketCount }, () => ({
    color: colors[Math.floor(rng.next() * colors.length)]!,
    gemItemInstanceId: null,
  }));

  const durability = eq.maxDurability ? { current: eq.maxDurability, max: eq.maxDurability } : null;
  return { rarityId: rarity.id, stats, modifiers, sockets, durability };
}

/** Total stats an instance contributes when equipped. */
export function itemTotalStats(item: {
  stats: StatBlock;
  modifiers: ItemModifier[];
  enchantments: { stats: StatBlock }[];
}): StatBlock {
  const modStats: StatBlock = {};
  for (const m of item.modifiers) modStats[m.stat] = (modStats[m.stat] ?? 0) + m.value;
  return addStats(item.stats, modStats, ...item.enchantments.map((e) => e.stats));
}

/** Which personal container a newly acquired item goes to by default. */
export function defaultContainerKindFor(template: ItemTemplate): ContainerKind {
  return template.goesToMaterialPouch ? 'material_pouch' : 'backpack';
}

/** Can an item of this template ever be placed in a container of this kind? */
export function canPlaceInContainerKind(
  template: ItemTemplate,
  binding: ItemBindingState,
  kind: ContainerKind,
):
  | { ok: true }
  | { ok: false; reason: 'ITEM_NOT_VAULTABLE' | 'ITEM_BOUND' | 'CONTAINER_KIND_MISMATCH' } {
  switch (kind) {
    case 'backpack':
      return { ok: true };
    case 'material_pouch':
      return template.goesToMaterialPouch
        ? { ok: true }
        : { ok: false, reason: 'CONTAINER_KIND_MISMATCH' };
    case 'character_vault':
      return template.vaultAllowed ? { ok: true } : { ok: false, reason: 'ITEM_NOT_VAULTABLE' };
    case 'account_vault':
      if (!template.accountVaultAllowed) return { ok: false, reason: 'ITEM_NOT_VAULTABLE' };
      // Character-bound items cannot leave that character's personal storage.
      if (binding.kind === 'character') return { ok: false, reason: 'ITEM_BOUND' };
      return { ok: true };
    case 'guild_vault':
      if (!template.tradeable || binding.kind !== 'unbound')
        return { ok: false, reason: 'ITEM_BOUND' };
      return { ok: true };
  }
}

/** Initial binding state when an item is acquired. */
export function bindingOnAcquire(
  template: ItemTemplate,
  owner: { accountId: string; characterId: string },
  nowIso: string,
): ItemBindingState {
  if (template.binding === 'on_pickup')
    return { kind: 'character', characterId: owner.characterId, boundAt: nowIso };
  if (template.binding === 'account')
    return { kind: 'account', accountId: owner.accountId, boundAt: nowIso };
  return { kind: 'unbound' };
}

/** Is this instance tradeable right now (template rule + binding state)? */
export function isCurrentlyTradeable(template: ItemTemplate, binding: ItemBindingState): boolean {
  return template.tradeable && binding.kind === 'unbound';
}
