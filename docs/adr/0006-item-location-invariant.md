# 0006 — Single-row item location (no item in two places)

Status: Accepted · Date: 2026-10-03

## Context

Hard requirement: an item may never simultaneously be in inventory, vault, equipped, in a trade or
on the marketplace. A design with separate `inventory_slots`, `equipment`, `vault_items` tables
holding item IDs cannot enforce this across tables in PostgreSQL.

## Decision

The location of an item is a set of columns **on its own `item_instances` row**:
`location_kind ∈ {container, equipped, marketplace_escrow, trade_escrow, destroyed}` plus the
columns for that kind. Enforced by:

1. A CHECK constraint: exactly the columns of the current kind are non-null.
2. Partial unique indexes: one item per `(container_id, slot_index)`, per `(equip_character_id,
equip_slot)`, per escrow `listing_id`.
3. Domain code that changes location only inside transactions holding `FOR UPDATE` locks.

All slot-based stores (backpack, material pouch, character vault, shared account vault, guild
vault) are rows in one `containers` table distinguished by `kind`. The requested `inventories`,
`inventory_slots`, `equipment`, `vaults`, `vault_items` concepts map onto `containers` + item
location columns (see docs/architecture/database.md).

## Alternatives considered

Separate tables per store (cross-table uniqueness impossible without triggers); an
`item_locations` table with a unique `item_id` (equivalent but adds a join to every query).

## Consequences

Duplication by "being in two places" is structurally impossible. Equip swaps use a scratch slot
inside one transaction (`__swap__`). Item rows are never deleted (provenance); consumed items move
to `destroyed`.
