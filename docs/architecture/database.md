# Database

PostgreSQL 16+, Drizzle ORM ([ADR 0003](../adr/0003-postgresql-drizzle.md)). Schema source:
`packages/db/src/schema.ts`. Migrations: `packages/db/migrations/*.sql` (generated, reviewed,
committed, never edited after being applied).

## Tables

| Table                      | Purpose                                                                                                                                         |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `accounts`                 | Player accounts: username (case-insensitive unique), role, status                                                                               |
| `auth_identities`          | One row per login method `(provider, provider_subject)`; future password/OAuth                                                                  |
| `sessions`                 | Opaque bearer sessions (SHA-256 token hash), client kind, expiry, revocation                                                                    |
| `characters`               | Characters: class/spec, level/xp, zone + last validated position, `current_health` (NULL = full)                                                |
| `item_templates`           | Mirror of authored templates (synced from `@mmo/game-data`) for FKs/queries                                                                     |
| `containers`               | Every slot store: `backpack`, `material_pouch`, `character_vault`, `account_vault`, `guild_vault`                                               |
| `item_instances`           | Every concrete item with its single authoritative location                                                                                      |
| `item_history`             | Append-only provenance events per item                                                                                                          |
| `currency_balances`        | Wallets (character- or account-scoped), `amount >= 0`                                                                                           |
| `currency_ledger`          | Append-only record of every balance change                                                                                                      |
| `marketplace_listings`     | Listings (active/sold/cancelled/expired)                                                                                                        |
| `marketplace_transactions` | Completed sales (unique per listing)                                                                                                            |
| `kill_events`              | Write-ahead kill outbox: one row per enemy death (spawn slot, respawn time, credited character, status pending/rewarded/void, attempts/backoff) |
| `kill_rewards`             | One row per (enemy death, rewarded character); its primary key makes XP/loot/gold for a kill exactly-once                                       |
| `audit_log`                | Privileged/economy-sensitive actions with request IDs                                                                                           |

### How the requested tables map

| Requested         | Implemented as                                                                                 | Reason                                              |
| ----------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `inventories`     | `containers` (kinds `backpack`, `material_pouch`)                                              | One table for all slot stores                       |
| `inventory_slots` | `item_instances.(container_id, slot_index)` + unique index                                     | Slots are virtual; an empty slot needs no row       |
| `equipment`       | `item_instances` with `location_kind = 'equipped'` + `(equip_character_id, equip_slot)` unique | Same row, so an item can't be equipped _and_ stored |
| `vaults`          | `containers` (kinds `character_vault`, `account_vault`, `guild_vault`)                         | Same model as bags                                  |
| `vault_items`     | item location columns                                                                          | As above                                            |
| `currencies`      | `currency_balances` (+ `currency_ledger`); definitions live in game data                       | Definitions are content, balances are state         |

This is deliberate ([ADR 0006](../adr/0006-item-location-invariant.md)): with separate tables PostgreSQL
cannot stop the same item ID appearing in two of them.

## The item location invariant

`item_instances.location_kind` ∈ `container | equipped | marketplace_escrow | trade_escrow | destroyed`.

- `item_instances_location_ck` (CHECK): exactly the columns for the current kind are set.
- `item_instances_container_slot_uq` (partial unique): one item per container slot.
- `item_instances_equip_slot_uq` (partial unique): one item per character equipment slot.
- `item_instances_listing_uq` (partial unique): one item per listing escrow.
- `item_instances_source_ref_uq` (unique): one item per acquisition event (e.g. a spawn cycle).
- `item_instances_external_dormant_ck`: dormant external-ownership fields must stay
  `false/NULL/NULL` (no gameplay effect; see DECISIONS.md).
- `marketplace_listings_active_item_uq`: an item can back at most one active listing.
- `marketplace_transactions_listing_uq`: a listing can be sold at most once.
- `currency_balances_nonneg_ck`: no negative balances, ever.

Integration tests write deliberately invalid rows to prove these constraints fire.

## Transactions and locking

All mutations go through `inTransaction` (`packages/domain/src/tx.ts`): READ COMMITTED + explicit
`SELECT … FOR UPDATE`, retried on deadlock/serialization failure. Lock order:

```
marketplace listing → item rows (ascending id) → containers (ascending id) → wallets (ascending id)
```

Containers are locked before slot allocation, which serialises slot assignment per container.
Every item mutation also bumps `version` (optimistic concurrency for clients:
`MoveItemRequest.expectedVersion`).

## Scale notes (millions of item instances)

- UUIDv7 PKs keep inserts append-mostly ([ADR 0009](../adr/0009-uuidv7-ids.md)).
- Hot paths are indexed: owner character/account, template, container slot, history by item.
- Rows are never deleted. Later: partition `item_history` and `currency_ledger` by time; archive
  `destroyed` items (esp. `stack_merged`) to cold storage.
- JSONB holds rolled stats/modifiers/sockets/enchantments (read with the row, rarely queried).
  If marketplace search needs stat filters, add generated columns or a search index.

## Change feed triggers

Migration `0001_change_feed_triggers.sql` adds AFTER INSERT/UPDATE triggers on `item_instances`
and `currency_balances` that `pg_notify('mmo_changes', …)` ID-only payloads on commit
([ADR 0014](../adr/0014-postgres-change-feed.md)). Do not remove them; the realtime service relies
on them to push changes made by any process.

## Seed data

`pnpm db:seed` (`packages/domain/scripts/seed.ts`) is idempotent: syncs templates and creates the
demo accounts if missing, using the real domain functions (so seeded data obeys every rule).
