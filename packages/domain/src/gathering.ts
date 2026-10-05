import { eq, sql } from 'drizzle-orm';
import { schema } from '@mmo/db';
import { DomainError, ErrorCode, uuidv7 } from '@mmo/shared';
import type { DomainContext } from './context';
import { grantItemInTx, requireOwnedCharacter } from './items';
import { itemViews } from './mappers';
import { inTransaction } from './tx';

/** Node identity/yield/regrowth are authored, never supplied by a client. Range/life/zone are
 * validated by the authoritative simulation before this short transaction begins. */
export async function harvestResource(
  ctx: DomainContext,
  input: { accountId: string; characterId: string; nodeId: string; requestId?: string },
) {
  const world = ctx.gameData.raw.worldCatalog;
  const node = world?.resourceNodes.find((n) => n.id === input.nodeId);
  const resource = world?.resources.find((r) => r.id === node?.resourceId);
  if (!node || !resource?.gatheringImplemented)
    throw new DomainError(ErrorCode.NOT_FOUND, 'No harvestable resource');
  return inTransaction(ctx, async (tx) => {
    await requireOwnedCharacter(tx, input.accountId, input.characterId);
    await tx
      .insert(schema.resourceHarvests)
      .values({ nodeId: node.id, readyAt: new Date(0) })
      .onConflictDoNothing();
    const [state] = await tx
      .select()
      .from(schema.resourceHarvests)
      .where(eq(schema.resourceHarvests.nodeId, node.id))
      .for('update');
    // Use the database clock after acquiring the row lock: competing requests cannot both win.
    const result = await tx.execute(sql`select clock_timestamp() as now`);
    const now = new Date((result.rows[0] as { now: Date }).now);
    if (state!.readyAt > now)
      throw new DomainError(ErrorCode.ALREADY_CLAIMED, 'This patch is regrowing', {
        readyAtMs: state!.readyAt.getTime(),
      });
    const readyAt = new Date(now.getTime() + node.regrowMs);
    const grant = await grantItemInTx(tx, ctx, {
      accountId: input.accountId,
      characterId: input.characterId,
      templateId: resource.itemTemplateId,
      quantity: node.quantity,
      method: 'world_pickup',
      sourceRef: `resource:${node.id}:${uuidv7()}`,
      actor: {
        accountId: input.accountId,
        characterId: input.characterId,
        ...(input.requestId ? { requestId: input.requestId } : {}),
      },
    });
    await tx
      .update(schema.resourceHarvests)
      .set({ readyAt })
      .where(eq(schema.resourceHarvests.nodeId, node.id));
    return {
      items: await itemViews(tx, ctx.gameData, grant.changed),
      readyAtMs: readyAt.getTime(),
    };
  });
}
