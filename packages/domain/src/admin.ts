import { desc, eq, ilike, or } from 'drizzle-orm';
import { schema } from '@mmo/db';
import type { DbOrTx } from '@mmo/db';
import type { PlayerAccount, PlayerCharacter } from '@mmo/schemas';
import { DomainError, ErrorCode } from '@mmo/shared';
import type { Actor, DomainContext } from './context';
import { recordAudit } from './history';
import { grantItemInTx, revokeItemInTx } from './items';
import { accountFromRow, characterFromRow, itemViews } from './mappers';
import { inTransaction } from './tx';

/**
 * Admin read/write operations. Permission checks happen in the transport layer
 * (`requirePermission`) BEFORE these are called; every write here is audit-logged.
 */

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export async function searchAccounts(db: DbOrTx, q: string): Promise<PlayerAccount[]> {
  const rows = await db
    .select()
    .from(schema.accounts)
    .where(ilike(schema.accounts.username, `%${escapeLike(q)}%`))
    .orderBy(desc(schema.accounts.createdAt))
    .limit(50);
  return rows.map(accountFromRow);
}

export async function searchCharacters(db: DbOrTx, q: string): Promise<PlayerCharacter[]> {
  const conds = [ilike(schema.characters.name, `%${escapeLike(q)}%`)];
  if (/^[0-9a-f-]{36}$/i.test(q))
    conds.push(eq(schema.characters.id, q), eq(schema.characters.accountId, q));
  const rows = await db
    .select()
    .from(schema.characters)
    .where(or(...conds))
    .orderBy(desc(schema.characters.createdAt))
    .limit(50);
  return rows.map(characterFromRow);
}

export async function adminGrantItem(
  ctx: DomainContext,
  input: {
    actor: Actor;
    characterId: string;
    templateId: string;
    quantity: number;
    rarityId?: string;
    reason: string;
  },
) {
  return inTransaction(ctx, async (tx) => {
    const [character] = await tx
      .select()
      .from(schema.characters)
      .where(eq(schema.characters.id, input.characterId));
    if (!character) throw new DomainError(ErrorCode.NOT_FOUND, 'Character not found');
    const result = await grantItemInTx(tx, ctx, {
      accountId: character.accountId,
      characterId: character.id,
      templateId: input.templateId,
      quantity: input.quantity,
      ...(input.rarityId ? { rarityId: input.rarityId } : {}),
      method: 'admin_grant',
      actor: input.actor,
    });
    await recordAudit(tx, {
      actor: input.actor,
      action: 'admin.items.grant',
      targetType: 'item_instance',
      targetId: result.created.id,
      details: {
        characterId: character.id,
        templateId: input.templateId,
        quantity: input.quantity,
        reason: input.reason,
      },
      at: ctx.now(),
    });
    return (await itemViews(tx, ctx.gameData, [result.created]))[0]!;
  });
}

export async function adminRevokeItem(
  ctx: DomainContext,
  input: { actor: Actor; itemInstanceId: string; reason: string },
) {
  return inTransaction(ctx, async (tx) => {
    const row = await revokeItemInTx(tx, ctx, input.itemInstanceId, input.actor, input.reason);
    await recordAudit(tx, {
      actor: input.actor,
      action: 'admin.items.revoke',
      targetType: 'item_instance',
      targetId: row.id,
      details: { reason: input.reason },
      at: ctx.now(),
    });
    return (await itemViews(tx, ctx.gameData, [row]))[0]!;
  });
}
