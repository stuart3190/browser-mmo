# Persistent friends and messages — 2026-10-24

Verified by Codex against isolated development/test PostgreSQL; production unchanged.

- Eight real-database domain cases pass: mutual consent, cross-account ownership, canonical pairs,
  concurrent retries, persisted rate bounds, recipient-only read state, block/send serialization,
  pagination/tied timestamps/private cursors, concurrent request caps, accepted/block caps and
  removal of banned contacts. One authenticated HTTP acceptance/privacy case passes.
- Twelve two-player browser assertions pass (proof.json), including request/accept, literal text,
  bidirectional messages/read receipts, fresh-login persistence, block/unblock/new consent,
  portrait and landscape controls and reachable desktop journal. Zero browser exceptions.
  All three screenshots visually reviewed. Emulation is not physical-device performance evidence.
- Formatting, lint, all typechecks, four production builds and production debug-hook exclusion pass.
- Additive migration 0022 -> 0023 preserves every existing public table row, including a pending
  trade. New tables start empty; migration.json contains counts and hashes, no player credentials.
- Real backup/restore deep-compares sixteen durable tables including accepted/pending friends,
  blocks, messages and read state; restored sessions revoked and occupied target refused.

Friends are account-wide and require explicit acceptance. Blocking removes friendship; unblocking
requires renewed consent. Historical conversations remain durable and become visible again only
after renewed acceptance. Message retries retain UUID identity; sender identity and time come from
server authority. History paging is server-tested; browser proof covers current conversations,
not a 500-message scroll session. Guilds remain unfinished. Combined fixed-snapshot verification
for this milestone is the next operational check.
