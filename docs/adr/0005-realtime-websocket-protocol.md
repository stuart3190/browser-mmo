# 0005 — WebSocket (`ws`) with a typed, versioned JSON protocol

Status: Accepted · Date: 2026-10-03

## Context

Realtime needs presence, movement, entity spawn/despawn, chat, and later party/trade pushes, in
every modern browser and on mobile.

## Decision

- Transport: WebSocket via the `ws` library on a plain Node HTTP server, path `/ws`.
- Envelope `{ v, t, seq?, ack?, d }`, JSON text frames, protocol version 1.
- All messages are Zod schemas in `@mmo/networking`; both ends validate.
- Client sends **intent** only; server sends authoritative state.
- Auth: first frame `auth.hello` carries the API session token (never in the URL).
- Replay protection: strictly increasing `seq` per connection.

## Alternatives considered

WebTransport (better for unreliable movement data, not yet universal; revisit later); Socket.IO
(extra protocol layer and fallbacks we don't need); uWebSockets.js (faster, native, less portable —
can replace `ws` behind the same gateway later); binary codec now (premature; envelope `v` allows
moving to a binary encoding in a later protocol version).

## Consequences

JSON costs bandwidth; `world.moves` already uses compact tuples. A binary codec is a likely
protocol v2. See docs/architecture/realtime.md.
