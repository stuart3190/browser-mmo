import { schema } from '@mmo/db';
import type { Tx } from '@mmo/db';
import type { ItemHistoryEventType, ItemLocation } from '@mmo/schemas';
import { uuidv7 } from '@mmo/shared';
import type { Actor } from './context';

export interface HistoryEvent {
  itemInstanceId: string;
  eventType: ItemHistoryEventType;
  actor: Actor;
  fromOwnerAccountId?: string | null;
  toOwnerAccountId?: string | null;
  fromLocation?: ItemLocation | null;
  toLocation?: ItemLocation | null;
  quantity?: number | null;
  correlationId?: string | null;
  details?: Record<string, unknown>;
  occurredAt: Date;
}

/** Appends provenance rows. Always called inside the same transaction as the change it records. */
export async function recordItemHistory(tx: Tx, events: HistoryEvent[]): Promise<void> {
  if (events.length === 0) return;
  await tx.insert(schema.itemHistory).values(
    events.map((e) => ({
      id: uuidv7(),
      itemInstanceId: e.itemInstanceId,
      eventType: e.eventType,
      actorAccountId: e.actor.accountId,
      actorCharacterId: e.actor.characterId,
      fromOwnerAccountId: e.fromOwnerAccountId ?? null,
      toOwnerAccountId: e.toOwnerAccountId ?? null,
      fromLocation: e.fromLocation ?? null,
      toLocation: e.toLocation ?? null,
      quantity: e.quantity ?? null,
      correlationId: e.correlationId ?? null,
      details: {
        ...(e.details ?? {}),
        ...(e.actor.requestId ? { requestId: e.actor.requestId } : {}),
      },
      occurredAt: e.occurredAt,
    })),
  );
}

export async function recordAudit(
  tx: Tx,
  entry: {
    actor: Actor;
    action: string;
    targetType: string;
    targetId: string;
    details?: Record<string, unknown>;
    at: Date;
  },
): Promise<void> {
  await tx.insert(schema.auditLog).values({
    id: uuidv7(),
    actorAccountId: entry.actor.accountId,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId,
    requestId: entry.actor.requestId ?? null,
    details: entry.details ?? {},
    occurredAt: entry.at,
  });
}
