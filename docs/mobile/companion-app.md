# Companion mobile app (future)

**Not built.** `apps/companion-app-placeholder` reserves the slot. This page records what the
backend must provide so we never paint ourselves into a browser-only corner.

## Principles

- Same HTTP API (`/v1`), same `@mmo/schemas` DTOs, same error codes, same sessions
  (`clientKind: companion_mobile`). No mobile-only business rules.
- The app manipulates _account state_ (items, money, social), never live-world state (position,
  combat). Live-world actions stay in the game client.
- Any action allowed from mobile must be safe while the character is also online in the game:
  item moves use `expectedVersion`; the realtime server must push `inventory.updated` to the game
  client when the API changes items (**not implemented yet** — needs API→realtime notification,
  likely Redis pub/sub).

## Required API surface

| Feature                     | Exists today                                                                | Needed                                                                                          |
| --------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Login                       | dev login, sessions, `/v1/me`                                               | email/password + OAuth providers, refresh tokens, device sessions list/revoke                   |
| Inventory & equipment       | `GET /v1/characters/:id/items`, `POST …/items/move`, `POST /v1/items/flags` | paging for large vaults, server-side sort                                                       |
| Vault / account vault       | same endpoints (containers)                                                 | —                                                                                               |
| Currencies                  | `GET /v1/characters/:id/currencies`                                         | ledger history endpoint                                                                         |
| Marketplace                 | list/browse/cancel/buy endpoints                                            | search & filters, my listings, sale history, notifications on sale                              |
| Trades                      | —                                                                           | trade flow (async trades for mobile need design)                                                |
| Friends, guilds             | schemas only                                                                | full social service                                                                             |
| Direct messages, group chat | schemas only (`DirectMessage`, `ChatChannel`)                               | persistent messaging service + realtime/push delivery                                           |
| Notifications               | —                                                                           | push (APNs/FCM) service, preferences, events: sale completed, listing expired, DM, guild invite |

## Realtime on mobile

The same WebSocket protocol can serve social/notification messages to mobile; zone simulation
messages are irrelevant there. A future `client: companion_mobile` hello would subscribe to account
channels only.
