import type { MarketplaceRules } from '@mmo/schemas';

export function listingFee(rules: MarketplaceRules, price: number): number {
  return Math.max(rules.minListingFee, Math.floor((price * rules.listingFeeBps) / 10_000));
}

export function saleFee(rules: MarketplaceRules, price: number): number {
  return Math.floor((price * rules.saleFeeBps) / 10_000);
}
