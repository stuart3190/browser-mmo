import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { schema } from '@mmo/db';
import type { DbOrTx, Tx } from '@mmo/db';
import type { CurrencyBalance, CurrencyLedgerReason } from '@mmo/schemas';
import { DomainError, ErrorCode, uuidv7 } from '@mmo/shared';
import type { DomainContext } from './context';

export interface WalletKey {
  currencyId: string;
  accountId: string;
  /** Required for character-scoped currencies, must be null for account-scoped ones. */
  characterId: string | null;
}

function normaliseKey(ctx: DomainContext, key: WalletKey): WalletKey {
  const def = ctx.gameData.currencies.get(key.currencyId);
  if (!def)
    throw new DomainError(ErrorCode.VALIDATION_FAILED, `Unknown currency ${key.currencyId}`);
  if (def.scope === 'character' && !key.characterId) {
    throw new DomainError(ErrorCode.VALIDATION_FAILED, `${def.name} is held per character`);
  }
  return { ...key, characterId: def.scope === 'account' ? null : key.characterId };
}

const walletWhere = (k: WalletKey) =>
  and(
    eq(schema.currencyBalances.currencyId, k.currencyId),
    eq(schema.currencyBalances.ownerAccountId, k.accountId),
    k.characterId === null
      ? isNull(schema.currencyBalances.ownerCharacterId)
      : eq(schema.currencyBalances.ownerCharacterId, k.characterId),
  );

/**
 * Ensures wallet rows exist and locks them FOR UPDATE in ascending row-ID order. Call this with
 * every wallet a transaction will touch BEFORE adjusting any of them, so two opposing transfers
 * can never deadlock.
 */
export async function lockWallets(tx: Tx, ctx: DomainContext, keys: WalletKey[]): Promise<void> {
  const norm = keys.map((k) => normaliseKey(ctx, k));
  for (const k of norm) {
    await tx
      .insert(schema.currencyBalances)
      .values({
        id: uuidv7(),
        currencyId: k.currencyId,
        ownerAccountId: k.accountId,
        ownerCharacterId: k.characterId,
        amount: 0,
      })
      .onConflictDoNothing();
  }
  const ids: string[] = [];
  for (const k of norm) {
    const [row] = await tx
      .select({ id: schema.currencyBalances.id })
      .from(schema.currencyBalances)
      .where(walletWhere(k));
    if (row) ids.push(row.id);
  }
  await tx
    .select({ id: schema.currencyBalances.id })
    .from(schema.currencyBalances)
    .where(inArray(schema.currencyBalances.id, [...new Set(ids)]))
    .orderBy(asc(schema.currencyBalances.id))
    .for('update');
}

/**
 * Applies a signed delta to one wallet and appends a ledger row. Must run inside a transaction.
 * Rejects overdrafts (INSUFFICIENT_FUNDS) and balances above the currency's cap.
 */
export async function adjustBalanceInTx(
  tx: Tx,
  ctx: DomainContext,
  args: WalletKey & { delta: number; reason: CurrencyLedgerReason; correlationId?: string | null },
): Promise<number> {
  if (!Number.isSafeInteger(args.delta))
    throw new DomainError(ErrorCode.VALIDATION_FAILED, 'Invalid amount');
  const key = normaliseKey(ctx, args);
  const def = ctx.gameData.currencies.get(key.currencyId)!;
  await lockWallets(tx, ctx, [key]);
  const [row] = await tx
    .select()
    .from(schema.currencyBalances)
    .where(walletWhere(key))
    .for('update');
  const next = row!.amount + args.delta;
  if (next < 0) throw new DomainError(ErrorCode.INSUFFICIENT_FUNDS, `Not enough ${def.name}`);
  if (next > def.maxBalance)
    throw new DomainError(ErrorCode.CONFLICT, `${def.name} would exceed the maximum balance`);
  const now = ctx.now();
  await tx
    .update(schema.currencyBalances)
    .set({ amount: next, version: sql`${schema.currencyBalances.version} + 1`, updatedAt: now })
    .where(eq(schema.currencyBalances.id, row!.id));
  await tx.insert(schema.currencyLedger).values({
    id: uuidv7(),
    currencyId: key.currencyId,
    ownerAccountId: key.accountId,
    ownerCharacterId: key.characterId,
    delta: args.delta,
    balanceAfter: next,
    reason: args.reason,
    correlationId: args.correlationId ?? null,
    occurredAt: now,
  });
  return next;
}

/** Balances visible to a character: its own character-scoped wallets plus account-scoped ones. */
export async function getBalances(
  db: DbOrTx,
  accountId: string,
  characterId: string,
): Promise<CurrencyBalance[]> {
  const rows = await db
    .select()
    .from(schema.currencyBalances)
    .where(
      and(
        eq(schema.currencyBalances.ownerAccountId, accountId),
        sql`(${schema.currencyBalances.ownerCharacterId} = ${characterId} OR ${schema.currencyBalances.ownerCharacterId} IS NULL)`,
      ),
    );
  return rows.map((r) => ({
    currencyId: r.currencyId,
    ownerAccountId: r.ownerAccountId,
    ownerCharacterId: r.ownerCharacterId,
    amount: r.amount,
  }));
}
