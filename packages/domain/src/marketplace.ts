import { and, asc, count, eq, gt, lte } from 'drizzle-orm';
import { schema } from '@mmo/db';
import type { DbOrTx, Tx } from '@mmo/db';
import { defaultContainerKindFor, isCurrentlyTradeable, listingFee, saleFee } from '@mmo/game-data';
import type { ItemLocation, MarketplaceListing, MarketplaceTransaction } from '@mmo/schemas';
import { DomainError, ErrorCode, uuidv7 } from '@mmo/shared';
import type { Actor, DomainContext } from './context';
import {
  characterCanUseContainer,
  firstFreeSlot,
  lockCharacterContainer,
  lockContainers,
  occupiedSlots,
} from './containers';
import { adjustBalanceInTx, lockWallets } from './currency';
import { recordAudit, recordItemHistory } from './history';
import { lockItem, requireOwnedCharacter } from './items';
import type { ItemRow } from './items';
import { bindingFromRow, locationColumns, locationFromRow } from './mappers';
import { inTransaction } from './tx';

type ListingRow = typeof schema.marketplaceListings.$inferSelect;

function listingFromRow(r: ListingRow): MarketplaceListing {
  return {
    id: r.id,
    sellerAccountId: r.sellerAccountId,
    sellerCharacterId: r.sellerCharacterId,
    itemInstanceId: r.itemInstanceId,
    templateId: r.templateId,
    rarityId: r.rarityId,
    quantity: r.quantity,
    currencyId: r.currencyId,
    price: r.price,
    listingFee: r.listingFee,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
    expiresAt: r.expiresAt.toISOString(),
    closedAt: r.closedAt?.toISOString() ?? null,
  };
}

async function lockListing(tx: Tx, listingId: string): Promise<ListingRow> {
  const [row] = await tx
    .select()
    .from(schema.marketplaceListings)
    .where(eq(schema.marketplaceListings.id, listingId))
    .for('update');
  if (!row) throw new DomainError(ErrorCode.NOT_FOUND, 'Listing not found');
  return row;
}

async function setItem(
  tx: Tx,
  row: ItemRow,
  now: Date,
  patch: Partial<typeof schema.itemInstances.$inferInsert>,
) {
  await tx
    .update(schema.itemInstances)
    .set({ ...patch, version: row.version + 1, updatedAt: now })
    .where(eq(schema.itemInstances.id, row.id));
}

/** Returns an escrowed item to a character's default container (locks that container). */
async function returnFromEscrow(
  tx: Tx,
  ctx: DomainContext,
  item: ItemRow,
  characterId: string,
  now: Date,
): Promise<ItemLocation> {
  const template = ctx.gameData.template(item.templateId);
  const container = await lockCharacterContainer(
    tx,
    characterId,
    defaultContainerKindFor(template),
  );
  const slot = firstFreeSlot(container.capacity, await occupiedSlots(tx, container.id));
  if (slot === undefined)
    throw new DomainError(
      ErrorCode.CONTAINER_FULL,
      `Free a slot in your ${container.kind.replace('_', ' ')} first`,
    );
  const to: ItemLocation = {
    kind: 'container',
    containerId: container.id,
    containerKind: container.kind,
    slot,
  };
  await setItem(tx, item, now, { ...locationColumns(to), ownerCharacterId: characterId });
  return to;
}

// ---------------------------------------------------------------------------
// Create listing: item -> escrow, listing fee charged. All-or-nothing.
// ---------------------------------------------------------------------------

export async function createListing(
  ctx: DomainContext,
  input: {
    actor: Actor & { accountId: string; characterId: string };
    itemInstanceId: string;
    price: number;
    durationHours: number;
  },
): Promise<MarketplaceListing> {
  const rules = ctx.gameData.raw.marketplaceRules;
  const { accountId, characterId } = input.actor;
  if (!Number.isSafeInteger(input.price) || input.price < Math.max(1, rules.minPrice)) {
    throw new DomainError(ErrorCode.VALIDATION_FAILED, 'Invalid price');
  }
  if (!rules.listingDurationsHours.includes(input.durationHours)) {
    throw new DomainError(
      ErrorCode.VALIDATION_FAILED,
      `Duration must be one of ${rules.listingDurationsHours.join(', ')} hours`,
    );
  }

  return inTransaction(ctx, async (tx) => {
    await requireOwnedCharacter(tx, accountId, characterId);
    const item = await lockItem(tx, input.itemInstanceId);
    if (item.ownerAccountId !== accountId)
      throw new DomainError(ErrorCode.ITEM_NOT_OWNED, 'You do not own this item');
    if (item.locationKind !== 'container') {
      throw new DomainError(
        ErrorCode.ITEM_NOT_IN_EXPECTED_LOCATION,
        'Only items in your bags or vaults can be listed',
      );
    }
    const src = (await lockContainers(tx, [item.containerId!])).get(item.containerId!)!;
    if (!characterCanUseContainer(src, accountId, characterId))
      throw new DomainError(ErrorCode.FORBIDDEN, 'Not your container');
    if (item.isLocked)
      throw new DomainError(ErrorCode.ITEM_LOCKED, 'Unlock the item before listing it');
    const template = ctx.gameData.template(item.templateId);
    if (!template.marketplaceAllowed || !isCurrentlyTradeable(template, bindingFromRow(item))) {
      throw new DomainError(
        ErrorCode.ITEM_NOT_TRADEABLE,
        'This item cannot be sold on the marketplace',
      );
    }

    const [active] = await tx
      .select({ n: count() })
      .from(schema.marketplaceListings)
      .where(
        and(
          eq(schema.marketplaceListings.sellerAccountId, accountId),
          eq(schema.marketplaceListings.status, 'active'),
        ),
      );
    if ((active?.n ?? 0) >= rules.maxActiveListingsPerAccount) {
      throw new DomainError(ErrorCode.CONFLICT, 'Too many active listings');
    }

    const now = ctx.now();
    const listingId = uuidv7();
    const fee = listingFee(rules, input.price);
    await adjustBalanceInTx(tx, ctx, {
      currencyId: rules.currencyId,
      accountId,
      characterId,
      delta: -fee,
      reason: 'marketplace_listing_fee',
      correlationId: listingId,
    });
    const [listing] = await tx
      .insert(schema.marketplaceListings)
      .values({
        id: listingId,
        sellerAccountId: accountId,
        sellerCharacterId: characterId,
        itemInstanceId: item.id,
        templateId: item.templateId,
        rarityId: item.rarityId,
        quantity: item.quantity,
        currencyId: rules.currencyId,
        price: input.price,
        listingFee: fee,
        status: 'active',
        createdAt: now,
        expiresAt: new Date(now.getTime() + input.durationHours * 3_600_000),
      })
      .returning();
    const to: ItemLocation = { kind: 'marketplace_escrow', listingId };
    await setItem(tx, item, now, locationColumns(to));
    await recordItemHistory(tx, [
      {
        itemInstanceId: item.id,
        eventType: 'listed',
        actor: input.actor,
        fromLocation: locationFromRow(item, new Map([[src.id, src.kind]])),
        toLocation: to,
        correlationId: listingId,
        details: { price: input.price, fee },
        occurredAt: now,
      },
    ]);
    return listingFromRow(listing!);
  });
}

// ---------------------------------------------------------------------------
// Cancel listing: item back to seller, fee not refunded.
// ---------------------------------------------------------------------------

export async function cancelListing(
  ctx: DomainContext,
  input: { actor: Actor & { accountId: string }; listingId: string },
): Promise<MarketplaceListing> {
  return inTransaction(ctx, async (tx) => {
    const listing = await lockListing(tx, input.listingId);
    if (listing.sellerAccountId !== input.actor.accountId)
      throw new DomainError(ErrorCode.FORBIDDEN, 'Not your listing');
    if (listing.status !== 'active')
      throw new DomainError(ErrorCode.LISTING_NOT_ACTIVE, 'Listing is no longer active');
    const item = await lockItem(tx, listing.itemInstanceId);
    if (item.locationKind !== 'marketplace_escrow' || item.listingId !== listing.id) {
      throw new DomainError(ErrorCode.INTERNAL, 'Escrow inconsistency');
    }
    const now = ctx.now();
    const to = await returnFromEscrow(tx, ctx, item, listing.sellerCharacterId, now);
    const [updated] = await tx
      .update(schema.marketplaceListings)
      .set({ status: 'cancelled', closedAt: now })
      .where(eq(schema.marketplaceListings.id, listing.id))
      .returning();
    await recordItemHistory(tx, [
      {
        itemInstanceId: item.id,
        eventType: 'listing_cancelled',
        actor: input.actor,
        fromLocation: locationFromRow(item),
        toLocation: to,
        correlationId: listing.id,
        occurredAt: now,
      },
    ]);
    return listingFromRow(updated!);
  });
}

// ---------------------------------------------------------------------------
// Buy: currency and item change hands atomically. Exactly one buyer can win.
// ---------------------------------------------------------------------------

export async function buyListing(
  ctx: DomainContext,
  input: {
    actor: Actor & { accountId: string; characterId: string };
    listingId: string;
    expectedPrice: number;
  },
): Promise<{ listing: MarketplaceListing; transaction: MarketplaceTransaction }> {
  const rules = ctx.gameData.raw.marketplaceRules;
  const { accountId, characterId } = input.actor;
  return inTransaction(ctx, async (tx) => {
    await requireOwnedCharacter(tx, accountId, characterId);
    // Lock order everywhere: listing -> item -> containers -> wallets.
    const listing = await lockListing(tx, input.listingId);
    const now = ctx.now();
    if (listing.status !== 'active' || listing.expiresAt <= now) {
      throw new DomainError(ErrorCode.LISTING_NOT_ACTIVE, 'Listing is no longer available');
    }
    if (listing.sellerAccountId === accountId)
      throw new DomainError(ErrorCode.CANNOT_BUY_OWN_LISTING, 'You cannot buy your own listing');
    if (listing.price !== input.expectedPrice) {
      throw new DomainError(ErrorCode.CONFLICT, 'Price changed', { price: listing.price });
    }
    const item = await lockItem(tx, listing.itemInstanceId);
    if (item.locationKind !== 'marketplace_escrow' || item.listingId !== listing.id) {
      throw new DomainError(ErrorCode.INTERNAL, 'Escrow inconsistency');
    }

    const template = ctx.gameData.template(item.templateId);
    const container = await lockCharacterContainer(
      tx,
      characterId,
      defaultContainerKindFor(template),
    );
    const slot = firstFreeSlot(container.capacity, await occupiedSlots(tx, container.id));
    if (slot === undefined) throw new DomainError(ErrorCode.CONTAINER_FULL, 'Your bags are full');

    const txId = uuidv7();
    const fee = saleFee(rules, listing.price);
    const proceeds = listing.price - fee;
    const buyerWallet = { currencyId: listing.currencyId, accountId, characterId };
    const sellerWallet = {
      currencyId: listing.currencyId,
      accountId: listing.sellerAccountId,
      characterId: listing.sellerCharacterId,
    };
    await lockWallets(tx, ctx, [buyerWallet, sellerWallet]);
    await adjustBalanceInTx(tx, ctx, {
      ...buyerWallet,
      delta: -listing.price,
      reason: 'marketplace_purchase',
      correlationId: txId,
    });
    await adjustBalanceInTx(tx, ctx, {
      ...sellerWallet,
      delta: proceeds,
      reason: 'marketplace_sale_proceeds',
      correlationId: txId,
    });

    const to: ItemLocation = {
      kind: 'container',
      containerId: container.id,
      containerKind: container.kind,
      slot,
    };
    await setItem(tx, item, now, {
      ...locationColumns(to),
      ownerAccountId: accountId,
      ownerCharacterId: characterId,
    });

    const [updatedListing] = await tx
      .update(schema.marketplaceListings)
      .set({ status: 'sold', closedAt: now })
      .where(eq(schema.marketplaceListings.id, listing.id))
      .returning();
    const [txRow] = await tx
      .insert(schema.marketplaceTransactions)
      .values({
        id: txId,
        listingId: listing.id,
        itemInstanceId: item.id,
        sellerAccountId: listing.sellerAccountId,
        buyerAccountId: accountId,
        buyerCharacterId: characterId,
        currencyId: listing.currencyId,
        price: listing.price,
        saleFee: fee,
        sellerProceeds: proceeds,
        occurredAt: now,
      })
      .returning();
    await recordItemHistory(tx, [
      {
        itemInstanceId: item.id,
        eventType: 'sold',
        actor: input.actor,
        fromOwnerAccountId: listing.sellerAccountId,
        toOwnerAccountId: accountId,
        fromLocation: locationFromRow(item),
        toLocation: to,
        correlationId: txId,
        details: { price: listing.price, saleFee: fee },
        occurredAt: now,
      },
    ]);
    await recordAudit(tx, {
      actor: input.actor,
      action: 'marketplace.buy',
      targetType: 'listing',
      targetId: listing.id,
      details: {
        price: listing.price,
        itemInstanceId: item.id,
        sellerAccountId: listing.sellerAccountId,
      },
      at: now,
    });
    return {
      listing: listingFromRow(updatedListing!),
      transaction: {
        id: txRow!.id,
        listingId: txRow!.listingId,
        itemInstanceId: txRow!.itemInstanceId,
        sellerAccountId: txRow!.sellerAccountId,
        buyerAccountId: txRow!.buyerAccountId,
        buyerCharacterId: txRow!.buyerCharacterId,
        currencyId: txRow!.currencyId,
        price: txRow!.price,
        saleFee: txRow!.saleFee,
        sellerProceeds: txRow!.sellerProceeds,
        occurredAt: txRow!.occurredAt.toISOString(),
      },
    };
  });
}

// ---------------------------------------------------------------------------
// Expiry sweep (run periodically by a server process)
// ---------------------------------------------------------------------------

/**
 * Expires active listings past their expiry, returning items to the seller. Each listing is its
 * own transaction. If the seller's bag is full the listing is left for the next sweep (it is
 * already unbuyable because buy checks expiresAt). Returns the number expired.
 */
export async function expireListings(ctx: DomainContext, limit = 100): Promise<number> {
  const now = ctx.now();
  const due = await ctx.db
    .select({ id: schema.marketplaceListings.id })
    .from(schema.marketplaceListings)
    .where(
      and(
        eq(schema.marketplaceListings.status, 'active'),
        lte(schema.marketplaceListings.expiresAt, now),
      ),
    )
    .orderBy(asc(schema.marketplaceListings.expiresAt))
    .limit(limit);
  let expired = 0;
  for (const { id } of due) {
    try {
      await inTransaction(ctx, async (tx) => {
        const listing = await lockListing(tx, id);
        if (listing.status !== 'active' || listing.expiresAt > now) return;
        const item = await lockItem(tx, listing.itemInstanceId);
        const to = await returnFromEscrow(tx, ctx, item, listing.sellerCharacterId, now);
        await tx
          .update(schema.marketplaceListings)
          .set({ status: 'expired', closedAt: now })
          .where(eq(schema.marketplaceListings.id, id));
        await recordItemHistory(tx, [
          {
            itemInstanceId: item.id,
            eventType: 'listing_expired',
            actor: { accountId: null, characterId: null },
            fromLocation: locationFromRow(item),
            toLocation: to,
            correlationId: id,
            occurredAt: now,
          },
        ]);
        expired++;
      });
    } catch (err) {
      if (err instanceof DomainError && err.code === ErrorCode.CONTAINER_FULL) continue;
      throw err;
    }
  }
  return expired;
}

export async function browseListings(
  db: DbOrTx,
  now: Date,
  filter: { templateId?: string; sellerAccountId?: string; limit?: number },
): Promise<MarketplaceListing[]> {
  const conds = [
    eq(schema.marketplaceListings.status, 'active'),
    gt(schema.marketplaceListings.expiresAt, now),
  ];
  if (filter.templateId) conds.push(eq(schema.marketplaceListings.templateId, filter.templateId));
  if (filter.sellerAccountId)
    conds.push(eq(schema.marketplaceListings.sellerAccountId, filter.sellerAccountId));
  const rows = await db
    .select()
    .from(schema.marketplaceListings)
    .where(and(...conds))
    .orderBy(asc(schema.marketplaceListings.price))
    .limit(Math.min(filter.limit ?? 50, 200));
  return rows.map(listingFromRow);
}
