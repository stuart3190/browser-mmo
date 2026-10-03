# 0007 — Stackable items are instances with a quantity

Status: Accepted · Date: 2026-10-03 · Resolves the open question in DECISIONS.md

## Context

Materials and consumables stack. The template/instance split must still hold, provenance must
still be recorded, and dedupe keys must still work.

## Decision

A stack is one `item_instances` row with `quantity` (≤ template `maxStack`). On acquisition the
server **always inserts a new row** for the grant, then merges into compatible stacks (same
template, rarity and binding) in the same container. If fully merged, the new row is stored with
location `destroyed / stack_merged` and a `stack_merged` history event naming the target stacks.

## Alternatives considered

Template ID + count per container (loses per-acquisition provenance and dedupe); never merging
(unusable inventories).

## Consequences

Every acquisition has a row and an immutable ID, so `source_ref` dedupe works for stackables too.
Cost: extra rows for high-volume materials; archiving/partitioning of `destroyed` rows will be
needed eventually. Splitting stacks (`stack_split`) is modelled but not implemented.
