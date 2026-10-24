import { expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { schema } from '@mmo/db';
import { uuidv7 } from '@mmo/shared';
import {
  createGuild,
  guildHistory,
  guildMemberAction,
  guildState,
  inviteGuild,
  leaveGuild,
  respondGuild,
  sendGuildMessage,
  setGuildMotd,
} from '../src/guilds';
import { actOnFriend } from '../src/social';
import { addCharacter, expectCode, makePlayer, setupContext } from './helpers';
import type { TestPlayer } from './helpers';
const ctx = setupContext();
const unique = () => uuidv7().replace(/-/g, '').slice(-12);
const name = async (p: TestPlayer) =>
  (await ctx.db.select().from(schema.characters).where(eq(schema.characters.id, p.characterId)))[0]!
    .name;
async function guild(p: TestPlayer) {
  return createGuild(ctx, p, `Guild ${unique()}`, unique().slice(-5));
}
async function join(a: TestPlayer, b: TestPlayer, id: string) {
  await inviteGuild(ctx, a, await name(b));
  await respondGuild(ctx, b, id, true);
}
it('requires consent and ownership, keeps one guild per character and allows alts their own guild', async () => {
  const a = await makePlayer(ctx),
    b = await makePlayer(ctx),
    c = await makePlayer(ctx),
    id = await guild(a);
  await inviteGuild(ctx, a, (await name(b)).toUpperCase());
  expect((await guildState(ctx, b)).guild).toBeNull();
  expect((await guildState(ctx, b)).invitations[0]!.guildId).toBe(id);
  await expectCode(respondGuild(ctx, c, id, true), 'FORBIDDEN');
  await expectCode(guildState(ctx, { ...a, accountId: c.accountId }), 'NOT_FOUND');
  await Promise.all(Array.from({ length: 4 }, () => respondGuild(ctx, b, id, true)));
  expect((await guildState(ctx, a)).members).toHaveLength(2);
  await expectCode(guild(b), 'CONFLICT');
  const alt = { accountId: b.accountId, characterId: await addCharacter(ctx, b.accountId) };
  expect(await guild(alt)).not.toBe(id);
});
it('serializes simultaneous creation and preserves unique live names/tags', async () => {
  const a = await makePlayer(ctx),
    b = await makePlayer(ctx),
    n = `Guild ${unique()}`,
    tag = unique().slice(-5);
  const results = await Promise.allSettled([
    createGuild(ctx, a, n, tag),
    createGuild(ctx, b, n.toUpperCase(), tag.toLowerCase()),
  ]);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  const c = await makePlayer(ctx);
  const created = await Promise.allSettled([guild(c), guild(c)]);
  expect(created.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
});
it('enforces officer and leader permissions and withdraws former officer invitations', async () => {
  const a = await makePlayer(ctx),
    b = await makePlayer(ctx),
    c = await makePlayer(ctx),
    id = await guild(a);
  await join(a, b, id);
  await expectCode(inviteGuild(ctx, b, await name(c)), 'FORBIDDEN');
  await expectCode(setGuildMotd(ctx, b, 'unauthorized'), 'FORBIDDEN');
  await guildMemberAction(ctx, a, b.characterId, 'promote');
  await inviteGuild(ctx, b, await name(c));
  await setGuildMotd(ctx, b, 'Meet at the Vault');
  expect((await guildState(ctx, a)).guild!.motd).toBe('Meet at the Vault');
  await expectCode(guildMemberAction(ctx, b, a.characterId, 'remove'), 'FORBIDDEN');
  await guildMemberAction(ctx, a, b.characterId, 'demote');
  await expectCode(respondGuild(ctx, c, id, true), 'FORBIDDEN');
  await expectCode(leaveGuild(ctx, a), 'CONFLICT');
  await guildMemberAction(ctx, a, b.characterId, 'transfer');
  await expectCode(leaveGuild(ctx, a, true), 'FORBIDDEN');
  await leaveGuild(ctx, a);
  expect((await guildState(ctx, b)).members).toHaveLength(1);
  expect((await guildState(ctx, b)).members[0]!.role).toBe('leader');
});
it('keeps chat private, literal, idempotent and revokes access on removal and disband', async () => {
  const a = await makePlayer(ctx),
    b = await makePlayer(ctx),
    c = await makePlayer(ctx),
    id = await guild(a);
  await join(a, b, id);
  const messageId = uuidv7();
  const sent = await Promise.all(
    Array.from({ length: 4 }, () => sendGuildMessage(ctx, a, messageId, ' <b>hello</b> ')),
  );
  expect(new Set(sent.map((m) => m.id)).size).toBe(1);
  expect((await guildHistory(ctx, b))[0]).toMatchObject({
    body: '<b>hello</b>',
    fromName: await name(a),
  });
  await expectCode(sendGuildMessage(ctx, a, messageId, 'changed'), 'CONFLICT');
  await expectCode(guildHistory(ctx, c), 'FORBIDDEN');
  await Promise.allSettled([
    sendGuildMessage(ctx, b, uuidv7(), 'racing removal'),
    guildMemberAction(ctx, a, b.characterId, 'remove'),
  ]);
  await expectCode(guildHistory(ctx, b), 'FORBIDDEN');
  await expectCode(sendGuildMessage(ctx, b, uuidv7(), 'after removal'), 'FORBIDDEN');
  await leaveGuild(ctx, a, true);
  expect((await guildState(ctx, a)).guild).toBeNull();
  await expectCode(guildHistory(ctx, a), 'FORBIDDEN');
  expect(
    await ctx.db.select().from(schema.guildMessages).where(eq(schema.guildMessages.id, messageId)),
  ).toHaveLength(1);
});
it('bounds chat rates across alts and retries do not consume extra slots', async () => {
  const a = await makePlayer(ctx),
    id = await guild(a),
    alt = { accountId: a.accountId, characterId: await addCharacter(ctx, a.accountId) };
  await join(a, alt, id);
  const request = uuidv7();
  await sendGuildMessage(ctx, a, request, 'one');
  await sendGuildMessage(ctx, a, request, 'one');
  for (let i = 0; i < 7; i++)
    await sendGuildMessage(ctx, i % 2 ? alt : a, uuidv7(), `message ${i}`);
  await expectCode(sendGuildMessage(ctx, alt, uuidv7(), 'nine'), 'RATE_LIMITED');
  expect(await guildHistory(ctx, a)).toHaveLength(8);
  await expectCode(sendGuildMessage(ctx, a, uuidv7(), ' '), 'VALIDATION_FAILED');
});
it('serializes the last roster slot and cannot accept a second guild concurrently', async () => {
  const a = await makePlayer(ctx),
    b = await makePlayer(ctx),
    c = await makePlayer(ctx),
    id = await guild(a);
  const fillers = Array.from({ length: 48 }, () => ({
    id: uuidv7(),
    accountId: a.accountId,
    name: `F${unique()}`,
    zoneId: 'zone.greenvale.meadows',
    classId: 'class.warrior',
  }));
  await ctx.db.insert(schema.characters).values(fillers);
  await ctx.db
    .insert(schema.guildMembers)
    .values(fillers.map((p) => ({ characterId: p.id, guildId: id })));
  await inviteGuild(ctx, a, await name(b));
  await inviteGuild(ctx, a, await name(c));
  const results = await Promise.allSettled([
    respondGuild(ctx, b, id, true),
    respondGuild(ctx, c, id, true),
  ]);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect((await guildState(ctx, a)).members).toHaveLength(50);
  const d = await makePlayer(ctx),
    e = await makePlayer(ctx),
    f = await makePlayer(ctx),
    dg = await guild(d),
    eg = await guild(e);
  await inviteGuild(ctx, d, await name(f));
  await inviteGuild(ctx, e, await name(f));
  const both = await Promise.allSettled([
    respondGuild(ctx, f, dg, true),
    respondGuild(ctx, f, eg, true),
  ]);
  expect(both.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
});
it('honors blocks, invitation expiry and leader removal of inactive members', async () => {
  const a = await makePlayer(ctx),
    b = await makePlayer(ctx),
    id = await guild(a);
  await actOnFriend(ctx, b, a.accountId, 'block');
  await expectCode(inviteGuild(ctx, a, await name(b)), 'FORBIDDEN');
  await actOnFriend(ctx, b, a.accountId, 'unblock');
  await inviteGuild(ctx, a, await name(b));
  const future = { ...ctx, now: () => new Date(Date.now() + 8 * 86400000) };
  expect((await guildState(future, b)).invitations).toHaveLength(0);
  await expectCode(respondGuild(future, b, id, true), 'FORBIDDEN');
  await respondGuild(ctx, b, id, true);
  await ctx.db
    .update(schema.accounts)
    .set({ status: 'banned' })
    .where(eq(schema.accounts.id, b.accountId));
  await guildMemberAction(ctx, a, b.characterId, 'remove');
  expect((await guildState(ctx, a)).members).toHaveLength(1);
});

it('rejects stale guild actions after changing guilds, including private messages and disband', async () => {
  const a = await makePlayer(ctx),
    old = await guild(a);
  await leaveGuild(ctx, a, true);
  const current = await guild(a),
    stale = { ...a, guildId: old };
  await expectCode(sendGuildMessage(ctx, stale, uuidv7(), 'for the old guild'), 'FORBIDDEN');
  await expectCode(guildHistory(ctx, stale), 'FORBIDDEN');
  await expectCode(leaveGuild(ctx, stale, true), 'FORBIDDEN');
  expect((await guildState(ctx, a)).guild!.id).toBe(current);
});
