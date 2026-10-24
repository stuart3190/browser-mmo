import { and, eq } from 'drizzle-orm';
import { schema } from '@mmo/db';
import { specialisationPaths, specialisationLevel, specialisationMentors } from '@mmo/game-data';
import { DomainError, ErrorCode } from '@mmo/shared';
import type { DomainContext } from './context';
import { requireOwnedCharacter } from './items';
import { inTransaction } from './tx';

/** The owning host verifies life, distance and combat, just like other NPC services. */
export async function specialiseAtNpc(
  ctx: DomainContext,
  input: {
    accountId: string;
    characterId: string;
    npcId: string;
    specialisationId: string;
    requestId: string;
  },
) {
  if (!specialisationMentors.includes(input.npcId))
    throw new DomainError(ErrorCode.WRONG_NPC, 'This person does not teach specialisations');
  return inTransaction(ctx, async (tx) => {
    await requireOwnedCharacter(tx, input.accountId, input.characterId);
    const [character] = await tx
      .select()
      .from(schema.characters)
      .where(eq(schema.characters.id, input.characterId))
      .for('update');
    const path = specialisationPaths.find(
      (p) => p.id === input.specialisationId && p.classId === character!.classId,
    );
    if (!path)
      throw new DomainError(ErrorCode.VALIDATION_FAILED, 'Choose a specialisation for your class');
    if (character!.level < specialisationLevel)
      throw new DomainError(ErrorCode.ABILITY_LOCKED, 'Specialisations unlock at level five');
    const operation = `specialise:${input.npcId}:${path.id}`;
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
      return { specialisationId: character!.specialisationId, duplicate: true };
    }
    await tx
      .update(schema.characters)
      .set({ specialisationId: path.id })
      .where(eq(schema.characters.id, input.characterId));
    await tx
      .insert(schema.serviceReceipts)
      .values({ characterId: input.characterId, requestId: input.requestId, offerId: operation });
    return { specialisationId: path.id, duplicate: false };
  });
}
