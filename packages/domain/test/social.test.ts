import { expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { schema } from '@mmo/db';
import { uuidv7 } from '@mmo/shared';
import {
  actOnFriend,
  directMessageHistory,
  listFriends,
  readDirectMessages,
  requestFriend,
  sendDirectMessage,
} from '../src/social';
import { addCharacter, expectCode, makePlayer, setupContext } from './helpers';
import type { TestPlayer } from './helpers';
const ctx = setupContext();
async function name(p: TestPlayer) {
  return (
    await ctx.db
      .select({ name: schema.characters.name })
      .from(schema.characters)
      .where(eq(schema.characters.id, p.characterId))
  )[0]!.name;
}
async function friends(a: TestPlayer, b: TestPlayer) {
  await requestFriend(ctx, a, await name(b));
  await actOnFriend(ctx, b, a.accountId, 'accept');
}
it('serializes crossed requests, enforces recipient consent, and shares friends across alts', async () => {
  const a = await makePlayer(ctx),
    b = await makePlayer(ctx);
  await requestFriend(ctx, a, (await name(b)).toUpperCase());
  const nameA = await name(a);
  await Promise.all(Array.from({ length: 4 }, () => requestFriend(ctx, b, nameA)));
  const incoming = (await listFriends(ctx, b))[0]!;
  expect(incoming.status).toBe('pending_incoming');
  expect(await listFriends(ctx, a)).toHaveLength(1);
  await expectCode(actOnFriend(ctx, a, b.accountId, 'accept'), 'FORBIDDEN');
  await expectCode(
    sendDirectMessage(ctx, a, b.accountId, uuidv7(), 'before acceptance'),
    'FORBIDDEN',
  );
  await actOnFriend(ctx, b, a.accountId, 'accept');
  const alt = { accountId: a.accountId, characterId: await addCharacter(ctx, a.accountId) };
  expect((await listFriends(ctx, alt))[0]).toMatchObject({
    friendAccountId: b.accountId,
    status: 'accepted',
  });
  await expectCode(requestFriend(ctx, a, await name(alt)), 'CONFLICT');
  await actOnFriend(ctx, alt, b.accountId, 'remove');
  expect(await listFriends(ctx, b)).toEqual([]);
});
it('stores one message for concurrent retries and rejects substitution or foreign ownership', async () => {
  const a = await makePlayer(ctx),
    b = await makePlayer(ctx),
    c = await makePlayer(ctx);
  await friends(a, b);
  const id = uuidv7();
  const messages = await Promise.all(
    Array.from({ length: 6 }, () =>
      sendDirectMessage(ctx, a, b.accountId, id, '  hello <b>friend</b>  '),
    ),
  );
  expect(new Set(messages.map((m) => m.id)).size).toBe(1);
  expect(messages[0]).toMatchObject({
    fromAccountId: a.accountId,
    fromCharacterId: a.characterId,
    fromName: await name(a),
    body: 'hello <b>friend</b>',
  });
  expect((await directMessageHistory(ctx, b, a.accountId)).messages).toHaveLength(1);
  expect((await listFriends(ctx, b))[0]!.unread).toBe(1);
  await expectCode(sendDirectMessage(ctx, a, b.accountId, id, 'changed'), 'CONFLICT');
  await expectCode(directMessageHistory(ctx, c, a.accountId), 'FORBIDDEN');
  await expectCode(listFriends(ctx, { ...a, accountId: c.accountId }), 'NOT_FOUND');
  await expectCode(
    sendDirectMessage(ctx, { ...a, accountId: c.accountId }, b.accountId, uuidv7(), 'forged'),
    'NOT_FOUND',
  );
  await expectCode(sendDirectMessage(ctx, a, b.accountId, uuidv7(), '  '), 'VALIDATION_FAILED');
});
it('marks only the recipient’s reviewed messages as read and retains the first read timestamp', async () => {
  const a = await makePlayer(ctx),
    b = await makePlayer(ctx);
  await friends(a, b);
  const message = await sendDirectMessage(ctx, a, b.accountId, uuidv7(), 'read me');
  await readDirectMessages(ctx, a, b.accountId, [message.id]);
  expect((await listFriends(ctx, b))[0]!.unread).toBe(1);
  const readAt = await readDirectMessages(ctx, b, a.accountId, [message.id]);
  await readDirectMessages({ ...ctx, now: () => new Date(Date.now() + 5000) }, b, a.accountId, [
    message.id,
  ]);
  expect((await directMessageHistory(ctx, a, b.accountId)).messages[0]!.readAt).toBe(readAt);
  expect((await listFriends(ctx, b))[0]!.unread).toBe(0);
});
it('serializes sending against block, preserves history, and never silently restores consent on unblock', async () => {
  const a = await makePlayer(ctx),
    b = await makePlayer(ctx);
  await friends(a, b);
  const message = await sendDirectMessage(ctx, a, b.accountId, uuidv7(), 'earlier');
  await Promise.allSettled([
    sendDirectMessage(ctx, a, b.accountId, uuidv7(), 'racing'),
    actOnFriend(ctx, b, a.accountId, 'block'),
  ]);
  expect((await listFriends(ctx, b))[0]!.status).toBe('blocked');
  expect(await listFriends(ctx, a)).toEqual([]);
  await expectCode(sendDirectMessage(ctx, a, b.accountId, uuidv7(), 'after block'), 'FORBIDDEN');
  await expectCode(requestFriend(ctx, a, await name(b)), 'FORBIDDEN');
  await expectCode(directMessageHistory(ctx, a, b.accountId), 'FORBIDDEN');
  await actOnFriend(ctx, a, b.accountId, 'block');
  await actOnFriend(ctx, b, a.accountId, 'unblock');
  await expectCode(requestFriend(ctx, b, await name(a)), 'FORBIDDEN');
  await actOnFriend(ctx, a, b.accountId, 'unblock');
  await expectCode(
    sendDirectMessage(ctx, a, b.accountId, uuidv7(), 'without consent'),
    'FORBIDDEN',
  );
  await friends(a, b);
  expect(
    (await directMessageHistory(ctx, b, a.accountId)).messages.some((m) => m.id === message.id),
  ).toBe(true);
});
it('paginates tied timestamps without missing messages and persists throttling across fresh contexts', async () => {
  const a = await makePlayer(ctx),
    b = await makePlayer(ctx);
  await friends(a, b);
  let time = Date.now();
  const clock = { ...ctx, now: () => new Date(time) };
  const sent = [];
  for (let i = 0; i < 60; i++) {
    if (i % 6 === 0) time += 10001;
    sent.push(await sendDirectMessage(clock, a, b.accountId, uuidv7(), `message ${i}`));
  }
  const page = await directMessageHistory(ctx, b, a.accountId);
  expect(page.messages).toHaveLength(50);
  expect(page.hasMore).toBe(true);
  const older = await directMessageHistory(ctx, b, a.accountId, page.messages[0]!.id);
  expect(older.messages).toHaveLength(10);
  expect(older.hasMore).toBe(false);
  const expected = sent.sort(
    (x, y) => x.sentAt.localeCompare(y.sentAt) || x.id.localeCompare(y.id),
  );
  expect([...older.messages, ...page.messages].map((m) => m.id)).toEqual(expected.map((m) => m.id));
  for (let i = 0; i < 2; i++)
    await sendDirectMessage(clock, a, b.accountId, uuidv7(), 'remaining burst');
  await expectCode(
    sendDirectMessage({ ...clock }, a, b.accountId, uuidv7(), 'too fast'),
    'RATE_LIMITED',
  );
  expect(
    (await sendDirectMessage(clock, a, b.accountId, sent.at(-1)!.id, sent.at(-1)!.body)).id,
  ).toBe(sent.at(-1)!.id);
});
it('bounds incoming requests under concurrency and lets players remove unavailable contacts', async () => {
  const target = await makePlayer(ctx),
    a = await makePlayer(ctx),
    b = await makePlayer(ctx);
  const peers = Array.from({ length: 49 }, () => uuidv7());
  await ctx.db
    .insert(schema.accounts)
    .values(peers.map((id) => ({ id, username: `capacity_${id}`, displayName: 'Capacity' })));
  await ctx.db.insert(schema.friendships).values(
    peers.map((id) => {
      const [low, high] = [id, target.accountId].sort();
      return {
        lowAccountId: low!,
        highAccountId: high!,
        requesterId: id,
        lowName: 'Capacity',
        highName: 'Target',
        status: 'pending',
      };
    }),
  );
  const outcomes = await Promise.allSettled([
    requestFriend(ctx, a, await name(target)),
    requestFriend(ctx, b, await name(target)),
  ]);
  expect(outcomes.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(await listFriends(ctx, target)).toHaveLength(50);
  const current = (await listFriends(ctx, target))[0]!;
  await ctx.db
    .update(schema.accounts)
    .set({ status: 'banned' })
    .where(eq(schema.accounts.id, current.friendAccountId));
  await actOnFriend(ctx, target, current.friendAccountId, 'remove');
  expect(await listFriends(ctx, target)).toHaveLength(49);
});

it('enforces accepted-contact capacity and keeps repeated blocking idempotent at the cap', async () => {
  const a = await makePlayer(ctx),
    b = await makePlayer(ctx);
  const peers = Array.from({ length: 200 }, () => uuidv7());
  await ctx.db
    .insert(schema.accounts)
    .values(peers.map((id) => ({ id, username: `accepted_${id}`, displayName: 'Contact' })));
  await ctx.db.insert(schema.friendships).values(
    peers.map((id) => {
      const [low, high] = [id, a.accountId].sort();
      return {
        lowAccountId: low!,
        highAccountId: high!,
        requesterId: id,
        lowName: 'Contact',
        highName: 'Contact',
        status: 'accepted',
      };
    }),
  );
  await requestFriend(ctx, b, await name(a));
  await expectCode(actOnFriend(ctx, a, b.accountId, 'accept'), 'CONFLICT');
  await actOnFriend(ctx, a, peers[0]!, 'remove');
  await actOnFriend(ctx, a, b.accountId, 'accept');
  expect((await listFriends(ctx, a)).filter((f) => f.status === 'accepted')).toHaveLength(200);
  await ctx.db
    .insert(schema.socialBlocks)
    .values(
      peers.map((id) => ({ accountId: b.accountId, blockedAccountId: id, blockedName: 'Contact' })),
    );
  await actOnFriend(ctx, b, peers[0]!, 'block');
  expect((await listFriends(ctx, b)).filter((f) => f.status === 'blocked')).toHaveLength(200);
  await expectCode(actOnFriend(ctx, b, a.accountId, 'block'), 'CONFLICT');
});

it('rejects a pagination cursor from another accepted friend’s conversation', async () => {
  const a = await makePlayer(ctx),
    b = await makePlayer(ctx),
    c = await makePlayer(ctx);
  await friends(a, b);
  await friends(a, c);
  const other = await sendDirectMessage(ctx, a, c.accountId, uuidv7(), 'separate conversation');
  await expectCode(directMessageHistory(ctx, b, a.accountId, other.id), 'NOT_FOUND');
  expect((await directMessageHistory(ctx, b, a.accountId)).messages).toEqual([]);
});
