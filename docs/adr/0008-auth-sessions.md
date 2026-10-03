# 0008 — AuthProvider abstraction + opaque DB sessions

Status: Accepted · Date: 2026-10-03

## Decision

- `AuthProvider` interface turns provider credentials into an account ID; each linked login method
  is an `auth_identities` row `(provider, provider_subject)`.
- Only `DevAuthProvider` exists (username, no password). The API refuses to start with it enabled
  when `NODE_ENV=production`.
- Sessions are opaque 256-bit random bearer tokens; only the SHA-256 hash is stored. Each session
  records `client_kind` (`game_web`, `admin`, `companion_mobile`, `tool`), expiry and revocation.
- The realtime service validates the same token in its `auth.hello` frame.

## Alternatives considered

JWTs (stateless but hard to revoke; revocation matters for bans/compromised accounts);
third-party auth SaaS now (premature).

## Consequences

Adding email/password = new provider + argon2id hash in `secret_hash`. OAuth = new provider +
callback routes. Session lookups hit the DB on every request (cacheable later, e.g. Redis).
