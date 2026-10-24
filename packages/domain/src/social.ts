import { and, asc, count, desc, eq, gt, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import { schema } from '@mmo/db';
import type { DbOrTx, Tx } from '@mmo/db';
import { ChatMessageTextSchema } from '@mmo/schemas';
import type { DirectMessage, FriendAction, Friendship } from '@mmo/schemas';
import { DomainError, ErrorCode } from '@mmo/shared';
import type { DomainContext } from './context';
import { requireOwnedCharacter } from './items';
import { inTransaction } from './tx';

type Actor = { accountId: string; characterId: string };
type Link = typeof schema.friendships.$inferSelect;
type Message = typeof schema.directMessages.$inferSelect;
const involved = (id: string) =>
  or(eq(schema.friendships.lowAccountId, id), eq(schema.friendships.highAccountId, id))!;
const pairIds = (a: string, b: string) => [a, b].sort() as [string, string];
const pair = (a: string, b: string) => {
  const [low, high] = pairIds(a, b);
  return and(eq(schema.friendships.lowAccountId, low), eq(schema.friendships.highAccountId, high))!;
};
const conversation = (a: string, b: string) =>
  or(
    and(eq(schema.directMessages.fromAccountId, a), eq(schema.directMessages.toAccountId, b)),
    and(eq(schema.directMessages.fromAccountId, b), eq(schema.directMessages.toAccountId, a)),
  )!;
function fail(message: string): never {
  throw new DomainError(ErrorCode.FORBIDDEN, message);
}
function messageView(row: Message): DirectMessage {
  return { ...row, sentAt: row.sentAt.toISOString(), readAt: row.readAt?.toISOString() ?? null };
}
function friendshipView(row: Link, accountId: string, unread = 0): Friendship {
  const low = row.lowAccountId === accountId;
  return {
    accountId,
    friendAccountId: low ? row.highAccountId : row.lowAccountId,
    friendName: low ? row.highName : row.lowName,
    unread,
    status:
      row.status === 'accepted'
        ? 'accepted'
        : row.requesterId === accountId
          ? 'pending_outgoing'
          : 'pending_incoming',
    createdAt: row.createdAt.toISOString(),
  };
}
async function lockAccounts(tx: Tx, a: string, b: string, requireActivePeer = true) {
  if (a === b) throw new DomainError(ErrorCode.CONFLICT, 'Choose a character on another account');
  const rows = await tx
    .select()
    .from(schema.accounts)
    .where(inArray(schema.accounts.id, [a, b]))
    .orderBy(asc(schema.accounts.id))
    .for('no key update');
  if (
    rows.length !== 2 ||
    rows.some((r) => r.status !== 'active' && (r.id === a || requireActivePeer))
  )
    fail('This contact is unavailable');
}
async function blocked(db: DbOrTx, a: string, b: string) {
  const rows = await db
    .select()
    .from(schema.socialBlocks)
    .where(
      or(
        and(eq(schema.socialBlocks.accountId, a), eq(schema.socialBlocks.blockedAccountId, b)),
        and(eq(schema.socialBlocks.accountId, b), eq(schema.socialBlocks.blockedAccountId, a)),
      ),
    )
    .limit(1);
  return rows.length > 0;
}
async function accepted(db: DbOrTx, a: string, b: string) {
  const [link] = await db.select().from(schema.friendships).where(pair(a, b));
  if (!link || link.status !== 'accepted' || (await blocked(db, a, b)))
    fail('Accept a friend request before messaging');
  return link;
}
async function checkCapacity(tx: Tx, ids: string[], status: 'pending' | 'accepted') {
  for (const id of ids) {
    const [row] = await tx
      .select({ n: count() })
      .from(schema.friendships)
      .where(and(involved(id), eq(schema.friendships.status, status)));
    if ((row?.n ?? 0) >= (status === 'pending' ? 50 : 200))
      throw new DomainError(
        ErrorCode.CONFLICT,
        'A contact list is full. Remove an old request or friend first.',
      );
  }
}

export async function listFriends(ctx: DomainContext, actor: Actor): Promise<Friendship[]> {
  await requireOwnedCharacter(ctx.db, actor.accountId, actor.characterId);
  const [links, blocks, unread] = await Promise.all([
    ctx.db
      .select()
      .from(schema.friendships)
      .where(involved(actor.accountId))
      .orderBy(desc(schema.friendships.createdAt)),
    ctx.db
      .select()
      .from(schema.socialBlocks)
      .where(eq(schema.socialBlocks.accountId, actor.accountId)),
    ctx.db
      .select({ from: schema.directMessages.fromAccountId, n: count() })
      .from(schema.directMessages)
      .where(
        and(
          eq(schema.directMessages.toAccountId, actor.accountId),
          isNull(schema.directMessages.readAt),
        ),
      )
      .groupBy(schema.directMessages.fromAccountId),
  ]);
  const counts = new Map(unread.map((r) => [r.from, r.n]));
  const ownBlocks = new Set(blocks.map((b) => b.blockedAccountId));
  return [
    ...links
      .filter(
        (row) =>
          !ownBlocks.has(
            row.lowAccountId === actor.accountId ? row.highAccountId : row.lowAccountId,
          ),
      )
      .map((row) =>
        friendshipView(
          row,
          actor.accountId,
          counts.get(row.lowAccountId === actor.accountId ? row.highAccountId : row.lowAccountId) ??
            0,
        ),
      ),
    ...blocks.map((row) => ({
      accountId: actor.accountId,
      friendAccountId: row.blockedAccountId,
      friendName: row.blockedName,
      unread: 0,
      status: 'blocked' as const,
      createdAt: row.createdAt.toISOString(),
    })),
  ];
}

export async function requestFriend(
  ctx: DomainContext,
  actor: Actor,
  targetName: string,
): Promise<Friendship> {
  return inTransaction(ctx, async (tx) => {
    const from = await requireOwnedCharacter(tx, actor.accountId, actor.characterId);
    const [target] = await tx
      .select()
      .from(schema.characters)
      .where(
        and(
          sql`lower(${schema.characters.name})=lower(${targetName.trim()})`,
          isNull(schema.characters.deletedAt),
        ),
      );
    if (!target) throw new DomainError(ErrorCode.NOT_FOUND, 'Character not found');
    await lockAccounts(tx, actor.accountId, target.accountId);
    if (await blocked(tx, actor.accountId, target.accountId)) fail('This contact is unavailable');
    const [existing] = await tx
      .select()
      .from(schema.friendships)
      .where(pair(actor.accountId, target.accountId));
    if (existing) return friendshipView(existing, actor.accountId);
    await checkCapacity(tx, [actor.accountId, target.accountId], 'pending');
    const [low, high] = pairIds(actor.accountId, target.accountId);
    const [created] = await tx
      .insert(schema.friendships)
      .values({
        lowAccountId: low,
        highAccountId: high,
        requesterId: actor.accountId,
        lowName: low === actor.accountId ? from.name : target.name,
        highName: high === actor.accountId ? from.name : target.name,
        status: 'pending',
        createdAt: ctx.now(),
        updatedAt: ctx.now(),
      })
      .returning();
    return friendshipView(created!, actor.accountId);
  });
}

export async function actOnFriend(
  ctx: DomainContext,
  actor: Actor,
  peer: string,
  action: FriendAction,
): Promise<void> {
  await inTransaction(ctx, async (tx) => {
    await requireOwnedCharacter(tx, actor.accountId, actor.characterId);
    await lockAccounts(tx, actor.accountId, peer, action === 'accept');
    const [link] = await tx.select().from(schema.friendships).where(pair(actor.accountId, peer));
    if (action === 'unblock') {
      await tx
        .delete(schema.socialBlocks)
        .where(
          and(
            eq(schema.socialBlocks.accountId, actor.accountId),
            eq(schema.socialBlocks.blockedAccountId, peer),
          ),
        );
      return;
    }
    if (action === 'block') {
      const [alreadyBlocked] = await tx
        .select()
        .from(schema.socialBlocks)
        .where(
          and(
            eq(schema.socialBlocks.accountId, actor.accountId),
            eq(schema.socialBlocks.blockedAccountId, peer),
          ),
        );
      if (alreadyBlocked) {
        await tx.delete(schema.friendships).where(pair(actor.accountId, peer));
        return;
      }

      const [character] = await tx
        .select({ name: schema.characters.name })
        .from(schema.characters)
        .where(and(eq(schema.characters.accountId, peer), isNull(schema.characters.deletedAt)))
        .orderBy(asc(schema.characters.createdAt))
        .limit(1);
      const name = link
        ? friendshipView(link, actor.accountId).friendName
        : (character?.name ?? 'Adventurer');
      const [existing] = await tx
        .select({ n: count() })
        .from(schema.socialBlocks)
        .where(eq(schema.socialBlocks.accountId, actor.accountId));
      if ((existing?.n ?? 0) >= 200)
        throw new DomainError(ErrorCode.CONFLICT, 'Your block list is full');
      await tx
        .insert(schema.socialBlocks)
        .values({
          accountId: actor.accountId,
          blockedAccountId: peer,
          blockedName: name,
          createdAt: ctx.now(),
        })
        .onConflictDoNothing();
      await tx.delete(schema.friendships).where(pair(actor.accountId, peer));
      return;
    }
    if (action === 'remove') {
      await tx.delete(schema.friendships).where(pair(actor.accountId, peer));
      return;
    }
    if (!link || (await blocked(tx, actor.accountId, peer)))
      fail('That friend request is no longer available');
    if (link.status === 'accepted') return;
    if (link.requesterId === actor.accountId) fail('Only the recipient can accept this request');
    await checkCapacity(tx, [actor.accountId, peer], 'accepted');
    await tx
      .update(schema.friendships)
      .set({ status: 'accepted', updatedAt: ctx.now() })
      .where(pair(actor.accountId, peer));
  });
}

export async function sendDirectMessage(
  ctx: DomainContext,
  actor: Actor,
  peer: string,
  id: string,
  body: string,
): Promise<DirectMessage> {
  const parsed = ChatMessageTextSchema.safeParse(body);
  if (!parsed.success)
    throw new DomainError(ErrorCode.VALIDATION_FAILED, 'Write a message of 1–500 characters');
  return inTransaction(ctx, async (tx) => {
    const from = await requireOwnedCharacter(tx, actor.accountId, actor.characterId);
    await lockAccounts(tx, actor.accountId, peer);
    await accepted(tx, actor.accountId, peer);
    const [existing] = await tx
      .select()
      .from(schema.directMessages)
      .where(eq(schema.directMessages.id, id));
    if (existing) {
      if (
        existing.fromAccountId !== actor.accountId ||
        existing.toAccountId !== peer ||
        existing.fromCharacterId !== actor.characterId ||
        existing.body !== parsed.data
      )
        throw new DomainError(ErrorCode.CONFLICT, 'Message request ID already used');
      return messageView(existing);
    }
    const now = ctx.now();
    const [recent] = await tx
      .select({ n: count() })
      .from(schema.directMessages)
      .where(
        and(
          eq(schema.directMessages.fromAccountId, actor.accountId),
          gt(schema.directMessages.sentAt, new Date(now.getTime() - 10000)),
        ),
      );
    if ((recent?.n ?? 0) >= 8)
      throw new DomainError(ErrorCode.RATE_LIMITED, 'Wait a moment before sending another message');
    const [row] = await tx
      .insert(schema.directMessages)
      .values({
        id,
        fromAccountId: actor.accountId,
        toAccountId: peer,
        fromCharacterId: actor.characterId,
        fromName: from.name,
        body: parsed.data,
        sentAt: now,
      })
      .returning();
    return messageView(row!);
  });
}

export async function directMessageHistory(
  ctx: DomainContext,
  actor: Actor,
  peer: string,
  beforeId?: string,
): Promise<{ messages: DirectMessage[]; hasMore: boolean }> {
  await requireOwnedCharacter(ctx.db, actor.accountId, actor.characterId);
  await accepted(ctx.db, actor.accountId, peer);
  const conditions = [conversation(actor.accountId, peer)];
  if (beforeId) {
    const [cursor] = await ctx.db
      .select()
      .from(schema.directMessages)
      .where(and(eq(schema.directMessages.id, beforeId), conversation(actor.accountId, peer)));
    if (!cursor) throw new DomainError(ErrorCode.NOT_FOUND, 'Message not found');
    conditions.push(
      or(
        lt(schema.directMessages.sentAt, cursor.sentAt),
        and(
          eq(schema.directMessages.sentAt, cursor.sentAt),
          lt(schema.directMessages.id, cursor.id),
        ),
      )!,
    );
  }
  const rows = await ctx.db
    .select()
    .from(schema.directMessages)
    .where(and(...conditions))
    .orderBy(desc(schema.directMessages.sentAt), desc(schema.directMessages.id))
    .limit(51);
  return { messages: rows.slice(0, 50).reverse().map(messageView), hasMore: rows.length > 50 };
}

export async function readDirectMessages(
  ctx: DomainContext,
  actor: Actor,
  peer: string,
  ids: string[],
): Promise<string> {
  return inTransaction(ctx, async (tx) => {
    await requireOwnedCharacter(tx, actor.accountId, actor.characterId);
    await lockAccounts(tx, actor.accountId, peer);
    await accepted(tx, actor.accountId, peer);
    const now = ctx.now();
    if (ids.length)
      await tx
        .update(schema.directMessages)
        .set({ readAt: now })
        .where(
          and(
            inArray(schema.directMessages.id, ids.slice(0, 50)),
            eq(schema.directMessages.fromAccountId, peer),
            eq(schema.directMessages.toAccountId, actor.accountId),
            isNull(schema.directMessages.readAt),
          ),
        );
    return now.toISOString();
  });
}
