import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { actOnDirectTrade, createDirectTrade, listDirectTrades } from '@mmo/domain';
import { TradeActionSchema, UuidSchema } from '@mmo/schemas';
import type { AppDeps } from '../app';
import { parse, requireSession } from '../http';

const CharacterParams = z.object({ characterId: UuidSchema });
const TradeParams = CharacterParams.extend({ tradeId: UuidSchema });
const CreateRequest = z
  .object({ targetName: z.string().trim().min(2).max(24), requestId: UuidSchema })
  .strict();

export const tradingRoutes =
  (deps: AppDeps): FastifyPluginAsync =>
  async (app) => {
    app.get('/characters/:characterId/trades', async (req) => {
      const session = requireSession(req);
      const { characterId } = parse(CharacterParams, req.params);
      return {
        trades: await listDirectTrades(deps.ctx, { accountId: session.account.id, characterId }),
      };
    });
    app.post('/characters/:characterId/trades', async (req, reply) => {
      const session = requireSession(req);
      const { characterId } = parse(CharacterParams, req.params);
      const body = parse(CreateRequest, req.body);
      const trade = await createDirectTrade(
        deps.ctx,
        { accountId: session.account.id, characterId, requestId: req.id },
        body.targetName,
        body.requestId,
      );
      return reply.status(201).send({ trade });
    });
    app.post('/characters/:characterId/trades/:tradeId', async (req) => {
      const session = requireSession(req);
      const { characterId, tradeId } = parse(TradeParams, req.params);
      return {
        trade: await actOnDirectTrade(
          deps.ctx,
          { accountId: session.account.id, characterId, requestId: req.id },
          tradeId,
          parse(TradeActionSchema, req.body),
        ),
      };
    });
  };
