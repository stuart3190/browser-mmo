# 0014 — PostgreSQL LISTEN/NOTIFY change feed for realtime pushes

Status: Accepted · Date: 2026-10-03 · Partially addresses ADR 0011 (Redis deferred)

## Context

Item and wallet changes made through the HTTP API, admin tools or background jobs were not pushed
to connected game clients. ADR 0011 anticipated Redis pub/sub for this.

## Decision

Use **PostgreSQL LISTEN/NOTIFY** on channel `mmo_changes`, published by **triggers**
(migration `0001_change_feed_triggers.sql`) on `item_instances` and `currency_balances`.

- Payloads carry IDs only (`{k:'item', i, a, pa}` / `{k:'wallet', a}`); the realtime service
  re-reads authoritative rows and pushes `inventory.updated` (+ `removed` tombstones),
  `character.stats` and `wallet.updated` to every affected connection.
- NOTIFY is transactional: rolled-back changes are never announced.
- Triggers mean no write path can forget to notify.
- NOTIFY is not durable: after every (re)connect of the listener the realtime service resends full
  snapshots to all clients. Clients reconcile by item `version`, so duplicates/out-of-order
  delivery are harmless.

## Alternatives considered

- Redis pub/sub: extra infrastructure; not transactional with the DB write (needs an outbox).
- Explicit notify calls in each domain function: easy to forget in new code paths.
- Transactional outbox table + poller: durable, but more moving parts than needed today.

## Consequences

No new infrastructure. Works with several API processes and several realtime processes (each
listener gets every event). Limits: payload ≤ 8 KB (IDs only), one notification per row change
(fan-out cost grows with write volume; coalesced per 25 ms in the realtime service), and
PgBouncer in transaction mode cannot carry LISTEN (the listener needs a direct connection).
Revisit (outbox + Redis/stream) when write volume or cross-region needs demand it.
