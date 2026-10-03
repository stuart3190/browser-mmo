import { eq } from 'drizzle-orm';
import { schema } from '@mmo/db';
import type { Item } from '@mmo/schemas';
import { DomainError, ErrorCode } from '@mmo/shared';
import type { DomainContext } from './context';
import { grantItemInTx } from './items';
import { itemViews } from './mappers';
import { inTransaction } from './tx';

/**
 * Persists a world pickup that the zone simulation has ALREADY validated (pickup exists, player in
 * range, not yet claimed in memory). The database enforces the final guarantee: `sourceRef`
 * includes the unique spawn-instance ID, and a unique index makes a second claim of the same
 * spawn instance impossible — even across process restarts or duplicate messages.
 */
export async function claimWorldPickup(
  ctx: DomainContext,
  input: {
    accountId: string;
    characterId: string;
    templateId: string;
    quantity: number;
    spawnPointId: string;
    spawnInstanceId: string;
    requestId?: string;
  },
): Promise<Item[]> {
  const sourceRef = `world_pickup:${input.spawnPointId}:${input.spawnInstanceId}`;
  try {
    return await inTransaction(ctx, async (tx) => {
      const [character] = await tx
        .select()
        .from(schema.characters)
        .where(eq(schema.characters.id, input.characterId));
      if (!character || character.accountId !== input.accountId)
        throw new DomainError(ErrorCode.NOT_FOUND, 'Character not found');
      const result = await grantItemInTx(tx, ctx, {
        accountId: input.accountId,
        characterId: input.characterId,
        templateId: input.templateId,
        quantity: input.quantity,
        method: 'world_pickup',
        sourceRef,
        actor: {
          accountId: input.accountId,
          characterId: input.characterId,
          ...(input.requestId ? { requestId: input.requestId } : {}),
        },
      });
      return itemViews(tx, ctx.gameData, result.changed);
    });
  } catch (err) {
    if (err instanceof DomainError && err.details?.constraint === 'item_instances_source_ref_uq') {
      throw new DomainError(ErrorCode.ALREADY_CLAIMED, 'Someone already picked that up');
    }
    throw err;
  }
}
