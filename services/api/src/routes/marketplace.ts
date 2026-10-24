import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  browseListings,
  buyListing,
  cancelListing,
  createListing,
  ownListings,
  getListingOffer,
} from '@mmo/domain';
import {
  BuyListingRequestSchema,
  ContentIdSchema,
  CreateListingRequestSchema,
  UuidSchema,
} from '@mmo/schemas';
import type { AppDeps } from '../app';
import { parse, requireSession } from '../http';

const ListingParams = z.object({ listingId: UuidSchema });
const BrowseQuery = z
  .object({
    templateId: ContentIdSchema.optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
    afterPrice: z.coerce.number().int().min(0).optional(),
    afterId: UuidSchema.optional(),
  })
  .refine(
    (q) => (q.afterPrice === undefined) === (q.afterId === undefined),
    'Provide both cursor fields',
  );

export const marketplaceRoutes =
  (deps: AppDeps): FastifyPluginAsync =>
  async (app) => {
    const { ctx } = deps;

    app.get('/marketplace/listings', async (req) => {
      requireSession(req);
      const q = parse(BrowseQuery, req.query);
      return { listings: await browseListings(ctx.db, ctx.now(), q) };
    });

    app.get('/marketplace/mine', async (req) => {
      const s = requireSession(req);
      return { listings: await ownListings(ctx, s.account.id) };
    });
    app.get('/marketplace/listings/:listingId', async (req) => {
      requireSession(req);
      const { listingId } = parse(ListingParams, req.params);
      return getListingOffer(ctx, listingId);
    });

    app.post('/marketplace/listings', async (req, reply) => {
      const s = requireSession(req);
      const body = parse(CreateListingRequestSchema, req.body);
      const listing = await createListing(ctx, {
        actor: { accountId: s.account.id, characterId: body.characterId, requestId: req.id },
        itemInstanceId: body.itemInstanceId,
        price: body.price,
        durationHours: body.durationHours,
        expectedVersion: body.expectedVersion,
      });
      return reply.status(201).send({ listing });
    });

    app.post('/marketplace/listings/:listingId/cancel', async (req) => {
      const s = requireSession(req);
      const { listingId } = parse(ListingParams, req.params);
      return {
        listing: await cancelListing(ctx, {
          actor: { accountId: s.account.id, characterId: null, requestId: req.id },
          listingId,
        }),
      };
    });

    app.post('/marketplace/listings/:listingId/buy', async (req) => {
      const s = requireSession(req);
      const { listingId } = parse(ListingParams, req.params);
      const body = parse(BuyListingRequestSchema, req.body);
      return buyListing(ctx, {
        actor: { accountId: s.account.id, characterId: body.characterId, requestId: req.id },
        listingId,
        expectedPrice: body.expectedPrice,
      });
    });
  };
