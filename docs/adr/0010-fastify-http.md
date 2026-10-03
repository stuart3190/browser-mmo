# 0010 — Fastify for the HTTP API

Status: Accepted · Date: 2026-10-03

## Decision

Fastify 5 with pino logging (shared logger from `@mmo/server-kit`), request IDs (inbound
`X-Request-Id` honoured if well-formed, else UUIDv7), Zod validation inside handlers, a single error
handler mapping `DomainError` codes to HTTP statuses, `/health/live`, `/health/ready`, `/metrics`.

## Alternatives considered

Express (slower, weaker typing), Hono (great, edge-oriented; Fastify's plugin model and pino
integration fit a long-running Node service better), NestJS (heavy framework conventions).
