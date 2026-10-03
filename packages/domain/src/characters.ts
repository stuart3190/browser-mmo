import { and, asc, count, eq, isNull } from 'drizzle-orm';
import { schema } from '@mmo/db';
import type { DbOrTx } from '@mmo/db';
import { PRIMARY_CURRENCY_ID } from '@mmo/game-data';
import type { PlayerCharacter, Vec3 } from '@mmo/schemas';
import { CharacterNameSchema } from '@mmo/schemas';
import { DomainError, ErrorCode, uuidv7 } from '@mmo/shared';
import type { DomainContext } from './context';
import { createCharacterContainers, ensureAccountVault } from './containers';
import { adjustBalanceInTx } from './currency';
import { characterFromRow } from './mappers';
import { inTransaction, isUniqueViolation } from './tx';

export const MAX_CHARACTERS_PER_ACCOUNT = 10;
/** Starting gold in copper. Placeholder economy number. */
export const STARTING_GOLD = 1_000;
export const STARTING_ZONE_ID = 'zone.greenvale.meadows';

export async function createCharacter(
  ctx: DomainContext,
  input: { accountId: string; name: string; classId: string },
): Promise<PlayerCharacter> {
  const name = CharacterNameSchema.parse(input.name);
  if (!ctx.gameData.classes.has(input.classId))
    throw new DomainError(ErrorCode.VALIDATION_FAILED, 'Unknown class');
  const zone = ctx.gameData.zone(STARTING_ZONE_ID);
  try {
    return await inTransaction(ctx, async (tx) => {
      const [existing] = await tx
        .select({ n: count() })
        .from(schema.characters)
        .where(
          and(
            eq(schema.characters.accountId, input.accountId),
            isNull(schema.characters.deletedAt),
          ),
        );
      if ((existing?.n ?? 0) >= MAX_CHARACTERS_PER_ACCOUNT)
        throw new DomainError(ErrorCode.CONFLICT, 'Character limit reached');
      const id = uuidv7();
      const [row] = await tx
        .insert(schema.characters)
        .values({
          id,
          accountId: input.accountId,
          name,
          classId: input.classId,
          zoneId: zone.id,
          posX: zone.defaultSpawn.x,
          posY: zone.defaultSpawn.y,
          posZ: zone.defaultSpawn.z,
        })
        .returning();
      await createCharacterContainers(tx, input.accountId, id);
      await ensureAccountVault(tx, input.accountId);
      await adjustBalanceInTx(tx, ctx, {
        currencyId: PRIMARY_CURRENCY_ID,
        accountId: input.accountId,
        characterId: id,
        delta: STARTING_GOLD,
        reason: 'starter_grant',
      });
      return characterFromRow(row!);
    });
  } catch (err) {
    if (err instanceof DomainError && err.details?.constraint === 'characters_name_lower_uq') {
      throw new DomainError(ErrorCode.CONFLICT, 'That name is taken');
    }
    if (isUniqueViolation(err, 'characters_name_lower_uq'))
      throw new DomainError(ErrorCode.CONFLICT, 'That name is taken');
    throw err;
  }
}

export async function listCharacters(db: DbOrTx, accountId: string): Promise<PlayerCharacter[]> {
  const rows = await db
    .select()
    .from(schema.characters)
    .where(and(eq(schema.characters.accountId, accountId), isNull(schema.characters.deletedAt)))
    .orderBy(asc(schema.characters.createdAt));
  return rows.map(characterFromRow);
}

/** Persists the server-validated position (called by the realtime service, never from client input directly). */
export async function saveCharacterPosition(
  db: DbOrTx,
  characterId: string,
  zoneId: string,
  pos: Vec3,
  rotationY: number,
): Promise<void> {
  await db
    .update(schema.characters)
    .set({ zoneId, posX: pos.x, posY: pos.y, posZ: pos.z, rotationY, updatedAt: new Date() })
    .where(eq(schema.characters.id, characterId));
}
