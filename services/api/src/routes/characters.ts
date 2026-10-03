import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  createCharacter,
  getBalances,
  getCharacterItems,
  listCharacters,
  moveItem,
  requireOwnedCharacter,
  setItemFlags,
} from '@mmo/domain';
import {
  CreateCharacterRequestSchema,
  MoveItemRequestSchema,
  SetItemFlagsRequestSchema,
  UuidSchema,
} from '@mmo/schemas';
import type { AppDeps } from '../app';
import { parse, requireSession } from '../http';

const CharacterParams = z.object({ characterId: UuidSchema });

export const characterRoutes =
  (deps: AppDeps): FastifyPluginAsync =>
  async (app) => {
    const { ctx } = deps;

    app.get('/characters', async (req) => {
      const s = requireSession(req);
      return { characters: await listCharacters(ctx.db, s.account.id) };
    });

    app.post('/characters', async (req, reply) => {
      const s = requireSession(req);
      const body = parse(CreateCharacterRequestSchema, req.body);
      const character = await createCharacter(ctx, {
        accountId: s.account.id,
        name: body.name,
        classId: body.classId,
      });
      return reply.status(201).send({ character });
    });

    /** Equipment + every container (backpack, pouch, vaults) for one character. */
    app.get('/characters/:characterId/items', async (req) => {
      const s = requireSession(req);
      const { characterId } = parse(CharacterParams, req.params);
      await requireOwnedCharacter(ctx.db, s.account.id, characterId);
      return { items: await getCharacterItems(ctx.db, ctx, s.account.id, characterId) };
    });

    app.get('/characters/:characterId/currencies', async (req) => {
      const s = requireSession(req);
      const { characterId } = parse(CharacterParams, req.params);
      await requireOwnedCharacter(ctx.db, s.account.id, characterId);
      return { balances: await getBalances(ctx.db, s.account.id, characterId) };
    });

    /** Move / equip / unequip. Used by the game client and (later) the companion app. */
    app.post('/characters/:characterId/items/move', async (req) => {
      const s = requireSession(req);
      const { characterId } = parse(CharacterParams, req.params);
      const request = parse(MoveItemRequestSchema, req.body);
      const items = await moveItem(ctx, {
        accountId: s.account.id,
        characterId,
        request,
        requestId: req.id,
      });
      return { items };
    });

    app.post('/items/flags', async (req) => {
      const s = requireSession(req);
      const body = parse(SetItemFlagsRequestSchema, req.body);
      return { item: await setItemFlags(ctx, { accountId: s.account.id, ...body }) };
    });
  };
