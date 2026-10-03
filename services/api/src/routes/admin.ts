import type { FastifyPluginAsync } from 'fastify';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { schema } from '@mmo/db';
import {
  adminGrantItem,
  adminRevokeItem,
  browseListings,
  getBalances,
  getCharacterItems,
  getItemHistory,
  searchAccounts,
  searchCharacters,
} from '@mmo/domain';
import { ContentIdSchema, UuidSchema } from '@mmo/schemas';
import { DomainError, ErrorCode } from '@mmo/shared';
import type { AppDeps } from '../app';
import { parse, requirePermission } from '../http';

const Search = z.object({ q: z.string().min(1).max(64) });

/**
 * Admin API. Every route checks a named permission (see @mmo/shared permissions). Writes are
 * audit-logged by the domain layer. The admin UI hides controls by the same table, but only
 * these server checks are trusted.
 */
export const adminRoutes =
  (deps: AppDeps): FastifyPluginAsync =>
  async (app) => {
    const { ctx } = deps;

    app.get('/accounts', async (req) => {
      requirePermission(req, 'admin.accounts.read');
      return { accounts: await searchAccounts(ctx.db, parse(Search, req.query).q) };
    });

    app.get('/characters', async (req) => {
      requirePermission(req, 'admin.characters.read');
      return { characters: await searchCharacters(ctx.db, parse(Search, req.query).q) };
    });

    app.get('/characters/:characterId/items', async (req) => {
      requirePermission(req, 'admin.inventory.read');
      const { characterId } = parse(z.object({ characterId: UuidSchema }), req.params);
      const [c] = await ctx.db
        .select()
        .from(schema.characters)
        .where(eq(schema.characters.id, characterId));
      if (!c) throw new DomainError(ErrorCode.NOT_FOUND, 'Character not found');
      return {
        items: await getCharacterItems(ctx.db, ctx, c.accountId, c.id),
        balances: await getBalances(ctx.db, c.accountId, c.id),
      };
    });

    app.get('/items/:itemInstanceId/history', async (req) => {
      requirePermission(req, 'admin.items.history.read');
      const { itemInstanceId } = parse(z.object({ itemInstanceId: UuidSchema }), req.params);
      return { history: await getItemHistory(ctx.db, itemInstanceId) };
    });

    app.get('/marketplace/listings', async (req) => {
      requirePermission(req, 'admin.marketplace.read');
      return { listings: await browseListings(ctx.db, ctx.now(), { limit: 200 }) };
    });

    app.get('/audit', async (req) => {
      requirePermission(req, 'admin.server.read');
      return {
        entries: await ctx.db
          .select()
          .from(schema.auditLog)
          .orderBy(desc(schema.auditLog.occurredAt))
          .limit(100),
      };
    });

    app.post('/items/grant', async (req, reply) => {
      const s = requirePermission(req, 'admin.items.grant');
      const body = parse(
        z.object({
          characterId: UuidSchema,
          templateId: ContentIdSchema,
          quantity: z.number().int().positive().default(1),
          rarityId: ContentIdSchema.optional(),
          reason: z.string().min(3).max(200),
        }),
        req.body,
      );
      const item = await adminGrantItem(ctx, {
        actor: { accountId: s.account.id, characterId: null, requestId: req.id },
        characterId: body.characterId,
        templateId: body.templateId,
        quantity: body.quantity,
        ...(body.rarityId ? { rarityId: body.rarityId } : {}),
        reason: body.reason,
      });
      return reply.status(201).send({ item });
    });

    app.post('/items/:itemInstanceId/revoke', async (req) => {
      const s = requirePermission(req, 'admin.items.revoke');
      const { itemInstanceId } = parse(z.object({ itemInstanceId: UuidSchema }), req.params);
      const { reason } = parse(z.object({ reason: z.string().min(3).max(200) }), req.body);
      return {
        item: await adminRevokeItem(ctx, {
          actor: { accountId: s.account.id, characterId: null, requestId: req.id },
          itemInstanceId,
          reason,
        }),
      };
    });
  };
