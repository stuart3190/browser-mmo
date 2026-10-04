import { inArray } from 'drizzle-orm';
import { schema } from '@mmo/db';
import type { ChangeEvent } from '@mmo/db';
import type { DomainContext } from '@mmo/domain';
import {
  containersForCharacter,
  ensureMailbox,
  getBalances,
  getCharacterItems,
  getCharacterStats,
  itemViews,
} from '@mmo/domain';
import type { OutMessage } from '@mmo/world';

/** What the sync layer needs to know about one authenticated connection. */
export interface SyncTarget {
  accountId: string;
  characterId: string;
  /** IDs of every container this character can see (own three + the account vault). */
  containerIds: Set<string>;
  send(msg: OutMessage): void;
}

type ItemRow = typeof schema.itemInstances.$inferSelect;

/** Is this item part of `target`'s view (bags, vaults it can open, or its own equipment)? */
export function isVisibleTo(
  row: ItemRow,
  target: Pick<SyncTarget, 'accountId' | 'characterId' | 'containerIds'>,
): boolean {
  if (row.ownerAccountId !== target.accountId) return false;
  if (row.locationKind === 'container') return target.containerIds.has(row.containerId!);
  if (row.locationKind === 'equipped') return row.equipCharacterId === target.characterId;
  return false; // escrow / destroyed are not part of anyone's inventory view
}

export async function loadContainerIds(
  ctx: DomainContext,
  accountId: string,
  characterId: string,
): Promise<Set<string>> {
  // Characters created before the mailbox existed get it here, so overflow loot delivered to it
  // is part of this connection's view from the start.
  await ensureMailbox(ctx.db, accountId, characterId);
  return new Set((await containersForCharacter(ctx.db, accountId, characterId)).map((c) => c.id));
}

/** Full state for one connection: used on join and after a change-feed resync. */
export async function sendFullState(ctx: DomainContext, t: SyncTarget): Promise<void> {
  t.send({
    t: 'inventory.snapshot',
    d: { items: await getCharacterItems(ctx.db, ctx, t.accountId, t.characterId) },
  });
  t.send({
    t: 'character.stats',
    d: { characterId: t.characterId, stats: await getCharacterStats(ctx.db, ctx, t.characterId) },
  });
  t.send({
    t: 'wallet.updated',
    d: { balances: await getBalances(ctx.db, t.accountId, t.characterId) },
  });
}

/**
 * Fans database change events out to connected clients (ADR 0014).
 *
 * Events are coalesced for `debounceMs`, then the authoritative rows are re-read in one query and
 * every affected connection receives `inventory.updated` (visible items + removed tombstones),
 * fresh `character.stats`, and `wallet.updated` when balances changed. Clients reconcile by item
 * version, so duplicates (e.g. the pickup reply plus the sync push) are harmless.
 */
export class AccountSync {
  private readonly pendingItems = new Map<string, Set<string>>(); // itemId -> accounts to notify
  private readonly pendingWallets = new Set<string>();
  private timer: NodeJS.Timeout | undefined;
  private flushing: Promise<void> = Promise.resolve();
  /** Called after a character received item changes (e.g. to refresh its combat profile). */
  onCharacterItemsChanged: ((characterId: string) => void) | undefined;

  constructor(
    private readonly ctx: DomainContext,
    private readonly targetsForAccount: (accountId: string) => SyncTarget[],
    private readonly onError: (err: unknown) => void,
    private readonly debounceMs = 25,
  ) {}

  push(event: ChangeEvent): void {
    if (event.k === 'item') {
      const accounts = this.pendingItems.get(event.i) ?? new Set<string>();
      accounts.add(event.a);
      if (event.pa) accounts.add(event.pa);
      this.pendingItems.set(event.i, accounts);
    } else {
      this.pendingWallets.add(event.a);
    }
    this.timer ??= setTimeout(() => {
      this.timer = undefined;
      this.flushing = this.flushing.then(() => this.flush()).catch(this.onError);
    }, this.debounceMs);
  }

  /** Resolves when everything queued so far has been delivered (tests, shutdown). */
  async idle(): Promise<void> {
    while (this.timer || this.pendingItems.size || this.pendingWallets.size) {
      await new Promise((r) => setTimeout(r, this.debounceMs));
    }
    await this.flushing;
  }

  private async flush(): Promise<void> {
    const items = new Map(this.pendingItems);
    const wallets = new Set(this.pendingWallets);
    this.pendingItems.clear();
    this.pendingWallets.clear();

    const rows = items.size
      ? await this.ctx.db
          .select()
          .from(schema.itemInstances)
          .where(inArray(schema.itemInstances.id, [...items.keys()]))
      : [];
    const accounts = new Set<string>([...wallets]);
    for (const a of items.values()) a.forEach((x) => accounts.add(x));

    for (const accountId of accounts) {
      for (const target of this.targetsForAccount(accountId)) {
        const relevant = rows.filter((r) => items.get(r.id)?.has(accountId));
        if (relevant.length > 0) {
          const visible = relevant.filter((r) => isVisibleTo(r, target));
          const removed = relevant
            .filter((r) => !isVisibleTo(r, target))
            .map((r) => ({ id: r.id, version: r.version }));
          target.send({
            t: 'inventory.updated',
            d: {
              reason: 'sync',
              items: await itemViews(this.ctx.db, this.ctx.gameData, visible),
              removed,
            },
          });
          target.send({
            t: 'character.stats',
            d: {
              characterId: target.characterId,
              stats: await getCharacterStats(this.ctx.db, this.ctx, target.characterId),
            },
          });
          this.onCharacterItemsChanged?.(target.characterId);
        }
        if (wallets.has(accountId)) {
          target.send({
            t: 'wallet.updated',
            d: { balances: await getBalances(this.ctx.db, accountId, target.characterId) },
          });
        }
      }
    }
  }
}
