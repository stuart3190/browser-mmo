import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  actOnFriend,
  directMessageHistory,
  listFriends,
  readDirectMessages,
  requestFriend,
  sendDirectMessage,
} from '@mmo/domain';
import {
  CharacterNameSchema,
  FriendActionSchema,
  SendDirectMessageSchema,
  UuidSchema,
} from '@mmo/schemas';
import { DomainError, ErrorCode } from '@mmo/shared';
import { RateLimit } from '@mmo/server-kit';
import type { AppDeps } from '../app';
import { parse, requireSession } from '../http';
const Character = z.object({ characterId: UuidSchema });
const Contact = Character.extend({ peer: UuidSchema });
const FriendRequest = z.object({ name: CharacterNameSchema }).strict();
const Action = z.object({ action: FriendActionSchema }).strict();
const History = z.object({ before: UuidSchema.optional() });
const Read = z.object({ ids: z.array(UuidSchema).max(50) }).strict();
export const socialRoutes =
  (deps: AppDeps): FastifyPluginAsync =>
  async (app) => {
    const writes = new RateLimit(10, 0.5);
    const limit = (accountId: string) => {
      if (!writes.take(accountId))
        throw new DomainError(
          ErrorCode.RATE_LIMITED,
          'Wait a moment before changing contacts again',
        );
    };
    app.get('/characters/:characterId/social', async (req) => {
      const s = requireSession(req),
        { characterId } = parse(Character, req.params);
      return { friends: await listFriends(deps.ctx, { accountId: s.account.id, characterId }) };
    });
    app.post('/characters/:characterId/social', async (req) => {
      const s = requireSession(req),
        { characterId } = parse(Character, req.params),
        { name } = parse(FriendRequest, req.body);
      limit(s.account.id);
      return {
        friend: await requestFriend(deps.ctx, { accountId: s.account.id, characterId }, name),
      };
    });
    app.post('/characters/:characterId/social/:peer', async (req, reply) => {
      const s = requireSession(req),
        { characterId, peer } = parse(Contact, req.params),
        { action } = parse(Action, req.body);
      limit(s.account.id);
      await actOnFriend(deps.ctx, { accountId: s.account.id, characterId }, peer, action);
      return reply.status(204).send();
    });
    app.get('/characters/:characterId/social/:peer/messages', async (req) => {
      const s = requireSession(req),
        { characterId, peer } = parse(Contact, req.params),
        { before } = parse(History, req.query);
      return directMessageHistory(deps.ctx, { accountId: s.account.id, characterId }, peer, before);
    });
    app.post('/characters/:characterId/social/:peer/messages', async (req) => {
      const s = requireSession(req),
        { characterId, peer } = parse(Contact, req.params),
        { id, body } = parse(SendDirectMessageSchema, req.body);
      return {
        message: await sendDirectMessage(
          deps.ctx,
          { accountId: s.account.id, characterId },
          peer,
          id,
          body,
        ),
      };
    });
    app.post('/characters/:characterId/social/:peer/messages/read', async (req) => {
      const s = requireSession(req),
        { characterId, peer } = parse(Contact, req.params),
        { ids } = parse(Read, req.body);
      return {
        readAt: await readDirectMessages(
          deps.ctx,
          { accountId: s.account.id, characterId },
          peer,
          ids,
        ),
      };
    });
  };
