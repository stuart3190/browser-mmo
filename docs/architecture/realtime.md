# Realtime architecture & protocol

Source of truth: `packages/networking/src/protocol.ts` (Zod). This page explains it.
Decision record: [ADR 0005](../adr/0005-realtime-websocket-protocol.md).

## Transport

WebSocket at `ws(s)://<realtime-host>/ws`, JSON text frames, max inbound frame 8 KiB,
compression off. Browsers must come from an allowed `Origin` (`REALTIME_ALLOWED_ORIGINS`);
non-browser clients may omit `Origin`.

## Envelope (protocol version 1)

```json
{ "v": 1, "t": "move.input", "seq": 42, "d": { "position": {"x":1,"y":0,"z":2}, "rotationY": 0.5 } }
{ "v": 1, "t": "error", "ack": 42, "d": { "code": "OUT_OF_RANGE", "message": "Too far away", "fatal": false } }
```

- `v` — protocol version. Unsupported → `PROTOCOL_VERSION_UNSUPPORTED` and the socket closes.
- `seq` — client→server, strictly increasing per connection; replays/out-of-order are rejected.
- `ack` — server→client reply to a specific `seq`.
- Unknown `t`, bad payloads, oversized frames → `VALIDATION_FAILED`.

### Versioning policy

Adding an optional field or a new server→client message type is backwards compatible within a
version (clients ignore unknown types; `parseServerMessage` drops them). Removing/renaming fields,
changing semantics, or changing encoding (e.g. binary) requires `v: 2`; the server will support the
previous version during a transition window.

## Lifecycle

```
client                                   server
  │── connect /ws (Origin checked) ───────▶│  10 s auth timeout starts
  │── auth.hello {token, characterId} ────▶│  resolve session, check character ownership,
  │                                        │  kick older connection for same character
  │◀── auth.ok {entityId, character, …} ───│
  │◀── inventory.snapshot, character.stats, wallet.updated
  │◀── zone.snapshot {entities in AOI} ────│
  │◀── presence.update joined (to zone) ───│
  │── move.input (≤10/s) ─────────────────▶│  speed/bounds check → accept or move.correction
  │◀── world.moves (per tick, batched) ────│
  │── interact.pickup {entityId} ─────────▶│  range + reservation → DB transaction
  │◀── inventory.updated (ack=seq) ────────│  or error (ack=seq)
  │◀── entity.spawn / entity.despawn ──────│  AOI changes, pickups, joins/leaves
  │── chat.send {say|zone} ───────────────▶│
  │◀── chat.message ───────────────────────│
  │── ping ───────────────────────────────▶│◀── pong
  close ──────────────────────────────────▶│  remove from zone, save position, presence left
```

## Message catalogue (v1)

| Direction | Type                                                                                                             | Status                                                    |
| --------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| C→S       | `auth.hello`                                                                                                     | implemented                                               |
| C→S       | `move.input`                                                                                                     | implemented (client-predicted position, server-validated) |
| C→S       | `interact.pickup`                                                                                                | implemented                                               |
| C→S       | `chat.send` (`say`, `zone`)                                                                                      | implemented (zone-local only)                             |
| C→S       | `ping`                                                                                                           | implemented                                               |
| S→C       | `auth.ok`, `error`, `pong`                                                                                       | implemented                                               |
| S→C       | `zone.snapshot`, `entity.spawn`, `entity.despawn`                                                                | implemented                                               |
| S→C       | `world.moves` (tuples `[id,x,y,z,rotY]`)                                                                         | implemented                                               |
| S→C       | `move.correction`                                                                                                | implemented                                               |
| S→C       | `presence.update`                                                                                                | implemented (zone scope)                                  |
| S→C       | `inventory.snapshot`, `inventory.updated` (`items` + `removed` tombstones, reason `sync` for change-feed pushes) | implemented                                               |
| S→C       | `character.stats` (authoritative effective stats)                                                                | implemented                                               |
| S→C       | `wallet.updated`                                                                                                 | implemented                                               |
| S→C       | `chat.message`                                                                                                   | implemented                                               |
| S→C       | `party.update`, `trade.update`                                                                                   | **schema reserved, never emitted yet**                    |

## Server-side changes → clients (change feed)

Item and wallet changes from **any** process (HTTP API moves/equips, marketplace, admin grants,
jobs) reach connected clients through a PostgreSQL LISTEN/NOTIFY change feed
([ADR 0014](../adr/0014-postgres-change-feed.md)):

```
API/admin/job transaction ──COMMIT──▶ trigger pg_notify('mmo_changes', {k:'item', i, a, pa})
realtime ChangeFeedListener ──▶ AccountSync (coalesce 25 ms) ──▶ re-read rows ──▶ per connection:
    inventory.updated { items: visible to this character, removed: [{id, version}] }
    character.stats   (recomputed from equipped items)
    wallet.updated    (when a balance changed)
```

Visibility per connection: item owned by the account and either in one of the character's
containers (bags, personal vault, shared account vault) or equipped by that character; anything
else that changed for that account is sent as a `removed` tombstone. Clients reconcile by item
`version` (`ItemStore` in `@mmo/ui`): older updates and stale resurrections are ignored, so the HTTP
response and the push can arrive in either order. After the listener (re)connects, every client
gets a full snapshot because NOTIFY is not durable.

## Reconnect

- `RealtimeClient` reconnects automatically with exponential backoff (0.5 s doubling, max 10 s),
  re-sending `auth.hello` with the same session token. The sequence counter restarts per socket.
- Every `auth.ok` is followed by `inventory.snapshot`, `character.stats`, `wallet.updated` and
  `zone.snapshot`; the game client clears its world entities and rebuilds from them.
- Close codes **≥ 4000** are deliberate server decisions (bad token, session replaced by a newer
  login, protocol violation) and are **not** retried, so two tabs never fight over one character.
- The server pings every 30 s and terminates connections that miss a pong (half-open sockets).

## Simulation model

- One `ZoneSimulation` per zone, ticking at `REALTIME_TICK_HZ` (default 20).
- **Interest management**: chunk-based; a player sees entities within 2 chunks of their chunk.
- **Movement**: accepted if inside zone bounds and within `maxSpeed × 1.5 × Δt + 0.25 m` of the
  last accepted position (Δt capped at 1 s); otherwise `move.correction`. Server owns Y (flat
  ground for now). Future: input-based movement with server simulation + client reconciliation.
- **Pickups** are two-phase: reserve in memory (range check, single reserver) → persist via
  `claimWorldPickup` with `source_ref = world_pickup:<spawnPoint>:<spawnInstanceUuid>` (unique
  index) → commit (despawn, schedule respawn) or release on failure. Duplicate claims are
  impossible even across restarts because each spawn cycle has a fresh UUID.

## Security controls

Token in first frame (not URL), origin allow-list, 8 KiB frame cap, Zod validation of every frame,
sequence guard, per-connection token bucket (burst 40, 20/s; >100 violations → disconnect), auth
timeout, one connection per character, server-side range/speed checks.

## Limits and next steps

- **Single realtime process per zone.** Multiple processes hosting the same zone would each run
  their own simulation. Needs a zone registry/routing (likely Redis) before horizontal scaling.
- No zone transitions yet (data model exists: `WorldZone.transitions`).
- Reconnect = re-authenticate + full snapshots (no replay buffer). Expired sessions cannot reconnect
  (the client shows "Disconnected"; reload to log in).
- JSON encoding; a binary codec is a candidate for protocol v2.
