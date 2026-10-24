import { describe, expect, it } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import { schema } from '@mmo/db';
import type { DirectTrade, Item } from '@mmo/schemas';
import { uuidv7 } from '@mmo/shared';
import {
  actOnDirectTrade,
  createDirectTrade,
  listDirectTrades,
  createDomainContext,
  getBalances,
  getCharacterItems,
  grantItemInTx,
  inTransaction,
  moveItem,
  setItemFlags,
  adjustBalanceInTx,
  createListing,
} from '../src/index';
import { makePlayer, setupContext, expectCode, containerId } from './helpers';
import type { TestPlayer } from './helpers';
const ctx = setupContext();
const gold = async (p: TestPlayer) =>
  (await getBalances(ctx.db, p.accountId, p.characterId)).find((b) => b.currencyId === 'gold')!
    .amount;
async function give(p: TestPlayer, templateId = 'weapon.sword.iron_longsword') {
  const { created } = await inTransaction(ctx, (tx) =>
    grantItemInTx(tx, ctx, {
      ...p,
      templateId,
      quantity: 1,
      method: 'system',
      actor: { accountId: null, characterId: null },
    }),
  );
  return (await getCharacterItems(ctx.db, ctx, p.accountId, p.characterId)).containers
    .flatMap((c) => c.items)
    .find((i) => i.instance.id === created.id)!;
}
async function pair() {
  const a = await makePlayer(ctx),
    b = await makePlayer(ctx);
  const [target] = await ctx.db
    .select()
    .from(schema.characters)
    .where(eq(schema.characters.id, b.characterId));
  const trade = await createDirectTrade(ctx, a, target!.name, uuidv7());
  return { a, b, trade, name: target!.name };
}
const offer = (p: TestPlayer, t: DirectTrade, items: Item[] = [], copper = 0) =>
  actOnDirectTrade(ctx, p, t.id, {
    action: 'offer',
    revision: t.revision,
    offer: {
      copper,
      items: items.map((i) => ({ id: i.instance.id, version: i.instance.version })),
    },
  });
const action = (p: TestPlayer, t: DirectTrade, action: 'lock' | 'confirm' | 'cancel') =>
  actOnDirectTrade(ctx, p, t.id, { action, revision: t.revision });
async function locked(a: TestPlayer, b: TestPlayer, t: DirectTrade) {
  await action(a, t, 'lock');
  return action(b, t, 'lock');
}

describe('direct trading', () => {
  it('serializes marketplace listing against trade settlement without duplicating the instance', async () => {
    const { a, b, trade } = await pair();
    const sword = await give(a);
    let t = await offer(a, trade, [sword]);
    t = await offer(b, t, [], 100);
    t = await locked(a, b, t);
    await action(a, t, 'confirm');
    const result = await Promise.allSettled([
      action(b, t, 'confirm'),
      createListing(ctx, {
        actor: a,
        itemInstanceId: sword.instance.id,
        price: 100,
        durationHours: 24,
      }),
    ]);
    expect(result.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const [item] = await ctx.db
      .select()
      .from(schema.itemInstances)
      .where(eq(schema.itemInstances.id, sword.instance.id));
    const completed = (await listDirectTrades(ctx, a))[0]!.status === 'completed';
    expect(item!.ownerCharacterId).toBe(completed ? b.characterId : a.characterId);
    expect(item!.locationKind).toBe(completed ? 'container' : 'marketplace_escrow');
    expect(await gold(b)).toBe(completed ? 900 : 1000);
  });

  it('rolls back the first wallet debit when the second wallet would exceed its cap', async () => {
    const { a, b, trade } = await pair();
    const cap = ctx.gameData.currencies.get('gold')!.maxBalance;
    await inTransaction(ctx, (tx) =>
      adjustBalanceInTx(tx, ctx, {
        ...b,
        currencyId: 'gold',
        delta: cap - 1000,
        reason: 'admin_adjustment',
      }),
    );
    let t = await offer(a, trade, [], 100);
    t = await locked(a, b, t);
    await action(a, t, 'confirm');
    await expectCode(action(b, t, 'confirm'), 'CONFLICT');
    expect(await gold(a)).toBe(1000);
    expect(await gold(b)).toBe(cap);
    expect(
      await ctx.db
        .select()
        .from(schema.currencyLedger)
        .where(eq(schema.currencyLedger.correlationId, t.id)),
    ).toHaveLength(0);
    expect((await listDirectTrades(ctx, b))[0]!.sides[1].accepted).toBe(false);
  });

  it('persists reviewed offers and transfers each instance and ledger payment once under concurrent confirmation', async () => {
    const { a, b, trade } = await pair();
    const sword = await give(a),
      staff = await give(b, 'weapon.staff.oak_staff');
    let t = await offer(a, trade, [sword], 100);
    t = await offer(b, t, [staff], 30);
    expect((await listDirectTrades(ctx, b))[0]!.sides[0].items[0]!.instance.id).toBe(
      sword.instance.id,
    );
    t = await locked(a, b, t);
    await action(a, t, 'confirm');
    const results = await Promise.all(Array.from({ length: 6 }, () => action(b, t, 'confirm')));
    expect(results.every((r) => r.status === 'completed')).toBe(true);
    expect(await gold(a)).toBe(930);
    expect(await gold(b)).toBe(1070);
    const [item] = await ctx.db
      .select()
      .from(schema.itemInstances)
      .where(eq(schema.itemInstances.id, sword.instance.id));
    expect(item).toMatchObject({
      ownerAccountId: b.accountId,
      ownerCharacterId: b.characterId,
      originalOwnerAccountId: a.accountId,
      locationKind: 'container',
    });
    const history = await ctx.db
      .select()
      .from(schema.itemHistory)
      .where(
        and(eq(schema.itemHistory.correlationId, t.id), eq(schema.itemHistory.eventType, 'traded')),
      );
    expect(history).toHaveLength(2);
    const ledger = await ctx.db
      .select()
      .from(schema.currencyLedger)
      .where(eq(schema.currencyLedger.correlationId, t.id));
    expect(ledger).toHaveLength(2);
    expect(ledger.reduce((n, r) => n + r.delta, 0)).toBe(0);
  });

  it('clears both locks and confirmations when an offer changes and rejects old revision consent', async () => {
    const { a, b, trade } = await pair();
    let t = await offer(a, trade, [], 50);
    t = await locked(a, b, t);
    await action(a, t, 'confirm');
    const changed = await offer(b, t, [], 1);
    expect(changed.sides.every((s) => !s.locked && !s.accepted)).toBe(true);
    await expectCode(action(b, t, 'confirm'), 'CONFLICT');
    await expectCode(action(a, changed, 'confirm'), 'CONFLICT');
    expect(await gold(a)).toBe(1000);
  });

  it('rejects changed item versions at settlement without transferring money or the other offer', async () => {
    const { a, b, trade } = await pair();
    const sword = await give(a);
    let t = await offer(a, trade, [sword]);
    t = await offer(b, t, [], 100);
    t = await locked(a, b, t);
    await action(a, t, 'confirm');
    await moveItem(ctx, {
      ...a,
      request: {
        itemInstanceId: sword.instance.id,
        expectedVersion: sword.instance.version,
        to: { kind: 'container', containerId: await containerId(ctx, a, 'character_vault') },
      },
    });
    await expectCode(action(b, t, 'confirm'), 'CONFLICT');
    expect(await gold(a)).toBe(1000);
    expect(await gold(b)).toBe(1000);
    expect((await listDirectTrades(ctx, a))[0]!.status).toBe('locked');
  });

  it('rolls back an insufficient-funds settlement and allows a new reviewed offer', async () => {
    const { a, b, trade } = await pair();
    let t = await offer(a, trade, [], 800);
    t = await locked(a, b, t);
    await action(b, t, 'confirm');
    await inTransaction(ctx, (tx) =>
      adjustBalanceInTx(tx, ctx, { ...a, currencyId: 'gold', delta: -500, reason: 'vendor' }),
    );
    await expectCode(action(a, t, 'confirm'), 'INSUFFICIENT_FUNDS');
    expect(await gold(b)).toBe(1000);
    expect(await gold(a)).toBe(500);
    t = await offer(a, t, [], 100);
    t = await locked(a, b, t);
    await action(b, t, 'confirm');
    expect((await action(a, t, 'confirm')).status).toBe('completed');
  });

  it('allows a full-bag swap and fails atomically when a recipient lacks capacity', async () => {
    const { a, b, trade } = await pair();
    const sword = await give(a),
      other = await give(b);
    for (const p of [a, b])
      await ctx.db
        .update(schema.containers)
        .set({ capacity: 1 })
        .where(eq(schema.containers.id, await containerId(ctx, p, 'backpack')));
    let t = await offer(a, trade, [sword]);
    t = await locked(a, b, t);
    await action(a, t, 'confirm');
    await expectCode(action(b, t, 'confirm'), 'CONTAINER_FULL');
    expect(
      (
        await ctx.db
          .select()
          .from(schema.itemInstances)
          .where(eq(schema.itemInstances.id, sword.instance.id))
      )[0]!.ownerCharacterId,
    ).toBe(a.characterId);
    t = await offer(b, t, [other]);
    t = await locked(a, b, t);
    await action(a, t, 'confirm');
    expect((await action(b, t, 'confirm')).status).toBe('completed');
  });

  it('rejects foreign, bound, locked and duplicate item offers', async () => {
    const { a, b, trade } = await pair();
    const sword = await give(a),
      foreign = await give(b);
    await expectCode(offer(a, trade, [foreign]), 'CONFLICT');
    await expectCode(offer(a, trade, [sword, sword]), 'CONFLICT');
    await setItemFlags(ctx, {
      accountId: a.accountId,
      itemInstanceId: sword.instance.id,
      locked: true,
    });
    await expectCode(offer(a, trade, [sword]), 'CONFLICT');
    const bound = await give(a, 'accessory.cloak.oathkeepers_mantle');
    await expectCode(offer(a, trade, [bound]), 'CONFLICT');
  });

  it('protects private trades, handles cancellation, request replay and expiry without stranded assets', async () => {
    const { a, b, trade, name } = await pair();
    const stranger = await makePlayer(ctx);
    expect((await createDirectTrade(ctx, a, name, trade.id)).id).toBe(trade.id);
    await expectCode(action(stranger, trade, 'lock'), 'NOT_FOUND');
    await expectCode(
      listDirectTrades(ctx, { ...stranger, characterId: a.characterId }),
      'NOT_FOUND',
    );
    await action(b, trade, 'cancel');
    await expectCode(action(a, trade, 'confirm'), 'CONFLICT');
    const next = await createDirectTrade(ctx, a, name, uuidv7());
    const future = createDomainContext({
      db: ctx.db,
      gameData: ctx.gameData,
      now: () => new Date(Date.parse(next.expiresAt) + 1),
    });
    expect((await listDirectTrades(future, a))[0]!.status).toBe('expired');
    await expectCode(
      actOnDirectTrade(future, a, next.id, { action: 'lock', revision: 0 }),
      'CONFLICT',
    );
  });

  it('serializes overlapping trade creation and refuses empty confirmation', async () => {
    const { a, b, trade, name } = await pair();
    await action(a, trade, 'cancel');
    const requests = await Promise.allSettled(
      Array.from({ length: 5 }, () => createDirectTrade(ctx, a, name, uuidv7())),
    );
    expect(requests.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const t = (
      requests.find((r) => r.status === 'fulfilled') as PromiseFulfilledResult<DirectTrade>
    ).value;
    await locked(a, b, t);
    await expectCode(action(a, t, 'confirm'), 'CONFLICT');
    const result = await ctx.db.execute(
      sql`select count(*)::int n from item_instances where location_kind = 'trade_escrow'`,
    );
    expect(result.rows[0]!.n).toBe(0);
  });
});
