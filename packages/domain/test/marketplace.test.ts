import { describe, expect, it } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import { schema } from '@mmo/db';
import { GameData } from '@mmo/game-data';
import type { Item } from '@mmo/schemas';
import {
  adjustBalanceInTx,
  browseListings,
  getListingOffer,
  ownListings,
  buyListing,
  cancelListing,
  createDomainContext,
  createListing,
  expireListings,
  getBalances,
  getCharacterItems,
  getItemHistory,
  grantItemInTx,
  inTransaction,
  moveItem,
  setItemFlags,
} from '../src/index';
import { addCharacter, containerId, expectCode, makePlayer, setupContext } from './helpers';
import type { TestPlayer } from './helpers';

const ctx = setupContext();

async function give(p: TestPlayer, templateId: string): Promise<Item> {
  const { created } = await inTransaction(ctx, (tx) =>
    grantItemInTx(tx, ctx, {
      accountId: p.accountId,
      characterId: p.characterId,
      templateId,
      quantity: 1,
      method: 'system',
      actor: { accountId: null, characterId: null },
    }),
  );
  const inv = await getCharacterItems(ctx.db, ctx, p.accountId, p.characterId);
  return inv.containers.flatMap((c) => c.items).find((i) => i.instance.id === created.id)!;
}

const gold = async (p: TestPlayer) =>
  (await getBalances(ctx.db, p.accountId, p.characterId)).find((b) => b.currencyId === 'gold')!
    .amount;
const actorOf = (p: TestPlayer) => ({ accountId: p.accountId, characterId: p.characterId });
const list = (p: TestPlayer, item: Item, price = 500) =>
  createListing(ctx, {
    actor: actorOf(p),
    itemInstanceId: item.instance.id,
    price,
    durationHours: 24,
  });

describe('marketplace listing state', () => {
  it('escrows the item and charges the listing fee', async () => {
    const seller = await makePlayer(ctx);
    const sword = await give(seller, 'weapon.sword.iron_longsword');
    const before = await gold(seller);
    const listing = await list(seller, sword, 500);
    expect(listing.status).toBe('active');
    expect(listing.listingFee).toBe(10);
    expect(await gold(seller)).toBe(before - 10);

    const inv = await getCharacterItems(ctx.db, ctx, seller.accountId, seller.characterId);
    expect(
      inv.containers.flatMap((c) => c.items).some((i) => i.instance.id === sword.instance.id),
    ).toBe(false);

    // While listed the item cannot be moved, equipped or listed again.
    const vault = await containerId(ctx, seller, 'character_vault');
    await expectCode(
      moveItem(ctx, {
        ...actorOf(seller),
        request: {
          itemInstanceId: sword.instance.id,
          expectedVersion: sword.instance.version + 1,
          to: { kind: 'container', containerId: vault },
        },
      }),
      'ITEM_NOT_IN_EXPECTED_LOCATION',
    );
    await expectCode(list(seller, sword), 'ITEM_NOT_IN_EXPECTED_LOCATION');
    expect(
      (await browseListings(ctx.db, new Date(), { sellerAccountId: seller.accountId })).map(
        (l) => l.id,
      ),
    ).toEqual([listing.id]);
  });

  it('cancels a listing and returns the item (fee is not refunded)', async () => {
    const seller = await makePlayer(ctx);
    const sword = await give(seller, 'weapon.sword.iron_longsword');
    const listing = await list(seller, sword);
    const afterFee = await gold(seller);
    const cancelled = await cancelListing(ctx, { actor: actorOf(seller), listingId: listing.id });
    expect(cancelled.status).toBe('cancelled');
    expect(await gold(seller)).toBe(afterFee);
    const inv = await getCharacterItems(ctx.db, ctx, seller.accountId, seller.characterId);
    expect(
      inv.containers.flatMap((c) => c.items).some((i) => i.instance.id === sword.instance.id),
    ).toBe(true);
    await expectCode(
      cancelListing(ctx, { actor: actorOf(seller), listingId: listing.id }),
      'LISTING_NOT_ACTIVE',
    );
  });

  it('transfers item and currency atomically on purchase, with fees and history', async () => {
    const seller = await makePlayer(ctx);
    const buyer = await makePlayer(ctx);
    const sword = await give(seller, 'weapon.sword.iron_longsword');
    const listing = await list(seller, sword, 400);
    const sellerBefore = await gold(seller);
    const buyerBefore = await gold(buyer);

    const { transaction } = await buyListing(ctx, {
      actor: actorOf(buyer),
      listingId: listing.id,
      expectedPrice: 400,
    });
    expect(transaction.saleFee).toBe(20);
    expect(await gold(buyer)).toBe(buyerBefore - 400);
    expect(await gold(seller)).toBe(sellerBefore + 380);

    const buyerInv = await getCharacterItems(ctx.db, ctx, buyer.accountId, buyer.characterId);
    const bought = buyerInv.containers
      .flatMap((c) => c.items)
      .find((i) => i.instance.id === sword.instance.id)!;
    expect(bought.instance.ownership.ownerAccountId).toBe(buyer.accountId);
    expect(bought.instance.ownership.originalOwnerAccountId).toBe(seller.accountId);
    const history = await getItemHistory(ctx.db, sword.instance.id);
    expect(history.map((h) => h.eventType)).toEqual(['created', 'listed', 'sold']);
    await expectCode(
      buyListing(ctx, { actor: actorOf(buyer), listingId: listing.id, expectedPrice: 400 }),
      'LISTING_NOT_ACTIVE',
    );
  });

  it('rejects buying your own listing, wrong price, and insufficient funds without side effects', async () => {
    const seller = await makePlayer(ctx);
    const sword = await give(seller, 'weapon.sword.iron_longsword');
    const listing = await list(seller, sword, 5_000);
    await expectCode(
      buyListing(ctx, { actor: actorOf(seller), listingId: listing.id, expectedPrice: 5_000 }),
      'CANNOT_BUY_OWN_LISTING',
    );
    const poor = await makePlayer(ctx); // 1000 starting gold
    await expectCode(
      buyListing(ctx, { actor: actorOf(poor), listingId: listing.id, expectedPrice: 4_000 }),
      'CONFLICT',
    );
    await expectCode(
      buyListing(ctx, { actor: actorOf(poor), listingId: listing.id, expectedPrice: 5_000 }),
      'INSUFFICIENT_FUNDS',
    );
    expect(await gold(poor)).toBe(1_000);
    const [row] = await ctx.db
      .select()
      .from(schema.marketplaceListings)
      .where(eq(schema.marketplaceListings.id, listing.id));
    expect(row!.status).toBe('active');
  });

  it('lets exactly one of many concurrent buyers win', async () => {
    const seller = await makePlayer(ctx);
    const sword = await give(seller, 'weapon.sword.iron_longsword');
    const listing = await list(seller, sword, 300);
    const buyers = await Promise.all(Array.from({ length: 5 }, () => makePlayer(ctx)));
    const results = await Promise.allSettled(
      buyers.map((b) =>
        buyListing(ctx, { actor: actorOf(b), listingId: listing.id, expectedPrice: 300 }),
      ),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const balances = await Promise.all(buyers.map(gold));
    expect(balances.filter((g) => g === 700)).toHaveLength(1);
    expect(balances.filter((g) => g === 1_000)).toHaveLength(4);
    const [{ n }] = (await ctx.db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.marketplaceTransactions)
      .where(eq(schema.marketplaceTransactions.listingId, listing.id))) as [{ n: number }];
    expect(n).toBe(1);
  });

  it('refuses locked, bound and non-marketplace items', async () => {
    const p = await makePlayer(ctx);
    const sword = await give(p, 'weapon.sword.iron_longsword');
    const locked = await setItemFlags(ctx, {
      accountId: p.accountId,
      itemInstanceId: sword.instance.id,
      locked: true,
    });
    await expectCode(list(p, locked), 'ITEM_LOCKED');
    await expectCode(list(p, await give(p, 'accessory.trinket.ember_heart')), 'ITEM_NOT_TRADEABLE');
    await expectCode(list(p, await give(p, 'quest.misc.elders_letter')), 'ITEM_NOT_TRADEABLE');
    await expectCode(
      createListing(ctx, {
        actor: actorOf(p),
        itemInstanceId: sword.instance.id,
        price: 10,
        durationHours: 7,
      }),
      'VALIDATION_FAILED',
    );
  });

  it('expires listings and returns the item to the seller', async () => {
    const seller = await makePlayer(ctx);
    const sword = await give(seller, 'weapon.sword.iron_longsword');
    const listing = await list(seller, sword);
    const future = createDomainContext({
      db: ctx.db,
      gameData: ctx.gameData,
      now: () => new Date(Date.now() + 25 * 3_600_000),
    });
    const buyer = await makePlayer(ctx);
    await expectCode(
      buyListing(future, { actor: actorOf(buyer), listingId: listing.id, expectedPrice: 500 }),
      'LISTING_NOT_ACTIVE',
    );
    expect(await expireListings(future)).toBeGreaterThanOrEqual(1);
    const [row] = await ctx.db
      .select()
      .from(schema.marketplaceListings)
      .where(eq(schema.marketplaceListings.id, listing.id));
    expect(row!.status).toBe('expired');
    const inv = await getCharacterItems(ctx.db, ctx, seller.accountId, seller.characterId);
    expect(
      inv.containers.flatMap((c) => c.items).some((i) => i.instance.id === sword.instance.id),
    ).toBe(true);
  });
});

describe('currency ledger', () => {
  it('rejects overdrafts and keeps the ledger consistent with the balance', async () => {
    const p = await makePlayer(ctx);
    await expectCode(
      inTransaction(ctx, (tx) =>
        adjustBalanceInTx(tx, ctx, {
          currencyId: 'gold',
          accountId: p.accountId,
          characterId: p.characterId,
          delta: -1_001,
          reason: 'vendor',
        }),
      ),
      'INSUFFICIENT_FUNDS',
    );
    await inTransaction(ctx, (tx) =>
      adjustBalanceInTx(tx, ctx, {
        currencyId: 'gold',
        accountId: p.accountId,
        characterId: p.characterId,
        delta: -250,
        reason: 'vendor',
      }),
    );
    const [{ total }] = (await ctx.db
      .select({ total: sql<number>`coalesce(sum(${schema.currencyLedger.delta}), 0)::bigint` })
      .from(schema.currencyLedger)
      .where(
        and(
          eq(schema.currencyLedger.ownerCharacterId, p.characterId),
          eq(schema.currencyLedger.currencyId, 'gold'),
        ),
      )) as [{ total: number }];
    expect(Number(total)).toBe(750);
    expect(await gold(p)).toBe(750);
  });
});

it('paginates equal-price offers, exposes exact escrowed rolls, and retains private expired/closed listings', async () => {
  const seller = await makePlayer(ctx);
  const items = await Promise.all(
    Array.from({ length: 3 }, () => give(seller, 'weapon.sword.iron_longsword')),
  );
  const listings = [];
  for (const item of items) listings.push(await list(seller, item, 100));
  const first = await browseListings(ctx.db, ctx.now(), {
    sellerAccountId: seller.accountId,
    limit: 2,
  });
  const second = await browseListings(ctx.db, ctx.now(), {
    sellerAccountId: seller.accountId,
    limit: 2,
    afterPrice: first[1]!.price,
    afterId: first[1]!.id,
  });
  expect([...first, ...second].map((l) => l.id)).toEqual(listings.map((l) => l.id).sort());
  const offer = await getListingOffer(ctx, listings[0]!.id);
  expect(offer.item.instance).toMatchObject({
    id: items[0]!.instance.id,
    stats: items[0]!.instance.stats,
    modifiers: items[0]!.instance.modifiers,
    quantity: items[0]!.instance.quantity,
    location: { kind: 'marketplace_escrow', listingId: listings[0]!.id },
  });
  await cancelListing(ctx, { actor: actorOf(seller), listingId: listings[0]!.id });
  await expectCode(getListingOffer(ctx, listings[0]!.id), 'LISTING_NOT_ACTIVE');
  const future = createDomainContext({
    ...ctx,
    now: () => new Date(ctx.now().getTime() + 25 * 3600000),
  });
  expect(
    await browseListings(ctx.db, future.now(), { sellerAccountId: seller.accountId }),
  ).toHaveLength(0);
  await expectCode(getListingOffer(future, listings[1]!.id), 'LISTING_NOT_ACTIVE');
  expect((await ownListings(future, seller.accountId)).map((l) => l.status).sort()).toEqual([
    'active',
    'active',
    'cancelled',
  ]);
  const outsider = await makePlayer(ctx);
  expect(await ownListings(ctx, outsider.accountId)).toEqual([]);
});

it('checks the reviewed item version and serializes listing limits across concurrent alts', async () => {
  const seller = await makePlayer(ctx);
  const alt = {
    accountId: seller.accountId,
    characterId: await addCharacter(ctx, seller.accountId),
  };
  const a = await give(seller, 'weapon.sword.iron_longsword'),
    b = await give(alt, 'weapon.sword.iron_longsword');
  const limited = createDomainContext({
    ...ctx,
    gameData: GameData.load({
      ...ctx.gameData.raw,
      marketplaceRules: { ...ctx.gameData.raw.marketplaceRules, maxActiveListingsPerAccount: 1 },
    }),
  });
  const create = (p: TestPlayer, item: Item, version = item.instance.version) =>
    createListing(limited, {
      actor: actorOf(p),
      itemInstanceId: item.instance.id,
      expectedVersion: version,
      price: 100,
      durationHours: 12,
    });
  await expectCode(create(seller, a, a.instance.version + 1), 'CONFLICT');
  const before = (await gold(seller)) + (await gold(alt));
  const outcomes = await Promise.allSettled([create(seller, a), create(alt, b)]);
  expect(outcomes.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
  expect(outcomes.filter((x) => x.status === 'rejected')).toHaveLength(1);
  expect(await ownListings(ctx, seller.accountId)).toHaveLength(1);
  expect((await gold(seller)) + (await gold(alt))).toBe(before - 10);
  const owned = await Promise.all(
    [seller, alt].map((p) => getCharacterItems(ctx.db, ctx, p.accountId, p.characterId)),
  );
  expect(
    owned
      .flatMap((i) => i.containers.flatMap((c) => c.items))
      .filter((i) => [a.instance.id, b.instance.id].includes(i.instance.id)),
  ).toHaveLength(1);
});
