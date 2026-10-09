import { and, eq, isNull, sql } from 'drizzle-orm';
import { schema, type Tx } from '@mmo/db';
import { DomainError, ErrorCode, uuidv7 } from '@mmo/shared';
import { professions, professionRank, toolFor, craftDuration, remedyEffect } from '@mmo/game-data';
import type { DomainContext } from './context';
import { inTransaction } from './tx';
import { requireOwnedCharacter, grantItemInTx } from './items';
import { ensureMailbox } from './containers';
import { recordItemHistory } from './history';

export async function addProfessionXp(
  tx: Tx,
  characterId: string,
  professionId: string,
  xp: number,
) {
  await tx
    .insert(schema.characterProfessions)
    .values({ characterId, professionId, xp })
    .onConflictDoUpdate({
      target: [schema.characterProfessions.characterId, schema.characterProfessions.professionId],
      set: { xp: sql`least(500, ${schema.characterProfessions.xp} + ${xp})` },
    });
}
export async function harvestSkill(tx: Tx, characterId: string, materialId: string) {
  const profession = professions.find((p) => p.materialId === materialId);
  if (!profession) return { professionId: null, tier: 0 };
  const [progress] = await tx
    .select()
    .from(schema.characterProfessions)
    .where(
      and(
        eq(schema.characterProfessions.characterId, characterId),
        eq(schema.characterProfessions.professionId, profession.id),
      ),
    );
  const tools = await tx
    .select({ templateId: schema.itemInstances.templateId })
    .from(schema.itemInstances)
    .innerJoin(schema.containers, eq(schema.itemInstances.containerId, schema.containers.id))
    .where(
      and(
        eq(schema.itemInstances.ownerCharacterId, characterId),
        eq(schema.itemInstances.locationKind, 'container'),
        eq(schema.containers.kind, 'backpack'),
        eq(schema.itemInstances.isLocked, false),
      ),
    );
  const tier =
    [2, 1].find(
      (t) =>
        (t === 1 || professionRank(progress?.xp ?? 0) >= 2) &&
        tools.some((i) => i.templateId === toolFor(profession.id, t)),
    ) ?? 0;
  return { professionId: profession.id, tier };
}
export async function professionState(ctx: DomainContext, characterId: string) {
  const progress = await ctx.db
    .select()
    .from(schema.characterProfessions)
    .where(eq(schema.characterProfessions.characterId, characterId));
  const jobs = await ctx.db
    .select()
    .from(schema.craftJobs)
    .where(eq(schema.craftJobs.characterId, characterId))
    .orderBy(sql`${schema.craftJobs.createdAt} desc`)
    .limit(10);
  return {
    professions: professions.map((p) => ({
      id: p.id,
      xp: progress.find((r) => r.professionId === p.id)?.xp ?? 0,
    })),
    jobs: jobs.map((j) => ({
      id: j.id,
      offerId: j.offerId,
      readyAtMs: j.readyAt.getTime(),
      completed: j.completedAt !== null,
    })),
  };
}
/** One active job. Receipt/costs/job all share the existing exchange transaction. */
export async function startCraftInTx(
  tx: Tx,
  characterId: string,
  offerId: string,
  id: string,
  ctx: DomainContext,
) {
  const [active] = await tx
    .select()
    .from(schema.craftJobs)
    .where(
      and(eq(schema.craftJobs.characterId, characterId), isNull(schema.craftJobs.completedAt)),
    );
  if (active) throw new DomainError(ErrorCode.CONFLICT, 'Finish your current craft first');
  const offer = ctx.gameData.raw.serviceOffers!.find((o) => o.id === offerId)!;
  const now = await tx.execute(sql`select clock_timestamp() as now`);
  await tx.insert(schema.craftJobs).values({
    id,
    characterId,
    offerId,
    readyAt: new Date(
      new Date((now.rows[0] as { now: Date }).now).getTime() + craftDuration(offer),
    ),
  });
}
/** Completion is safe to poll/replay/restart. Full bags deliver to Recovered; full mailbox rolls back. */
export async function finishCraft(
  ctx: DomainContext,
  input: { accountId: string; characterId: string; jobId: string },
) {
  return inTransaction(ctx, async (tx) => {
    await requireOwnedCharacter(tx, input.accountId, input.characterId);
    await tx
      .select({ id: schema.characters.id })
      .from(schema.characters)
      .where(eq(schema.characters.id, input.characterId))
      .for('update');
    const [job] = await tx
      .select()
      .from(schema.craftJobs)
      .where(
        and(
          eq(schema.craftJobs.id, input.jobId),
          eq(schema.craftJobs.characterId, input.characterId),
        ),
      )
      .for('update');
    if (!job) throw new DomainError(ErrorCode.NOT_FOUND, 'Craft job not found');
    if (job.completedAt) return false;
    const now = await tx.execute(sql`select clock_timestamp() as now`);
    if (job.readyAt > new Date((now.rows[0] as { now: Date }).now))
      throw new DomainError(ErrorCode.CONFLICT, 'Craft is still in progress');
    const offer = ctx.gameData.raw.serviceOffers?.find((o) => o.id === job.offerId);
    if (!offer?.output || offer.kind !== 'craft') throw new Error('Missing persisted craft recipe');
    const grant = {
      ...input,
      templateId: offer.output.itemTemplateId,
      quantity: offer.output.quantity,
      method: 'crafted' as const,
      sourceRef: `craft:${job.id}`,
      actor: input,
    };
    try {
      await tx.transaction((sp) => grantItemInTx(sp, ctx, grant));
    } catch (err) {
      if (!(err instanceof DomainError) || err.code !== ErrorCode.CONTAINER_FULL) throw err;
      await ensureMailbox(tx, input.accountId, input.characterId);
      await grantItemInTx(tx, ctx, { ...grant, containerKind: 'mailbox' });
    }
    await addProfessionXp(tx, input.characterId, 'crafting', 20);
    await tx
      .update(schema.craftJobs)
      .set({ completedAt: new Date((now.rows[0] as { now: Date }).now) })
      .where(eq(schema.craftJobs.id, job.id));
    return true;
  });
}
/** Exact instance, backpack-only. A durable effect waits until the host checkpoints its application. */
export async function consumeRemedy(
  ctx: DomainContext,
  input: { accountId: string; characterId: string; itemId: string; requestId: string },
) {
  return inTransaction(ctx, async (tx) => {
    await requireOwnedCharacter(tx, input.accountId, input.characterId);
    await tx
      .select({ id: schema.characters.id })
      .from(schema.characters)
      .where(eq(schema.characters.id, input.characterId))
      .for('update');
    const [receipt] = await tx
      .select()
      .from(schema.consumableUses)
      .where(eq(schema.consumableUses.id, input.requestId));
    if (receipt) {
      if (receipt.characterId !== input.characterId || receipt.itemId !== input.itemId)
        throw new DomainError(ErrorCode.CONFLICT, 'Request already used');
      return receipt;
    }
    const [cooldown] = await tx
      .select()
      .from(schema.consumableCooldowns)
      .where(eq(schema.consumableCooldowns.characterId, input.characterId));
    const clock = await tx.execute(sql`select clock_timestamp() as now`),
      now = new Date((clock.rows[0] as { now: Date }).now);
    if (cooldown && cooldown.readyAt > now)
      throw new DomainError(ErrorCode.CONFLICT, 'Remedy is cooling down');
    const [item] = await tx
      .select()
      .from(schema.itemInstances)
      .where(eq(schema.itemInstances.id, input.itemId))
      .for('update');
    const [bag] = item?.containerId
      ? await tx.select().from(schema.containers).where(eq(schema.containers.id, item.containerId))
      : [];
    if (
      !item ||
      item.ownerCharacterId !== input.characterId ||
      item.ownerAccountId !== input.accountId ||
      item.locationKind !== 'container' ||
      bag?.kind !== 'backpack' ||
      item.isLocked ||
      item.templateId !== remedyEffect.templateId
    )
      throw new DomainError(ErrorCode.FORBIDDEN, 'Select an unlocked remedy in your backpack');
    await tx
      .update(schema.itemInstances)
      .set(
        item.quantity > 1
          ? { quantity: item.quantity - 1, version: item.version + 1 }
          : {
              locationKind: 'destroyed',
              containerId: null,
              slotIndex: null,
              destroyedReason: 'consumed',
              version: item.version + 1,
            },
      )
      .where(eq(schema.itemInstances.id, item.id));
    await recordItemHistory(tx, [
      {
        itemInstanceId: item.id,
        eventType: 'modified',
        details: { reason: 'consumed' },
        actor: input,
        quantity: 1,
        correlationId: uuidv7(),
        occurredAt: now,
      },
    ]);
    const [use] = await tx
      .insert(schema.consumableUses)
      .values({
        id: input.requestId,
        characterId: input.characterId,
        itemId: item.id,
        heal: remedyEffect.heal,
      })
      .returning();
    await tx
      .insert(schema.consumableCooldowns)
      .values({
        characterId: input.characterId,
        readyAt: new Date(now.getTime() + remedyEffect.cooldownMs),
      })
      .onConflictDoUpdate({
        target: schema.consumableCooldowns.characterId,
        set: { readyAt: new Date(now.getTime() + remedyEffect.cooldownMs) },
      });
    return use!;
  });
}
