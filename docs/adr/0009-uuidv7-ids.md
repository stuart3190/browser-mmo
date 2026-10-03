# 0009 — UUIDv7 identifiers

Status: Accepted · Date: 2026-10-03

## Decision

All persistent IDs are UUIDs generated in application code with UUIDv7 (time-ordered, RFC 9562),
including item instance IDs. Content (templates, classes, zones) uses stable human-readable slugs.

## Why

Item instances and history will reach millions/billions of rows; random UUIDv4 keys fragment
B-tree indexes. UUIDv7 keeps inserts append-mostly while staying globally unique, unguessable
enough for URLs, and mintable before insert (useful for correlation IDs inside a transaction).

## Consequences

IDs leak creation time (acceptable). Clients never mint authoritative IDs.
