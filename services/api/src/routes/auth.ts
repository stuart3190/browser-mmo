import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { DevLoginRequestSchema } from '@mmo/schemas';
import { RolePermissions } from '@mmo/shared';
import { DomainError, ErrorCode } from '@mmo/shared';
import type { AppDeps } from '../app';
import { parse, requireSession } from '../http';

export const authRoutes =
  (deps: AppDeps): FastifyPluginAsync =>
  async (app) => {
    /** Operator-provisioned password login; no public registration. */
    app.post('/auth/password-login', async (req) => {
      const provider = deps.authProviders.get('password');
      if (!provider) throw new DomainError(ErrorCode.NOT_FOUND, 'Password login disabled');
      const { accountId, credential } = await provider.authenticate(deps.ctx, req.body);
      if (!credential)
        throw new DomainError(ErrorCode.UNAUTHENTICATED, 'Missing verified credential');
      const { client } = DevLoginRequestSchema.parse(req.body);
      const session = await deps.sessions.create(deps.ctx, accountId, client, credential);
      return {
        token: session.token,
        expiresAt: session.expiresAt.toISOString(),
        account: session.account,
      };
    });
    app.post('/auth/dev-login', async (req) => {
      const provider = deps.authProviders.get('dev');
      if (!provider) throw new DomainError(ErrorCode.NOT_FOUND, 'Dev login is disabled');
      const body = parse(DevLoginRequestSchema, req.body);
      const { accountId } = await provider.authenticate(deps.ctx, body);
      const session = await deps.sessions.create(deps.ctx, accountId, body.client);
      req.log.info({ accountId, client: body.client }, 'login');
      return {
        token: session.token,
        expiresAt: session.expiresAt.toISOString(),
        account: session.account,
      };
    });

    app.post('/auth/logout', async (req, reply) => {
      const s = requireSession(req);
      await deps.sessions.revoke(deps.ctx, s.sessionId);
      return reply.status(204).send();
    });

    app.get('/me', async (req) => {
      const s = requireSession(req);
      return {
        account: s.account,
        role: s.account.role,
        permissions: RolePermissions[s.account.role],
      };
    });

    /** Lists enabled login methods so clients can render the right login UI. */
    app.get('/auth/providers', async () => ({
      providers: z.array(z.string()).parse([...deps.authProviders.keys()]),
    }));
  };
