import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  createGuild,
  guildHistory,
  guildMemberAction,
  guildState,
  inviteGuild,
  leaveGuild,
  respondGuild,
  sendGuildMessage,
  setGuildMotd,
} from '@mmo/domain';
import {
  CharacterNameSchema,
  GuildMemberActionSchema,
  GuildNameSchema,
  GuildTagSchema,
  SendDirectMessageSchema,
  UuidSchema,
} from '@mmo/schemas';
import { DomainError, ErrorCode } from '@mmo/shared';
import { RateLimit } from '@mmo/server-kit';
import type { AppDeps } from '../app';
import { parse, requireSession } from '../http';
const Scoped = z.object({ guildId: UuidSchema });
const Message = SendDirectMessageSchema.extend({ guildId: UuidSchema }).strict();
const Character = z.object({ characterId: UuidSchema });
const Create = z.object({ name: GuildNameSchema, tag: GuildTagSchema }).strict();
const Invite = z.object({ guildId: UuidSchema, name: CharacterNameSchema }).strict();
const Respond = z.object({ guildId: UuidSchema, accept: z.boolean() }).strict();
const Member = z
  .object({ guildId: UuidSchema, targetId: UuidSchema, action: GuildMemberActionSchema })
  .strict();
const Leave = z.object({ guildId: UuidSchema, disband: z.boolean().default(false) }).strict();
const Notice = z.object({ guildId: UuidSchema, motd: z.string().max(500) }).strict();
export const guildRoutes =
  (deps: AppDeps): FastifyPluginAsync =>
  async (app) => {
    const limiter = new RateLimit(10, 0.5);
    const actor = (req: Parameters<typeof requireSession>[0], write = false) => {
      const session = requireSession(req),
        { characterId } = parse(Character, req.params);
      if (write && !limiter.take(session.account.id))
        throw new DomainError(
          ErrorCode.RATE_LIMITED,
          'Wait a moment before changing your guild again',
        );
      return { accountId: session.account.id, characterId };
    };
    app.get('/characters/:characterId/guild', async (req) => guildState(deps.ctx, actor(req)));
    app.post('/characters/:characterId/guild', async (req) => {
      const a = actor(req, true),
        { name, tag } = parse(Create, req.body);
      return { guildId: await createGuild(deps.ctx, a, name, tag) };
    });
    app.post('/characters/:characterId/guild/invite', async (req, reply) => {
      const a = actor(req, true),
        { guildId, name } = parse(Invite, req.body);
      await inviteGuild(deps.ctx, { ...a, guildId }, name);
      return reply.status(204).send();
    });
    app.post('/characters/:characterId/guild/respond', async (req, reply) => {
      const a = actor(req, true),
        { guildId, accept } = parse(Respond, req.body);
      await respondGuild(deps.ctx, a, guildId, accept);
      return reply.status(204).send();
    });
    app.post('/characters/:characterId/guild/member', async (req, reply) => {
      const a = actor(req, true),
        { guildId, targetId, action } = parse(Member, req.body);
      await guildMemberAction(deps.ctx, { ...a, guildId }, targetId, action);
      return reply.status(204).send();
    });
    app.post('/characters/:characterId/guild/leave', async (req, reply) => {
      const a = actor(req, true),
        { guildId, disband } = parse(Leave, req.body);
      await leaveGuild(deps.ctx, { ...a, guildId }, disband);
      return reply.status(204).send();
    });
    app.post('/characters/:characterId/guild/notice', async (req, reply) => {
      const a = actor(req, true),
        { guildId, motd } = parse(Notice, req.body);
      await setGuildMotd(deps.ctx, { ...a, guildId }, motd);
      return reply.status(204).send();
    });
    app.get('/characters/:characterId/guild/messages', async (req) => ({
      messages: await guildHistory(deps.ctx, { ...actor(req), ...parse(Scoped, req.query) }),
    }));
    app.post('/characters/:characterId/guild/messages', async (req) => {
      const a = actor(req),
        { guildId, id, body } = parse(Message, req.body);
      return { message: await sendGuildMessage(deps.ctx, { ...a, guildId }, id, body) };
    });
  };
