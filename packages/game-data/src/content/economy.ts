import type { CurrencyDefinition, ExperienceCurve, MarketplaceRules } from '@mmo/schemas';

export const currencies: CurrencyDefinition[] = [
  // Stored in copper. 100 copper = 1 silver, 100 silver = 1 gold (display only).
  {
    id: 'gold',
    name: 'Gold',
    scope: 'character',
    maxBalance: 9_999_999_999,
    tradeable: true,
    displayDivisor: 100,
  },
  // Example non-tradeable account-wide currency (e.g. earned from achievements). Placeholder.
  {
    id: 'renown',
    name: 'Renown',
    scope: 'account',
    maxBalance: 1_000_000,
    tradeable: false,
    displayDivisor: 1,
  },
];

export const PRIMARY_CURRENCY_ID = 'gold';

export const marketplaceRules: MarketplaceRules = {
  currencyId: 'gold',
  listingDurationsHours: [12, 24, 48],
  listingFeeBps: 100, // 1% deposit
  minListingFee: 10,
  saleFeeBps: 500, // 5% cut (currency sink)
  maxActiveListingsPerAccount: 50,
  minPrice: 1,
};

/** Placeholder curve: xpToNext(level) = round(400 * level^1.6). Not tuned. */
export const experienceCurve: ExperienceCurve = { maxLevel: 60, base: 400, exponent: 1.6 };
