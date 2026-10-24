# Populated upgrade and restore — 2026-10-24

Hosted CI run 40083438334 passed format/lint/types/unit/integration, then failed backup/restore.
Local reproduction confirmed the old fixture removed migration 0006 while applying later SQL that
references `zone_checkpoints`. No production system was involved.

The fixed fixture applies the actual 0000–0005 prefix, seeds seven legacy tables using their fixed
historical columns, then applies all remaining migrations. Existing field values (not merely counts)
remain equal for account, character, container, item, item history, wallet and ledger rows. Current
domain fixtures run only after upgrading. Backup/restore then deep-compares 13 durable tables,
including completed and pending direct trades, verifies escrow/ledger/constraints and session
revocation, and rejects a second restore into the occupied target. All pass on PostgreSQL 17.
Script typecheck, lint and runner syntax pass. Hosted CI rerun remains pending.

Artifacts here contain proof metadata only. Disposable database dumps/password/session hashes remain
outside the repository. The exercise only drops randomly named databases it successfully created.
The full isolated qualification runner now includes this exercise and asset/content validation.
