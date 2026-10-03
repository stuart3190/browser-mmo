import type { GameData } from '@mmo/game-data';
import type { CurrencyDefinition, Item, ItemLocation } from '@mmo/schemas';

/**
 * Presentation helpers. Everything is derived from game data (rarity colours, names, currency
 * divisors) so no client hard-codes balance or style tables.
 */

export function rarityColor(gameData: GameData, rarityId: string): string {
  return gameData.rarities.get(rarityId)?.color ?? '#ffffff';
}

export function itemLabel(item: Item): string {
  return item.instance.quantity > 1
    ? `${item.template.name} ×${item.instance.quantity}`
    : item.template.name;
}

/** Formats a minor-unit amount, e.g. gold 12345 copper -> "1g 23s 45c". */
export function formatCurrency(def: CurrencyDefinition, amount: number): string {
  if (def.displayDivisor === 1) return `${amount.toLocaleString('en-GB')} ${def.name}`;
  const d = def.displayDivisor;
  const gold = Math.floor(amount / (d * d));
  const silver = Math.floor(amount / d) % d;
  const copper = amount % d;
  return [gold ? `${gold}g` : '', silver ? `${silver}s` : '', `${copper}c`]
    .filter(Boolean)
    .join(' ');
}

export function describeLocation(loc: ItemLocation): string {
  switch (loc.kind) {
    case 'container':
      return `${loc.containerKind.replace('_', ' ')} slot ${loc.slot + 1}`;
    case 'equipped':
      return `equipped (${loc.slotId})`;
    case 'marketplace_escrow':
      return 'listed on marketplace';
    case 'trade_escrow':
      return 'in a trade';
    case 'destroyed':
      return `destroyed (${loc.reason})`;
  }
}

/** Client-side inventory search/filter/sort (presentation only; server remains authoritative). */
export function filterItems(
  items: Item[],
  q: { search?: string; rarityIds?: string[]; onlyFavourites?: boolean; onlyJunk?: boolean },
): Item[] {
  const s = q.search?.trim().toLowerCase();
  return items.filter(
    (i) =>
      (!s || i.template.name.toLowerCase().includes(s)) &&
      (!q.rarityIds?.length || q.rarityIds.includes(i.instance.rarityId)) &&
      (!q.onlyFavourites || i.instance.flags.favourite) &&
      (!q.onlyJunk || i.instance.flags.junk),
  );
}
