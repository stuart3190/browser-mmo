import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { schema } from '@mmo/db';
import type { DbOrTx, Tx } from '@mmo/db';
import type { ContainerKind } from '@mmo/schemas';
import { DomainError, ErrorCode, uuidv7 } from '@mmo/shared';

type ContainerRow = typeof schema.containers.$inferSelect;

/** Default capacities. Expansion/bag upgrades will raise `capacity` on the row later. */
export const DEFAULT_CAPACITY: Record<Exclude<ContainerKind, 'guild_vault'>, number> = {
  backpack: 24,
  material_pouch: 40,
  character_vault: 48,
  account_vault: 48,
};

export async function createCharacterContainers(
  tx: Tx,
  accountId: string,
  characterId: string,
): Promise<void> {
  const kinds = ['backpack', 'material_pouch', 'character_vault'] as const;
  await tx.insert(schema.containers).values(
    kinds.map((kind) => ({
      id: uuidv7(),
      kind,
      ownerAccountId: accountId,
      ownerCharacterId: characterId,
      capacity: DEFAULT_CAPACITY[kind],
    })),
  );
}

/** Idempotently ensures the account's shared vault exists. */
export async function ensureAccountVault(tx: Tx, accountId: string): Promise<void> {
  await tx
    .insert(schema.containers)
    .values({
      id: uuidv7(),
      kind: 'account_vault',
      ownerAccountId: accountId,
      capacity: DEFAULT_CAPACITY.account_vault,
    })
    .onConflictDoNothing();
}

/** Containers visible to a character: its own three plus its account's shared vault. */
export async function containersForCharacter(
  db: DbOrTx,
  accountId: string,
  characterId: string,
): Promise<ContainerRow[]> {
  return db
    .select()
    .from(schema.containers)
    .where(
      sql`(${schema.containers.ownerCharacterId} = ${characterId}) OR (${schema.containers.kind} = 'account_vault' AND ${schema.containers.ownerAccountId} = ${accountId})`,
    )
    .orderBy(asc(schema.containers.kind));
}

/**
 * Locks containers (FOR UPDATE) in ascending ID order. Every operation that changes slot
 * occupancy locks the affected containers first; this serialises slot allocation per container
 * and the fixed order prevents deadlocks.
 */
export async function lockContainers(tx: Tx, ids: string[]): Promise<Map<string, ContainerRow>> {
  const unique = [...new Set(ids)].sort();
  if (unique.length === 0) return new Map();
  const rows = await tx
    .select()
    .from(schema.containers)
    .where(inArray(schema.containers.id, unique))
    .orderBy(asc(schema.containers.id))
    .for('update');
  return new Map(rows.map((r) => [r.id, r]));
}

export async function lockCharacterContainer(
  tx: Tx,
  characterId: string,
  kind: ContainerKind,
): Promise<ContainerRow> {
  const [row] = await tx
    .select({ id: schema.containers.id })
    .from(schema.containers)
    .where(
      and(eq(schema.containers.ownerCharacterId, characterId), eq(schema.containers.kind, kind)),
    );
  if (!row) throw new DomainError(ErrorCode.NOT_FOUND, `Character has no ${kind}`);
  const locked = await lockContainers(tx, [row.id]);
  return locked.get(row.id)!;
}

/** Occupied slot indexes of a (locked) container. */
export async function occupiedSlots(tx: Tx, containerId: string): Promise<Set<number>> {
  const rows = await tx
    .select({ slot: schema.itemInstances.slotIndex })
    .from(schema.itemInstances)
    .where(
      and(
        eq(schema.itemInstances.locationKind, 'container'),
        eq(schema.itemInstances.containerId, containerId),
      ),
    );
  return new Set(rows.map((r) => r.slot!));
}

export function firstFreeSlot(capacity: number, occupied: Set<number>): number | undefined {
  for (let i = 0; i < capacity; i++) if (!occupied.has(i)) return i;
  return undefined;
}

/** Container ownership check: may this character place items here / take items from here? */
export function characterCanUseContainer(
  container: ContainerRow,
  accountId: string,
  characterId: string,
): boolean {
  if (container.kind === 'account_vault') return container.ownerAccountId === accountId;
  if (container.kind === 'guild_vault') return false; // not implemented
  return container.ownerCharacterId === characterId;
}
