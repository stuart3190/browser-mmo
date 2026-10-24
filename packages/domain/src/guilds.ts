import { and, asc, count, desc, eq, gt, inArray, isNull, or, sql } from 'drizzle-orm';
import { schema } from '@mmo/db';
import type { Tx } from '@mmo/db';
import { ChatMessageTextSchema, GuildNameSchema, GuildTagSchema } from '@mmo/schemas';
import type { GuildMemberAction, GuildMessage, GuildState } from '@mmo/schemas';
import { DomainError, ErrorCode, uuidv7 } from '@mmo/shared';
import type { DomainContext } from './context';
import { requireOwnedCharacter } from './items';
import { recordAudit } from './history';
import { inTransaction } from './tx';

type Actor = { accountId: string; characterId: string; guildId?: string };
type GuildRow = typeof schema.guilds.$inferSelect;
const memberWhere = (id: string) => eq(schema.guildMembers.characterId, id);
function forbidden(message = 'This guild action is not available'): never {
  throw new DomainError(ErrorCode.FORBIDDEN, message);
}
function conflict(message: string): never {
  throw new DomainError(ErrorCode.CONFLICT, message);
}

/** Shared account order with friends/blocks, then character order, then guild. Never reverse it. */
async function lockActors(tx: Tx, actor: Actor, targetId?: string, requireActiveTarget = true) {
  const owner = await requireOwnedCharacter(tx, actor.accountId, actor.characterId);
  const [target] = targetId
    ? await tx
        .select()
        .from(schema.characters)
        .where(and(eq(schema.characters.id, targetId), isNull(schema.characters.deletedAt)))
    : [owner];
  if (!target) throw new DomainError(ErrorCode.NOT_FOUND, 'Character not found');
  const accounts = await tx
    .select()
    .from(schema.accounts)
    .where(inArray(schema.accounts.id, [...new Set([owner.accountId, target.accountId])]))
    .orderBy(asc(schema.accounts.id))
    .for('no key update');
  if (
    accounts.some((a) => a.status !== 'active' && (a.id === actor.accountId || requireActiveTarget))
  )
    forbidden('Character unavailable');
  const chars = await tx
    .select()
    .from(schema.characters)
    .where(inArray(schema.characters.id, [...new Set([owner.id, target.id])]))
    .orderBy(asc(schema.characters.id))
    .for('no key update');
  if (chars.some((c) => c.deletedAt)) forbidden('Character unavailable');
  return { owner, target };
}
async function lockGuild(tx: Tx, id: string): Promise<GuildRow> {
  const [guild] = await tx
    .select()
    .from(schema.guilds)
    .where(eq(schema.guilds.id, id))
    .for('update');
  if (!guild || guild.disbandedAt) forbidden('Guild unavailable');
  return guild;
}
async function membership(tx: Tx, actor: Actor) {
  const [before] = await tx
    .select()
    .from(schema.guildMembers)
    .where(memberWhere(actor.characterId));
  if (!before) forbidden('Join a guild first');
  if (actor.guildId && actor.guildId !== before.guildId)
    forbidden('Guild membership changed; refresh before continuing');
  const guild = await lockGuild(tx, before.guildId);
  const [member] = await tx
    .select()
    .from(schema.guildMembers)
    .where(memberWhere(actor.characterId));
  if (!member || member.guildId !== guild.id) forbidden('Join a guild first');
  return { guild, member, leader: guild.leaderCharacterId === actor.characterId };
}
function audit(
  tx: Tx,
  ctx: DomainContext,
  actor: Actor,
  action: string,
  guildId: string,
  details: Record<string, unknown> = {},
) {
  return recordAudit(tx, {
    actor,
    action: `guild.${action}`,
    targetType: 'guild',
    targetId: guildId,
    details,
    at: ctx.now(),
  });
}
const guildView = (g: GuildRow) => ({
  id: g.id,
  name: g.name,
  tag: g.tag,
  leaderCharacterId: g.leaderCharacterId,
  motd: g.motd,
  createdAt: g.createdAt.toISOString(),
});
export async function guildState(ctx: DomainContext, actor: Actor): Promise<GuildState> {
  return inTransaction(ctx, async (tx) => {
    await lockActors(tx, actor);
    const [member] = await tx
      .select()
      .from(schema.guildMembers)
      .where(memberWhere(actor.characterId));
    if (!member) {
      const rows = await tx
        .select({ invite: schema.guildInvites, guild: schema.guilds })
        .from(schema.guildInvites)
        .innerJoin(schema.guilds, eq(schema.guilds.id, schema.guildInvites.guildId))
        .where(
          and(
            eq(schema.guildInvites.characterId, actor.characterId),
            gt(schema.guildInvites.expiresAt, ctx.now()),
            isNull(schema.guilds.disbandedAt),
          ),
        )
        .orderBy(desc(schema.guildInvites.createdAt))
        .limit(10);
      return {
        guild: null,
        members: [],
        invitations: rows.map(({ invite, guild }) => ({
          guildId: guild.id,
          name: guild.name,
          tag: guild.tag,
          expiresAt: invite.expiresAt.toISOString(),
        })),
      };
    }
    const { guild } = await membership(tx, actor);
    const rows = await tx
      .select({ member: schema.guildMembers, character: schema.characters })
      .from(schema.guildMembers)
      .innerJoin(schema.characters, eq(schema.characters.id, schema.guildMembers.characterId))
      .where(eq(schema.guildMembers.guildId, guild.id))
      .orderBy(asc(schema.guildMembers.joinedAt), asc(schema.guildMembers.characterId));
    return {
      guild: guildView(guild),
      invitations: [],
      members: rows.map(({ member, character }) => ({
        characterId: character.id,
        name: character.name,
        level: character.level,
        classId: character.classId,
        role:
          character.id === guild.leaderCharacterId
            ? 'leader'
            : (member.role as 'officer' | 'member'),
        joinedAt: member.joinedAt.toISOString(),
      })),
    };
  });
}
export async function createGuild(ctx: DomainContext, actor: Actor, name: string, tag: string) {
  const parsedName = GuildNameSchema.safeParse(name),
    parsedTag = GuildTagSchema.safeParse(tag);
  if (!parsedName.success || !parsedTag.success)
    throw new DomainError(
      ErrorCode.VALIDATION_FAILED,
      'Choose a 3–32 character guild name and a 2–5 letter or number tag',
    );
  return inTransaction(ctx, async (tx) => {
    await lockActors(tx, actor);
    if ((await tx.select().from(schema.guildMembers).where(memberWhere(actor.characterId))).length)
      conflict('Leave your current guild first');
    const id = uuidv7();
    await tx.insert(schema.guilds).values({
      id,
      name: parsedName.data,
      tag: parsedTag.data,
      leaderCharacterId: actor.characterId,
      createdAt: ctx.now(),
    });
    await tx
      .insert(schema.guildMembers)
      .values({ guildId: id, characterId: actor.characterId, joinedAt: ctx.now() });
    await tx
      .delete(schema.guildInvites)
      .where(eq(schema.guildInvites.characterId, actor.characterId));
    await audit(tx, ctx, actor, 'create', id);
    return id;
  });
}
export async function inviteGuild(ctx: DomainContext, actor: Actor, name: string) {
  return inTransaction(ctx, async (tx) => {
    const [peer] = await tx
      .select()
      .from(schema.characters)
      .where(
        and(
          sql`lower(${schema.characters.name})=lower(${name.trim()})`,
          isNull(schema.characters.deletedAt),
        ),
      );
    if (!peer) throw new DomainError(ErrorCode.NOT_FOUND, 'Character not found');
    await lockActors(tx, actor, peer.id);
    const { guild, member, leader } = await membership(tx, actor);
    if (!leader && member.role !== 'officer') forbidden('Only the leader or an officer can invite');
    if ((await tx.select().from(schema.guildMembers).where(memberWhere(peer.id))).length)
      conflict('That character already belongs to a guild');
    const blocks = await tx
      .select()
      .from(schema.socialBlocks)
      .where(
        or(
          and(
            eq(schema.socialBlocks.accountId, actor.accountId),
            eq(schema.socialBlocks.blockedAccountId, peer.accountId),
          ),
          and(
            eq(schema.socialBlocks.accountId, peer.accountId),
            eq(schema.socialBlocks.blockedAccountId, actor.accountId),
          ),
        ),
      )
      .limit(1);
    if (blocks.length) forbidden('This contact is unavailable');
    const now = ctx.now();
    const [incoming] = await tx
      .select({ n: count() })
      .from(schema.guildInvites)
      .where(
        and(eq(schema.guildInvites.characterId, peer.id), gt(schema.guildInvites.expiresAt, now)),
      );
    const [outgoing] = await tx
      .select({ n: count() })
      .from(schema.guildInvites)
      .where(
        and(eq(schema.guildInvites.guildId, guild.id), gt(schema.guildInvites.expiresAt, now)),
      );
    if (incoming!.n >= 10 || outgoing!.n >= 50) conflict('An invitation list is full');
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    await tx
      .insert(schema.guildInvites)
      .values({
        guildId: guild.id,
        characterId: peer.id,
        invitedBy: actor.characterId,
        createdAt: now,
        expiresAt,
      })
      .onConflictDoUpdate({
        target: [schema.guildInvites.guildId, schema.guildInvites.characterId],
        set: { invitedBy: actor.characterId, createdAt: now, expiresAt },
      });
    await audit(tx, ctx, actor, 'invite', guild.id, { characterId: peer.id });
  });
}
export async function respondGuild(
  ctx: DomainContext,
  actor: Actor,
  guildId: string,
  accept: boolean,
) {
  return inTransaction(ctx, async (tx) => {
    await lockActors(tx, actor);
    const where = and(
      eq(schema.guildInvites.guildId, guildId),
      eq(schema.guildInvites.characterId, actor.characterId),
    );
    if (!accept) {
      await tx.delete(schema.guildInvites).where(where);
      return;
    }
    const guild = await lockGuild(tx, guildId);
    const [current] = await tx
      .select()
      .from(schema.guildMembers)
      .where(memberWhere(actor.characterId));
    if (current?.guildId === guildId) return;
    if (current) conflict('Leave your current guild first');
    const [invite] = await tx
      .select()
      .from(schema.guildInvites)
      .where(and(where, gt(schema.guildInvites.expiresAt, ctx.now())));
    if (!invite) forbidden('This invitation expired or was withdrawn');
    const [total] = await tx
      .select({ n: count() })
      .from(schema.guildMembers)
      .where(eq(schema.guildMembers.guildId, guildId));
    if (total!.n >= 50) conflict('This guild has reached its 50 member limit');
    await tx
      .insert(schema.guildMembers)
      .values({ guildId: guild.id, characterId: actor.characterId, joinedAt: ctx.now() });
    await tx
      .delete(schema.guildInvites)
      .where(eq(schema.guildInvites.characterId, actor.characterId));
    await audit(tx, ctx, actor, 'join', guildId);
  });
}
export async function guildMemberAction(
  ctx: DomainContext,
  actor: Actor,
  targetId: string,
  action: GuildMemberAction,
) {
  return inTransaction(ctx, async (tx) => {
    await lockActors(tx, actor, targetId, action !== 'remove' && action !== 'demote');
    const { guild, leader } = await membership(tx, actor);
    if (!leader) forbidden('Only the guild leader can manage ranks and membership');
    if (targetId === actor.characterId) conflict('Choose another guild member');
    const [target] = await tx.select().from(schema.guildMembers).where(memberWhere(targetId));
    if (target?.guildId !== guild.id) forbidden('Choose a current guild member');
    if (action === 'remove') await tx.delete(schema.guildMembers).where(memberWhere(targetId));
    else if (action === 'transfer')
      await tx
        .update(schema.guilds)
        .set({ leaderCharacterId: targetId })
        .where(eq(schema.guilds.id, guild.id));
    else
      await tx
        .update(schema.guildMembers)
        .set({ role: action === 'promote' ? 'officer' : 'member' })
        .where(memberWhere(targetId));
    if (action === 'remove' || action === 'demote' || action === 'transfer')
      await tx
        .delete(schema.guildInvites)
        .where(
          and(
            eq(schema.guildInvites.guildId, guild.id),
            eq(schema.guildInvites.invitedBy, action === 'transfer' ? actor.characterId : targetId),
          ),
        );
    await audit(tx, ctx, actor, action, guild.id, { characterId: targetId });
  });
}
export async function leaveGuild(ctx: DomainContext, actor: Actor, disband = false) {
  return inTransaction(ctx, async (tx) => {
    await lockActors(tx, actor);
    const { guild, leader } = await membership(tx, actor);
    if (disband) {
      if (!leader) forbidden('Only the leader can disband the guild');
      await tx
        .update(schema.guilds)
        .set({ disbandedAt: ctx.now() })
        .where(eq(schema.guilds.id, guild.id));
      await tx.delete(schema.guildMembers).where(eq(schema.guildMembers.guildId, guild.id));
      await tx.delete(schema.guildInvites).where(eq(schema.guildInvites.guildId, guild.id));
    } else {
      if (leader) conflict('Transfer leadership or disband your guild before leaving');
      await tx.delete(schema.guildMembers).where(memberWhere(actor.characterId));
      await tx
        .delete(schema.guildInvites)
        .where(
          and(
            eq(schema.guildInvites.guildId, guild.id),
            eq(schema.guildInvites.invitedBy, actor.characterId),
          ),
        );
    }
    await audit(tx, ctx, actor, disband ? 'disband' : 'leave', guild.id);
  });
}
export async function setGuildMotd(ctx: DomainContext, actor: Actor, motd: string) {
  if (motd.length > 500)
    throw new DomainError(
      ErrorCode.VALIDATION_FAILED,
      'Keep the guild notice within 500 characters',
    );
  return inTransaction(ctx, async (tx) => {
    await lockActors(tx, actor);
    const { guild, member, leader } = await membership(tx, actor);
    if (!leader && member.role !== 'officer')
      forbidden('Only the leader or an officer can edit the notice');
    await tx.update(schema.guilds).set({ motd: motd.trim() }).where(eq(schema.guilds.id, guild.id));
    await audit(tx, ctx, actor, 'notice', guild.id);
  });
}
const messageView = (m: typeof schema.guildMessages.$inferSelect): GuildMessage => ({
  id: m.id,
  guildId: m.guildId,
  fromCharacterId: m.fromCharacterId,
  fromName: m.fromName,
  body: m.body,
  sentAt: m.sentAt.toISOString(),
});
export async function guildHistory(ctx: DomainContext, actor: Actor): Promise<GuildMessage[]> {
  return inTransaction(ctx, async (tx) => {
    await lockActors(tx, actor);
    const { guild } = await membership(tx, actor);
    const rows = await tx
      .select()
      .from(schema.guildMessages)
      .where(eq(schema.guildMessages.guildId, guild.id))
      .orderBy(desc(schema.guildMessages.sentAt), desc(schema.guildMessages.id))
      .limit(100);
    return rows.reverse().map(messageView);
  });
}
export async function sendGuildMessage(
  ctx: DomainContext,
  actor: Actor,
  id: string,
  body: string,
): Promise<GuildMessage> {
  const parsed = ChatMessageTextSchema.safeParse(body);
  if (!parsed.success) throw new DomainError(ErrorCode.VALIDATION_FAILED, 'Use 1–500 characters');
  return inTransaction(ctx, async (tx) => {
    const { owner } = await lockActors(tx, actor);
    const { guild } = await membership(tx, actor);
    const [prior] = await tx
      .select()
      .from(schema.guildMessages)
      .where(eq(schema.guildMessages.id, id));
    if (prior) {
      if (
        prior.guildId !== guild.id ||
        prior.fromCharacterId !== actor.characterId ||
        prior.body !== parsed.data
      )
        conflict('Message identifier already used');
      return messageView(prior);
    }
    const [recent] = await tx
      .select({ n: count() })
      .from(schema.guildMessages)
      .where(
        and(
          eq(schema.guildMessages.fromAccountId, actor.accountId),
          gt(schema.guildMessages.sentAt, new Date(ctx.now().getTime() - 10000)),
        ),
      );
    if (recent!.n >= 8)
      throw new DomainError(
        ErrorCode.RATE_LIMITED,
        'Wait a moment before sending another guild message',
      );
    const [sent] = await tx
      .insert(schema.guildMessages)
      .values({
        id,
        guildId: guild.id,
        fromAccountId: actor.accountId,
        fromCharacterId: actor.characterId,
        fromName: owner.name,
        body: parsed.data,
        sentAt: ctx.now(),
      })
      .returning();
    return messageView(sent!);
  });
}
