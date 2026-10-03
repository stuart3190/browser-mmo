# Security & threat model (basics)

Assume every client is hostile and every message is forged. The browser and the future mobile app
are UIs, not authorities.

| Threat                         | Mitigation in place                                                                                                                                                                                              | Still to do                                                           |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| **Item duplication**           | Single-row location + CHECK/unique constraints; items minted only in `grantItemInTx`; `FOR UPDATE` locks; `source_ref` unique dedupe; concurrency tests (6 parallel claims, 3 parallel moves, 5 parallel buyers) | Trade flow; mail; periodic invariant audits (e.g. nightly SQL checks) |
| **Currency manipulation**      | Amounts only change in `adjustBalanceInTx` (locked row, `amount >= 0` CHECK, per-currency cap, ledger row per change); clients never send amounts except a price they _offer_, re-checked against the listing    | Ledger↔balance reconciliation job; anomaly alerts                     |
| **Forged requests**            | Zod validation of every HTTP body/param and WS frame; ownership checks on every character/item/container; generic NOT_FOUND for other people's characters                                                        | Per-account HTTP rate limits                                          |
| **Marketplace races**          | Listing row locked first; status/expiry checked under lock; `expectedPrice` must match; unique transaction per listing; one active listing per item                                                              | Bid/auction logic later                                               |
| **Trade exploits**             | Model has `revision` so acceptance binds to an exact offer; trade escrow location exists                                                                                                                         | Trade flow not implemented                                            |
| **WebSocket spoofing / CSWSH** | Origin allow-list; session token in first frame (not URL); character ownership checked; one socket per character                                                                                                 | TLS termination config for prod                                       |
| **Replay attacks**             | Strictly increasing `seq` per connection; pickup dedupe by spawn-instance UUID; `expectedVersion` on item moves                                                                                                  | Idempotency keys for HTTP mutations                                   |
| **DB transaction boundaries**  | Each operation = one transaction; fixed lock order; retry on deadlock; history/ledger/audit written in the same transaction                                                                                      | —                                                                     |
| **Cheating (movement)**        | Speed/bounds validation with correction; server owns Y                                                                                                                                                           | Server-side physics/collision, input-based movement                   |
| **Cheating (interaction)**     | Server range checks, server-side entity existence                                                                                                                                                                | Line of sight, cooldowns                                              |
| **Admin abuse**                | Named permissions per route (server-checked); roles in DB; grants/revokes audit-logged with request ID                                                                                                           | 2FA for staff, approval flow for large grants, IP allow-list          |
| **Session theft**              | 256-bit random tokens, hashed at rest, expiry, revocation, account status checked per request                                                                                                                    | HttpOnly cookie option for web, refresh rotation                      |
| **Secrets**                    | Env only; no defaults for secrets; `.env` git-ignored; dev login refuses to start in production                                                                                                                  | Secret manager in deployment                                          |
| **DoS**                        | Body limit 64 KiB, WS frame 8 KiB, token bucket, auth timeout                                                                                                                                                    | Edge rate limiting, connection caps per IP                            |

## Rules for contributors

- Never trust: item IDs you didn't load and lock, quantities, prices, positions, entity IDs, class
  or level claims, timestamps from clients.
- Every new economy operation needs: a transaction, locks in the documented order, history/ledger
  rows, and a concurrency test.
- Log security-relevant failures (`FORBIDDEN`, `ITEM_NOT_OWNED`, replays) — they are fraud signals.
