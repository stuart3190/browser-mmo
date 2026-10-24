import { and, eq, gt, sql } from 'drizzle-orm';
import { schema, type Tx } from '@mmo/db';
import { canRepairAt, conditionRules, repairCost } from '@mmo/game-data';
import { DomainError, ErrorCode, uuidv7 } from '@mmo/shared';
import type { DomainContext } from './context';
import { requireOwnedCharacter } from './items';
import { inTransaction } from './tx';
import { adjustBalanceInTx, getBalances } from './currency';
import { recordItemHistory } from './history';
import { itemViews } from './mappers';

/** Called only inside the exactly-once kill reward transaction. Never wear bags or vaulted gear. */
export async function wearEquipmentInTx(
  tx: Tx,
  ctx: DomainContext,
  characterId: string,
  killId: string,
) {
  const worn = await tx
    .update(schema.itemInstances)
    .set({
      durabilityCurrent: sql`greatest(0, ${schema.itemInstances.durabilityCurrent} - ${conditionRules.wearPerVictory})`,
      version: sql`${schema.itemInstances.version} + 1`,
      updatedAt: ctx.now(),
    })
    .where(
      and(
        eq(schema.itemInstances.equipCharacterId, characterId),
        eq(schema.itemInstances.locationKind, 'equipped'),
        gt(schema.itemInstances.durabilityCurrent, 0),
        eq(schema.itemInstances.isLocked, false),
      ),
    )
    .returning();
  await recordItemHistory(
    tx,
    worn.map((item) => ({
      itemInstanceId: item.id,
      eventType: 'modified' as const,
      details: { reason: 'battle_wear', condition: item.durabilityCurrent, killId },
      actor: { accountId: item.ownerAccountId, characterId },
      quantity: 1,
      correlationId: killId,
      occurredAt: ctx.now(),
    })),
  );
}

/** Owning realtime host checks life, NPC distance and combat. Quote cap prevents surprise charges. */
export async function repairAtNpc(
  ctx: DomainContext,
  input: {
    accountId: string;
    characterId: string;
    npcId: string;
    requestId: string;
    maxCopper: number;
  },
) {
  if (!canRepairAt(ctx.gameData.raw.serviceOffers ?? [], input.npcId))
    throw new DomainError(ErrorCode.WRONG_NPC, 'This person cannot repair equipment');
  if (!Number.isSafeInteger(input.maxCopper) || input.maxCopper < 0)
    throw new DomainError(ErrorCode.VALIDATION_FAILED, 'Invalid repair quote');
  return inTransaction(ctx, async (tx) => {
    await requireOwnedCharacter(tx, input.accountId, input.characterId);
    await tx
      .select({ id: schema.characters.id })
      .from(schema.characters)
      .where(eq(schema.characters.id, input.characterId))
      .for('update');
    const operation = `repair:${input.npcId}`;
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
      return {
        items: [],
        balances: await getBalances(tx, input.accountId, input.characterId),
        duplicate: true,
      };
    }
    const equipped = await tx
      .select()
      .from(schema.itemInstances)
      .where(
        and(
          eq(schema.itemInstances.equipCharacterId, input.characterId),
          eq(schema.itemInstances.ownerAccountId, input.accountId),
          eq(schema.itemInstances.ownerCharacterId, input.characterId),
          eq(schema.itemInstances.locationKind, 'equipped'),
          eq(schema.itemInstances.isLocked, false),
        ),
      )
      .orderBy(schema.itemInstances.id)
      .for('update');
    const damaged = equipped.filter(
      (i) =>
        i.durabilityCurrent !== null &&
        i.durabilityMax !== null &&
        i.durabilityCurrent < i.durabilityMax,
    );
    const cost = repairCost(
      damaged.map((i) => ({ current: i.durabilityCurrent!, max: i.durabilityMax! })),
    );
    if (cost > input.maxCopper)
      throw new DomainError(ErrorCode.CONFLICT, 'Equipment changed; check the repair price again');
    const correlationId = uuidv7();
    if (cost > 0)
      await adjustBalanceInTx(tx, ctx, {
        accountId: input.accountId,
        characterId: input.characterId,
        currencyId: 'gold',
        delta: -cost,
        reason: 'vendor',
        correlationId,
      });
    const changed = [];
    for (const item of damaged) {
      const [repaired] = await tx
        .update(schema.itemInstances)
        .set({
          durabilityCurrent: item.durabilityMax,
          version: item.version + 1,
          updatedAt: ctx.now(),
        })
        .where(eq(schema.itemInstances.id, item.id))
        .returning();
      changed.push(repaired!);
    }
    await recordItemHistory(
      tx,
      changed.map((item) => ({
        itemInstanceId: item.id,
        eventType: 'modified' as const,
        details: { reason: 'repair', condition: item.durabilityCurrent, npcId: input.npcId },
        actor: input,
        quantity: 1,
        correlationId,
        occurredAt: ctx.now(),
      })),
    );
    await tx
      .insert(schema.serviceReceipts)
      .values({ characterId: input.characterId, requestId: input.requestId, offerId: operation });
    return {
      items: await itemViews(tx, ctx.gameData, changed),
      balances: await getBalances(tx, input.accountId, input.characterId),
      duplicate: false,
    };
  });
}
