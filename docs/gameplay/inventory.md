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

## In-game UI (browser client)

React overlay ([ADR 0013](../adr/0013-react-game-ui.md)), code in `apps/game-web/src/ui`:

| Window    | Key   | Contents                                                                                                                                              |
| --------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bag       | B / I | Backpack and Materials tabs as fixed-capacity slot grids, wallet                                                                                      |
| Character | C     | Equipment paper-doll built from the game-data slot list, effective stats with `(+N gear)` and change highlighting (server-computed `character.stats`) |
| Bank      | V     | Personal vault / Shared vault tabs + the backpack, wallet                                                                                             |

- Slot: icon placeholder (initials on a category colour, rarity-coloured border), stack count,
  `E` marker for equipped items.
- Tooltip (hover on desktop, details sheet on tap): name in rarity colour, rarity, binding, type
  and slot, item level, weapon damage/speed, stats (bonus stats highlighted), modifiers, sockets,
  durability, requirements evaluated for the viewer (unmet in red), description, sell value, and a
  comparison block with per-stat deltas against the item it would replace (or "slot is empty").
- Actions (details sheet): Equip, Unequip, To vault, To shared vault, Retrieve. Each is an HTTP
  request to the existing `moveItem` endpoint with the item's `version`; nothing changes locally
  until the server accepts it. The response is applied immediately; the change feed confirms it.
- Equip target: first empty accepting slot (rings/trinkets fill slot 1 then 2), else swap the
  first; one-handed weapons always target the main hand (dual wield is not designed yet).
- Placeholder rules: the bank opens anywhere (no banker proximity check); no drag-and-drop; no
  sorting/search UI; icons are initials until real icons exist.

## Not implemented (planned)

| Feature                      | Plan                                                                                                                  |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Sorting / search / filtering | `InventoryQuerySchema` + `filterItems()` in `@mmo/ui` exist for client-side use; server-side sort (re-slotting) later |
| Stack split / manual merge   | `stack_split` acquisition method + history event reserved                                                             |
| Quick sell / vendor          | needs vendor NPCs; must respect `locked`                                                                              |
| Item comparison              | client-side using `itemTotalStats()`                                                                                  |
| Loadouts                     | saved sets of `(slotId → itemInstanceId)` applied via batched equip                                                   |
| Bags                         | template category `container` reserved                                                                                |
