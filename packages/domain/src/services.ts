import { and, eq } from 'drizzle-orm';
import { schema } from '@mmo/db';
import { DomainError, ErrorCode, uuidv7 } from '@mmo/shared';
import type { DomainContext } from './context';
import {
  requireOwnedCharacter,
  consumeItemsInTx,
  grantItemInTx,
  sellBackpackItemInTx,
} from './items';
import { adjustBalanceInTx, getBalances } from './currency';
import { itemViews } from './mappers';
import { inTransaction } from './tx';
import { startCraftInTx } from './professions';

/** Caller is the owning realtime host and has validated NPC/life/range. No HTTP shortcut. */
export async function exchangeAtNpc(
  ctx: DomainContext,
  input: {
    accountId: string;
    characterId: string;
    npcId: string;
    offerId: string;
    requestId: string;
  },
) {
  const offer = ctx.gameData.raw.serviceOffers?.find((o) => o.id === input.offerId);
  if (!offer || offer.npcId !== input.npcId)
    throw new DomainError(ErrorCode.WRONG_NPC, 'This service is not offered here');
  return inTransaction(ctx, async (tx) => {
    const character = await requireOwnedCharacter(tx, input.accountId, input.characterId);
    await tx
      .select({ id: schema.characters.id })
      .from(schema.characters)
      .where(eq(schema.characters.id, character.id))
      .for('update');
    const [receipt] = await tx
      .select()
      .from(schema.serviceReceipts)
      .where(
        and(
          eq(schema.serviceReceipts.characterId, character.id),
          eq(schema.serviceReceipts.requestId, input.requestId),
        ),
      );
    if (receipt) {
      if (receipt.offerId !== offer.id)
        throw new DomainError(ErrorCode.CONFLICT, 'Request already used for a different exchange');
      return {
        items: [],
        balances: await getBalances(tx, input.accountId, character.id),
        duplicate: true,
      };
    }
    if (character.level < offer.minLevel)
      throw new DomainError(ErrorCode.FORBIDDEN, 'Level too low');
    const correlationId = uuidv7();
    const changed = [];
    for (const cost of offer.inputs)
      changed.push(
        ...(await consumeItemsInTx(tx, ctx, {
          characterId: character.id,
          templateId: cost.itemTemplateId,
          quantity: cost.quantity,
          containerKinds: ['material_pouch', 'backpack'],
          actor: input,
          reason: `service:${offer.kind}`,
          correlationId,
        })),
      );
    if (offer.copper !== 0)
      await adjustBalanceInTx(tx, ctx, {
        accountId: input.accountId,
        characterId: character.id,
        currencyId: 'gold',
        delta: offer.copper,
        reason: 'vendor',
        correlationId,
      });
    if (offer.kind === 'craft')
      await startCraftInTx(tx, character.id, offer.id, input.requestId, ctx);
    if (offer.output && offer.kind !== 'craft')
      changed.push(
        ...(
          await grantItemInTx(tx, ctx, {
            accountId: input.accountId,
            characterId: character.id,
            templateId: offer.output.itemTemplateId,
            quantity: offer.output.quantity,
            method: 'vendor_purchase',
            sourceRef: `service:${character.id}:${input.requestId}`,
            actor: input,
          })
        ).changed,
      );
    await tx
      .insert(schema.serviceReceipts)
      .values({ characterId: character.id, requestId: input.requestId, offerId: offer.id });
    return {
      items: await itemViews(tx, ctx.gameData, changed),
      balances: await getBalances(tx, input.accountId, character.id),
      duplicate: false,
    };
  });
}
export async function getDiscoveries(ctx: DomainContext, characterId: string) {
  return (
    await ctx.db
      .select({ id: schema.characterDiscoveries.locationId })
      .from(schema.characterDiscoveries)
      .where(eq(schema.characterDiscoveries.characterId, characterId))
  ).map((r) => r.id);
}
/** SERVER ONLY. Coordinates are sampled from the owned simulation, never a client claim. */
export async function discoverLocations(
  ctx: DomainContext,
  input: {
    characterId: string;
    zoneId: string;
    position: { x: number; y: number; z: number };
    health: number;
  },
) {
  if (input.health <= 0 || !Object.values(input.position).every(Number.isFinite)) return [];
  const places =
    ctx.gameData.raw.worldCatalog?.locations.filter(
      (l) =>
        l.zoneId === input.zoneId &&
        Math.hypot(l.position.x - input.position.x, l.position.z - input.position.z) <= 24,
    ) ?? [];
  if (!places.length) return [];
  return inTransaction(ctx, async (tx) => {
    const inserted = await tx
      .insert(schema.characterDiscoveries)
      .values(places.map((l) => ({ characterId: input.characterId, locationId: l.id })))
      .onConflictDoNothing()
      .returning({ id: schema.characterDiscoveries.locationId });
    return inserted.map((l) => l.id);
  });
}

/** Specific instance sale, gated by a currently implemented vendor catalog, not an NPC role claim. */
export async function sellAtNpc(
  ctx: DomainContext,
  input: {
    accountId: string;
    characterId: string;
    npcId: string;
    itemId: string;
    expectedVersion: number;
    requestId: string;
  },
) {
  if (!ctx.gameData.raw.serviceOffers?.some((o) => o.npcId === input.npcId && o.kind === 'buy'))
    throw new DomainError(ErrorCode.WRONG_NPC, 'This person does not buy equipment');
  const operation = `sale:${input.itemId}:${input.expectedVersion}`;
  return inTransaction(ctx, async (tx) => {
    await requireOwnedCharacter(tx, input.accountId, input.characterId);
    await tx
      .select({ id: schema.characters.id })
      .from(schema.characters)
      .where(eq(schema.characters.id, input.characterId))
      .for('update');
    const [receipt] = await tx
      .select()
      .from(schema.serviceReceipts)
      .where(
        and(
          eq(schema.serviceReceipts.characterId, input.characterId),
          eq(schema.serviceReceipts.requestId, input.requestId),
        ),
      );
    if (receipt) {
      if (receipt.offerId !== operation)
        throw new DomainError(ErrorCode.CONFLICT, 'Request already used');
      return { items: [], balances: await getBalances(tx, input.accountId, input.characterId) };
    }
    const correlationId = uuidv7();
    const { item, copper } = await sellBackpackItemInTx(tx, ctx, {
      ...input,
      actor: input,
      correlationId,
    });
    await adjustBalanceInTx(tx, ctx, {
      accountId: input.accountId,
      characterId: input.characterId,
      currencyId: 'gold',
      delta: copper,
      reason: 'vendor',
      correlationId,
    });
    await tx
      .insert(schema.serviceReceipts)
      .values({ characterId: input.characterId, requestId: input.requestId, offerId: operation });
    return {
      items: await itemViews(tx, ctx.gameData, [item]),
      balances: await getBalances(tx, input.accountId, input.characterId),
    };
  });
}
