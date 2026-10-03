# Item system

Code: schemas `packages/schemas/src/items.ts`, content `packages/game-data/src/content/items.ts`,
rules `packages/game-data/src/rules/items.ts`, persistence `packages/domain/src/items.ts`.

## Template vs instance

|          | **ItemTemplate** (content)                                                                                                                                                                                                                                                                                             | **ItemInstance** (state)                                                                                                                                                                                                                                                                                           |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Example  | "Iron Longsword"                                                                                                                                                                                                                                                                                                       | Iron Longsword `01a103be-ab18-…` owned by Alice, 80/80 durability, +3 Str                                                                                                                                                                                                                                          |
| ID       | stable slug `weapon.sword.iron_longsword`                                                                                                                                                                                                                                                                              | UUIDv7, globally unique, immutable                                                                                                                                                                                                                                                                                 |
| Lives in | `@mmo/game-data` (mirrored to `item_templates`)                                                                                                                                                                                                                                                                        | `item_instances`                                                                                                                                                                                                                                                                                                   |
| Holds    | name, category, default rarity, item level, required level, class restrictions, binding rule, max stack, tradeable / marketplace / vault / account-vault eligibility, vendor value, icon/model refs, equipment block (slot type, equipment type, stat ranges, durability, weapon damage), consumable block, quest link | template id, rolled rarity, quantity, ownership (owner account/character, original owner, crafter), acquisition (method, source ref), location, binding state, rolled stats, modifiers, sockets, enchantments, durability, appearance, flags (locked/favourite/junk), dormant external fields, version, timestamps |

"Item" in APIs means the pair `{ instance, template }`.

## Lifecycle

1. **Minted** only by `grantItemInTx` (world pickup, loot, quest, craft, admin grant, seed). Rolls
   rarity-scaled stats/modifiers/sockets with a server RNG, sets binding, places it, writes
   `created` history. Optional `sourceRef` makes the acquisition idempotent.
2. **Moves** via `moveItem` (containers, equip/unequip/swap), marketplace escrow, (later) trade escrow.
3. **Never deleted.** Consumed/merged/revoked items move to `destroyed` with a reason.

## Rarity (data-driven)

Defined in `content/rarities.ts`: `common, uncommon, rare, epic, legendary, mythic`, each with
tier (ordering only), colour, modifier count range, stat multiplier, socket range, drop weight,
announce flag. Code reads these fields; it never branches on a rarity ID.

## Stats, modifiers, sockets, enchantments, durability

- Stat keys: `StatKeySchema` (primary, defensive, offensive, resources, utility). Adding keys is safe.
- Base stats roll inside template ranges × rarity multiplier. Modifiers come from the
  `itemModifiers` pool filtered by category. Sockets get a colour; gems will be item instances.
- Enchantments carry their own stat block and who applied them.
- `itemTotalStats()` sums stats + modifiers + enchantments for equipment stat application.
- Durability `{current,max}` exists; nothing reduces it yet.

## Binding

Template rule `none | on_pickup | on_equip | account`; instance state
`unbound | character(id) | account(id)`. Bound-to-character items cannot enter the shared account
vault, guild vault, trades or the marketplace. `on_equip` binds inside the equip transaction.

## Equipment

16 slots defined in game data (`head` … `ranged`, `ring_1/2`, `trinket_1/2`). Slots declare which
**slot types** they accept, so new slots are data-only additions. Equip validation
(`checkCanEquip`): slot accepts type, level, class restriction, class proficiency for the
equipment type, two-hand vs off-hand. Swaps are atomic.

Equipment types: sword, axe, mace, dagger, staff, wand, bow, crossbow, shield, plate, mail, leather,
cloth, ring, necklace, trinket, cloak.

## Stacking

See [ADR 0007](../adr/0007-stackable-items.md). Materials go to the material pouch; compatible
stacks (same template, rarity, binding) merge up to `maxStack`.

## Provenance

`item_history` records `created`, `moved`, `equipped`, `unequipped`, `bound`, `stack_merged`,
`listed`, `listing_cancelled`, `listing_expired`, `sold`, `admin_granted`, `admin_revoked` (and
reserved: `traded`, `stack_split`, `modified`, `destroyed`), with actor, owners, from/to location,
correlation ID (ties both sides of a sale) and request ID.

## Dormant external ownership

`externalOwnershipEnabled=false`, `externalAssetId=null`, `externalNetwork=null` on every instance.
They have **no gameplay effect**, are never shown in UI, and the schema + a DB CHECK reject any
other value. The database is the source of truth for ownership. Enabling them requires a new
recorded decision from the project owner.

## Categories that are templates only (no systems yet)

Consumables (no use action), materials (no crafting), quest items (no quests), mounts/pets/cosmetics
(collection definitions exist in schemas; no unlock flow).
