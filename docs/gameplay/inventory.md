# Inventory & storage

Code: `packages/domain/src/{containers,items}.ts`, schemas `packages/schemas/src/storage.ts`.

## Stores

| Store                | Container kind                 | Owner     | Default capacity     | Notes                                                                                                                                     |
| -------------------- | ------------------------------ | --------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Equipped gear        | — (`location_kind = equipped`) | character | 16 slots (game data) | not a container                                                                                                                           |
| Backpack             | `backpack`                     | character | 24                   | default for non-materials                                                                                                                 |
| Material pouch       | `material_pouch`               | character | 40                   | only `goesToMaterialPouch` templates                                                                                                      |
| Personal vault       | `character_vault`              | character | 48                   | template `vaultAllowed`                                                                                                                   |
| Shared account vault | `account_vault`                | account   | 48                   | `accountVaultAllowed` and not character-bound; items here have `owner_character_id = NULL` and any character of the account can take them |
| Guild vault          | `guild_vault`                  | guild     | —                    | placeholder: kind + DB constraint exist; no guilds, all access denied                                                                     |

Capacity lives on the container row, so **inventory expansion / bag upgrades** = raising
`capacity` server-side (max 1000 by CHECK).

## Operations (implemented, server-side)

`moveItem` handles every move between stores plus equip/unequip/swap, with: ownership checks
(account and per-character containers), placement rules, explicit or first-free slot,
`expectedVersion` optimistic concurrency, binding rules. Item flags `locked`, `favourite`, `junk`
via `setItemFlags`; `locked` blocks marketplace listing (and future vendor/destroy).

Stacking is applied on acquisition ([ADR 0007](../adr/0007-stackable-items.md)).

## Not implemented (planned)

| Feature                      | Plan                                                                                                                  |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Sorting / search / filtering | `InventoryQuerySchema` + `filterItems()` in `@mmo/ui` exist for client-side use; server-side sort (re-slotting) later |
| Stack split / manual merge   | `stack_split` acquisition method + history event reserved                                                             |
| Quick sell / vendor          | needs vendor NPCs; must respect `locked`                                                                              |
| Item comparison              | client-side using `itemTotalStats()`                                                                                  |
| Loadouts                     | saved sets of `(slotId → itemInstanceId)` applied via batched equip                                                   |
| Bags                         | template category `container` reserved                                                                                |
| Inventory UI                 | HUD shows a read-only list; real UI framework decision pending                                                        |
