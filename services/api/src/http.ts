import type { FastifyReply, FastifyRequest } from 'fastify';
import type { z } from 'zod';
import type { ResolvedSession } from '@mmo/domain';
import type { Permission } from '@mmo/shared';
import { DomainError, ErrorCode, roleHasPermission } from '@mmo/shared';

declare module 'fastify' {
  interface FastifyRequest {
    session: ResolvedSession | null;
  }
}

/** Parses untrusted input with a Zod schema; failures become 400 VALIDATION_FAILED. */
export function parse<S extends z.ZodType>(schema: S, value: unknown): z.infer<S> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new DomainError(ErrorCode.VALIDATION_FAILED, 'Invalid request', {
      issues: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }
  return result.data;
}

export function requireSession(req: FastifyRequest): ResolvedSession {
  if (!req.session) throw new DomainError(ErrorCode.UNAUTHENTICATED, 'Login required');
  return req.session;
}

/** Throws FORBIDDEN unless the caller's role grants `permission`. Server-side only source of truth. */
export function requirePermission(req: FastifyRequest, permission: Permission): ResolvedSession {
  const s = requireSession(req);
  if (!roleHasPermission(s.account.role, permission)) {
    throw new DomainError(ErrorCode.FORBIDDEN, `Missing permission ${permission}`);
  }
  return s;
}

export function bearerToken(req: FastifyRequest): string | null {
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer ')) return null;
  return h.slice('Bearer '.length).trim() || null;
}

export type Reply = FastifyReply;
