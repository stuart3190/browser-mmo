# Marketplace & trading

Code: `packages/domain/src/marketplace.ts`, rules `packages/game-data/src/rules/marketplace.ts`,
tunables `marketplaceRules` in `packages/game-data/src/content/economy.ts`, API
`services/api/src/routes/marketplace.ts`.

## Implemented (server + tests; no game UI yet)

| Operation  | Behaviour                                                                                                                                                                                                                                                                                                                                              |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **List**   | Item must be owned, in one of the character's containers, unlocked, template `marketplaceAllowed`, currently unbound. Price ≥ `minPrice`, duration from `listingDurationsHours`, under `maxActiveListingsPerAccount`. Listing fee (deposit) = max(`minListingFee`, price × `listingFeeBps`) is debited. Item moves to `marketplace_escrow`.            |
| **Cancel** | Seller only, active only. Item returns to seller's default container (fails with `CONTAINER_FULL` if no space). Fee not refunded.                                                                                                                                                                                                                      |
| **Buy**    | Listing locked first; must be active and unexpired; buyer ≠ seller account; `expectedPrice` must equal price. Buyer pays price; seller receives price − sale fee (`saleFeeBps`, a currency sink). Item ownership + location move to buyer. One `marketplace_transactions` row (unique per listing). History `sold` + audit row share a correlation ID. |
| **Expire** | `expireListings()` sweep (runs every 60 s in the API process): returns items, status `expired`. If the seller's bag is full the listing stays for the next sweep (already unbuyable).                                                                                                                                                                  |
| **Browse** | Active, unexpired listings, optionally by template, cheapest first.                                                                                                                                                                                                                                                                                    |

All of the above are single transactions. Tested: escrow + fee, cancel, atomic purchase with fees
and history, own-listing/price-mismatch/insufficient-funds rejection with no side effects,
**5 concurrent buyers → exactly 1 succeeds**, locked/bound/quest items refused, expiry.

## Not implemented yet

- Player-to-player trade (model `Trade` with offer `revision`, `trade_escrow` location reserved).
  Design: both items and currency go into escrow when offers lock; acceptance binds to a revision;
  completion swaps everything in one transaction.
- Partial stack purchases, buy orders, bids, price history, search by stats.
- Mailbox for returns when bags are full.
- Fraud signals (rapid flips, below-market transfers between linked accounts) — the audit log and
  transaction tables are the data source for this.

## Multi-instance note

The expiry sweep assumes one API process. With replicas it must move to a single worker or use
`FOR UPDATE SKIP LOCKED` batches (the per-listing lock already makes concurrent sweeps safe, just
wasteful).
