import { and, asc, desc, eq, gt, inArray, isNull, or, sql } from 'drizzle-orm';
import { schema } from '@mmo/db';
import type { Tx } from '@mmo/db';
import { defaultContainerKindFor, isCurrentlyTradeable } from '@mmo/game-data';
import { DirectTradeSchema, TradeActionSchema } from '@mmo/schemas';
import type { DirectTrade, Item, ItemLocation, TradeAction, TradeSide } from '@mmo/schemas';
import { DomainError, ErrorCode } from '@mmo/shared';
import type { DomainContext } from './context';
import { firstFreeSlot, lockContainers, occupiedSlots } from './containers';
import { adjustBalanceInTx, getBalances, lockWallets } from './currency';
import { recordAudit, recordItemHistory } from './history';
import { requireOwnedCharacter } from './items';
import type { ItemRow } from './items';
import { bindingFromRow, itemViewFromRow, locationColumns } from './mappers';
import { inTransaction } from './tx';

type Trader = { accountId: string; characterId: string; requestId?: string };
type TradeRow = typeof schema.directTrades.$inferSelect;
const active = ['open', 'locked'];
const fail = (message: string): never => {
  throw new DomainError(ErrorCode.CONFLICT, message);
};
const participant = (id: string) =>
  or(eq(schema.directTrades.initiatorId, id), eq(schema.directTrades.counterpartyId, id));

function view(row: TradeRow, now: Date): DirectTrade {
  return DirectTradeSchema.parse({
    ...row,
    status: active.includes(row.status) && row.expiresAt <= now ? 'expired' : row.status,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
  });
}

async function lockCharacters(tx: Tx, ids: string[]) {
  const rows = await tx
    .select()
    .from(schema.characters)
    .where(and(inArray(schema.characters.id, ids), isNull(schema.characters.deletedAt)))
    .orderBy(asc(schema.characters.id))
    .for('update');
  if (rows.length !== 2) fail('A trading character is no longer available');
  const accounts = await tx
    .select()
    .from(schema.accounts)
    .where(
      inArray(
        schema.accounts.id,
        rows.map((r) => r.accountId),
      ),
    );
  if (accounts.some((a) => a.status !== 'active')) fail('A trading account is unavailable');
  return rows;
}

export async function listDirectTrades(ctx: DomainContext, actor: Trader): Promise<DirectTrade[]> {
  await requireOwnedCharacter(ctx.db, actor.accountId, actor.characterId);
  const rows = await ctx.db
    .select()
    .from(schema.directTrades)
    .where(participant(actor.characterId))
    .orderBy(desc(schema.directTrades.createdAt))
    .limit(20);
  return rows.map((row) => view(row, ctx.now()));
}

export async function createDirectTrade(
  ctx: DomainContext,
  actor: Trader,
  targetName: string,
  requestId: string,
): Promise<DirectTrade> {
  return inTransaction(ctx, async (tx) => {
    await requireOwnedCharacter(tx, actor.accountId, actor.characterId);
    const [target] = await tx
      .select()
      .from(schema.characters)
      .where(
        and(
          sql`lower(${schema.characters.name}) = lower(${targetName})`,
          isNull(schema.characters.deletedAt),
        ),
      );
    if (!target) throw new DomainError(ErrorCode.NOT_FOUND, 'Character not found');
    if (target.accountId === actor.accountId) fail('Trade with a character on another account');
    const characters = await lockCharacters(tx, [actor.characterId, target.id]);
    const [existing] = await tx
      .select()
      .from(schema.directTrades)
      .where(eq(schema.directTrades.id, requestId));
    if (existing) {
      if (existing.initiatorId !== actor.characterId || existing.counterpartyId !== target.id)
        fail('Request ID already used');
      return view(existing, ctx.now());
    }
    const now = ctx.now();
    const pending = await tx
      .select({ id: schema.directTrades.id })
      .from(schema.directTrades)
      .where(
        and(
          or(participant(actor.characterId), participant(target.id)),
          inArray(schema.directTrades.status, active),
          gt(schema.directTrades.expiresAt, now),
        ),
      )
      .limit(1);
    if (pending.length) fail('One of you already has an open trade. Complete or cancel it first');
    const makeSide = (id: string): TradeSide => ({
      characterId: id,
      name: characters.find((c) => c.id === id)!.name,
      items: [],
      copper: 0,
      locked: false,
      accepted: false,
    });
    const sides: [TradeSide, TradeSide] = [makeSide(actor.characterId), makeSide(target.id)];
    const [row] = await tx
      .insert(schema.directTrades)
      .values({
        id: requestId,
        initiatorId: actor.characterId,
        counterpartyId: target.id,
        sides,
        createdAt: now,
        expiresAt: new Date(now.getTime() + 5 * 60_000),
      })
      .returning();
    return view(row!, now);
  });
}

/** Locks and snapshots precisely the items the client reviewed, never trusting client item data. */
async function offeredItems(
  tx: Tx,
  ctx: DomainContext,
  actor: Trader,
  wanted: { id: string; version: number }[],
): Promise<Item[]> {
  if (new Set(wanted.map((i) => i.id)).size !== wanted.length)
    fail('An item cannot be offered twice');
  if (!wanted.length) return [];
  const rows = await tx
    .select()
    .from(schema.itemInstances)
    .where(
      inArray(
        schema.itemInstances.id,
        wanted.map((i) => i.id),
      ),
    )
    .orderBy(asc(schema.itemInstances.id))
    .for('update');
  if (rows.length !== wanted.length) fail('An offered item is missing');
  const containers = await lockContainers(
    tx,
    rows.flatMap((r) => (r.containerId ? [r.containerId] : [])),
  );
  return rows.map((row) => {
    const container = row.containerId ? containers.get(row.containerId) : undefined;
    if (
      row.ownerAccountId !== actor.accountId ||
      row.ownerCharacterId !== actor.characterId ||
      row.locationKind !== 'container' ||
      container?.ownerCharacterId !== actor.characterId ||
      !['backpack', 'material_pouch'].includes(container?.kind ?? '')
    )
      fail('Offer only items in your own bags');
    if (row.version !== wanted.find((i) => i.id === row.id)!.version)
      fail('An offered item changed. Update the offer and review it again');
    if (
      row.isLocked ||
      !isCurrentlyTradeable(ctx.gameData.template(row.templateId), bindingFromRow(row))
    )
      fail('An offered item is locked or bound');
    return itemViewFromRow(ctx.gameData, row, new Map([[container!.id, container!.kind]]));
  });
}

async function complete(
  tx: Tx,
  ctx: DomainContext,
  trade: DirectTrade,
  actor: Trader,
  characters: Awaited<ReturnType<typeof lockCharacters>>,
) {
  const actorFor = (side: TradeSide): Trader => ({
    accountId: characters.find((c) => c.id === side.characterId)!.accountId,
    characterId: side.characterId,
  });
  // Sorted character locks prevent competing trades/equipment actions. Item versions also protect
  // against vendors, stack merges, flags, marketplace listing and any other ownership mutation.
  for (const side of trade.sides)
    await offeredItems(
      tx,
      ctx,
      actorFor(side),
      side.items.map((i) => ({ id: i.instance.id, version: i.instance.version })),
    );
  const bags = await tx
    .select()
    .from(schema.containers)
    .where(
      and(
        inArray(
          schema.containers.ownerCharacterId,
          characters.map((c) => c.id),
        ),
        inArray(schema.containers.kind, ['backpack', 'material_pouch']),
      ),
    );
  await lockContainers(
    tx,
    bags.map((b) => b.id),
  );
  const occupancy = new Map<string, Set<number>>();
  for (const bag of bags) occupancy.set(bag.id, await occupiedSlots(tx, bag.id));
  for (const side of trade.sides)
    for (const item of side.items) {
      const loc = item.instance.location;
      if (loc.kind === 'container') occupancy.get(loc.containerId)!.delete(loc.slot);
    }
  const destinations = new Map<string, ItemLocation>();
  for (const [index, side] of trade.sides.entries())
    for (const item of side.items) {
      const recipient = trade.sides[index === 0 ? 1 : 0];
      const bag = bags.find(
        (b) =>
          b.ownerCharacterId === recipient.characterId &&
          b.kind === defaultContainerKindFor(item.template),
      );
      if (!bag) fail('Recipient bag is unavailable');
      const used = occupancy.get(bag!.id)!;
      const slot = firstFreeSlot(bag!.capacity, used);
      if (slot === undefined)
        throw new DomainError(
          ErrorCode.CONTAINER_FULL,
          `${recipient.name} needs space in their ${bag!.kind.replace('_', ' ')}`,
        );
      used.add(slot);
      destinations.set(item.instance.id, {
        kind: 'container',
        containerId: bag!.id,
        containerKind: bag!.kind,
        slot,
      });
    }
  const keys = trade.sides.map((s) => ({ ...actorFor(s), currencyId: 'gold' }));
  await lockWallets(tx, ctx, keys);
  for (const side of trade.sides) {
    const p = actorFor(side);
    const balance =
      (await getBalances(tx, p.accountId, p.characterId)).find((b) => b.currencyId === 'gold')
        ?.amount ?? 0;
    if (balance < side.copper)
      throw new DomainError(
        ErrorCode.INSUFFICIENT_FUNDS,
        `${side.name} no longer has the offered copper`,
      );
  }
  for (const [index, side] of trade.sides.entries()) {
    const delta = trade.sides[index === 0 ? 1 : 0].copper - side.copper;
    if (delta)
      await adjustBalanceInTx(tx, ctx, {
        ...actorFor(side),
        currencyId: 'gold',
        delta,
        reason: 'trade',
        correlationId: trade.id,
      });
  }
  // Transaction-local escrow frees outgoing slots before incoming placement, including full-bag swaps.
  const ids = trade.sides.flatMap((s) => s.items.map((i) => i.instance.id));
  if (ids.length)
    await tx
      .update(schema.itemInstances)
      .set(locationColumns({ kind: 'trade_escrow', tradeId: trade.id }))
      .where(inArray(schema.itemInstances.id, ids));
  const now = ctx.now();
  for (const [index, side] of trade.sides.entries())
    for (const item of side.items) {
      const recipient = actorFor(trade.sides[index === 0 ? 1 : 0]);
      const to = destinations.get(item.instance.id)!;
      const patch: Partial<ItemRow> = {
        ...locationColumns(to),
        ownerAccountId: recipient.accountId,
        ownerCharacterId: recipient.characterId,
        version: item.instance.version + 1,
        updatedAt: now,
      };
      await tx
        .update(schema.itemInstances)
        .set(patch)
        .where(eq(schema.itemInstances.id, item.instance.id));
      await recordItemHistory(tx, [
        {
          itemInstanceId: item.instance.id,
          eventType: 'traded',
          actor,
          fromOwnerAccountId: actorFor(side).accountId,
          toOwnerAccountId: recipient.accountId,
          fromLocation: item.instance.location,
          toLocation: to,
          quantity: item.instance.quantity,
          correlationId: trade.id,
          occurredAt: now,
        },
      ]);
    }
  await recordAudit(tx, {
    actor,
    action: 'trade.completed',
    targetType: 'trade',
    targetId: trade.id,
    details: {
      revision: trade.revision,
      characters: trade.sides.map((s) => s.characterId),
      items: ids,
    },
    at: now,
  });
}

export async function actOnDirectTrade(
  ctx: DomainContext,
  actor: Trader,
  tradeId: string,
  raw: TradeAction,
): Promise<DirectTrade> {
  const input = TradeActionSchema.parse(raw);
  return inTransaction(ctx, async (tx) => {
    await requireOwnedCharacter(tx, actor.accountId, actor.characterId);
    const [row] = await tx
      .select()
      .from(schema.directTrades)
      .where(and(eq(schema.directTrades.id, tradeId), participant(actor.characterId)))
      .for('update');
    if (!row) throw new DomainError(ErrorCode.NOT_FOUND, 'Trade not found');
    const trade = view(row, ctx.now());
    const side = trade.sides.find((s) => s.characterId === actor.characterId)!;
    if (trade.revision !== input.revision)
      fail('The offer changed. Review the latest trade before continuing');
    if (input.action === 'confirm' && trade.status === 'completed') return trade;
    if (input.action === 'cancel' && trade.status === 'cancelled') return trade;
    if (!active.includes(trade.status)) fail(`Trade is ${trade.status}`);
    const characters = await lockCharacters(
      tx,
      trade.sides.map((s) => s.characterId),
    );
    if (input.action === 'cancel') trade.status = 'cancelled';
    else if (input.action === 'offer') {
      side.items = await offeredItems(tx, ctx, actor, input.offer.items);
      side.copper = input.offer.copper;
      trade.revision++;
      trade.status = 'open';
      for (const s of trade.sides) {
        s.locked = false;
        s.accepted = false;
      }
    } else if (input.action === 'lock') {
      side.locked = true;
      if (trade.sides.every((s) => s.locked)) trade.status = 'locked';
    } else {
      if (trade.status !== 'locked' || !trade.sides.every((s) => s.locked))
        fail('Both players must lock their offers before confirming');
      if (!trade.sides.some((s) => s.items.length || s.copper))
        fail('Add items or copper before confirming');
      side.accepted = true;
      if (trade.sides.every((s) => s.accepted)) {
        await complete(tx, ctx, trade, actor, characters);
        trade.status = 'completed';
        trade.completedAt = ctx.now().toISOString();
      }
    }
    await tx
      .update(schema.directTrades)
      .set({
        status: trade.status,
        revision: trade.revision,
        sides: trade.sides,
        completedAt: trade.completedAt ? new Date(trade.completedAt) : null,
      })
      .where(eq(schema.directTrades.id, trade.id));
    return trade;
  });
}
