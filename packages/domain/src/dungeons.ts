import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import { schema } from '@mmo/db';
import { brokenVault } from '@mmo/game-data';
import { DomainError, ErrorCode, uuidv7 } from '@mmo/shared';
import type { DomainContext } from './context';
import { inTransaction } from './tx';
import { grantItemInTx, requireOwnedCharacter } from './items';
import { ensureMailbox } from './containers';
import { adjustBalanceInTx } from './currency';
export const instanceKey = (id: string) => `instance:${id}`;
/** Caller freezes an alive, online, nearby cohort from the owned simulation. DB serializes overlapping cohorts. */
export async function admitDungeon(
  ctx: DomainContext,
  input: { accountId: string; characterId: string; memberIds: string[]; partyId: string | null },
) {
  return inTransaction(ctx, async (tx) => {
    await requireOwnedCharacter(tx, input.accountId, input.characterId);
    const ids = [...new Set(input.memberIds)].sort();
    if (!ids.includes(input.characterId) || !ids.length || ids.length > brokenVault.maxMembers)
      throw new DomainError(ErrorCode.FORBIDDEN, 'Invalid dungeon cohort');
    const members = await tx
      .select()
      .from(schema.characters)
      .where(inArray(schema.characters.id, ids))
      .orderBy(schema.characters.id)
      .for('update');
    if (
      members.length !== ids.length ||
      members.some((c) => c.deletedAt || c.level < brokenVault.minLevel)
    )
      throw new DomainError(ErrorCode.FORBIDDEN, 'Every member needs level four');
    const clock = await tx.execute(sql`select clock_timestamp() as now`),
      now = new Date((clock.rows[0] as { now: Date }).now);
    const existing = await tx
      .select({ instance: schema.dungeonInstances })
      .from(schema.dungeonMembers)
      .innerJoin(
        schema.dungeonInstances,
        eq(schema.dungeonMembers.instanceId, schema.dungeonInstances.id),
      )
      .where(
        and(
          inArray(schema.dungeonMembers.characterId, ids),
          ne(schema.dungeonInstances.status, 'expired'),
        ),
      );
    const live = existing.filter((r) => r.instance.expiresAt > now);
    // Look up the caller's own reservation, never somebody else's overlapping group.
    const own = await tx
      .select({ instance: schema.dungeonInstances })
      .from(schema.dungeonMembers)
      .innerJoin(
        schema.dungeonInstances,
        eq(schema.dungeonMembers.instanceId, schema.dungeonInstances.id),
      )
      .where(
        and(
          eq(schema.dungeonMembers.characterId, input.characterId),
          ne(schema.dungeonInstances.status, 'expired'),
        ),
      );
    const reservation = own.find((r) => r.instance.expiresAt > now)?.instance;
    if (reservation) return reservation;
    if (live.length)
      throw new DomainError(ErrorCode.CONFLICT, 'A member already belongs to a live run');
    const id = uuidv7();
    const [instance] = await tx
      .insert(schema.dungeonInstances)
      .values({
        id,
        dungeonId: brokenVault.id,
        ownerCharacterId: input.characterId,
        partyId: input.partyId,
        expiresAt: new Date(now.getTime() + brokenVault.lifetimeMs),
      })
      .returning();
    await tx
      .insert(schema.dungeonMembers)
      .values(ids.map((characterId) => ({ instanceId: id, characterId })));
    return instance!;
  });
}
/** Completion derives from durable instance-scoped deaths, never a client completion flag. */
export async function completeDungeon(ctx: DomainContext, id: string) {
  return inTransaction(ctx, async (tx) => {
    const [instance] = await tx
      .select()
      .from(schema.dungeonInstances)
      .where(eq(schema.dungeonInstances.id, id))
      .for('update');
    if (!instance || instance.status !== 'active') return false;
    const clock = await tx.execute(sql`select clock_timestamp() as now`),
      now = new Date((clock.rows[0] as { now: Date }).now);
    if (instance.expiresAt <= now) return false;
    const kills = await tx
      .select({ spawn: schema.killEvents.spawnPointId })
      .from(schema.killEvents)
      .where(eq(schema.killEvents.zoneId, instanceKey(id)));
    if (!brokenVault.objectives.every((spawn) => kills.some((k) => k.spawn === spawn)))
      return false;
    const members = await tx
      .select()
      .from(schema.dungeonMembers)
      .where(eq(schema.dungeonMembers.instanceId, id))
      .orderBy(schema.dungeonMembers.characterId);
    // Use the same sorted character-before-membership lock order as fenced checkpoints.
    const characters = await tx
      .select()
      .from(schema.characters)
      .where(
        inArray(
          schema.characters.id,
          members.map((m) => m.characterId),
        ),
      )
      .orderBy(schema.characters.id)
      .for('update');
    // Only players who physically joined this run receive personal completion supplies.
    for (const member of members.filter((m) => m.joinedAt)) {
      const character = characters.find((c) => c.id === member.characterId);
      if (!character || character.deletedAt || member.rewardedAt) continue;
      const correlationId = uuidv7();
      const grant = {
        accountId: character.accountId,
        characterId: character.id,
        templateId: brokenVault.rewardTemplateId,
        quantity: brokenVault.rewardQuantity,
        method: 'loot_drop' as const,
        sourceRef: `dungeon:${id}:${character.id}`,
        actor: { accountId: character.accountId, characterId: character.id },
        correlationId,
      };
      try {
        await tx.transaction((sp) => grantItemInTx(sp, ctx, grant));
      } catch (err) {
        if (!(err instanceof DomainError) || err.code !== ErrorCode.CONTAINER_FULL) throw err;
        await ensureMailbox(tx, character.accountId, character.id);
        await grantItemInTx(tx, ctx, { ...grant, containerKind: 'mailbox' });
      }
      await adjustBalanceInTx(tx, ctx, {
        accountId: character.accountId,
        characterId: character.id,
        currencyId: 'gold',
        delta: brokenVault.rewardCopper,
        reason: 'loot',
        correlationId,
      });
      await tx
        .update(schema.dungeonMembers)
        .set({ rewardedAt: now })
        .where(
          and(
            eq(schema.dungeonMembers.instanceId, id),
            eq(schema.dungeonMembers.characterId, character.id),
          ),
        );
    }
    await tx
      .update(schema.dungeonInstances)
      .set({ status: 'completed', completedAt: now })
      .where(eq(schema.dungeonInstances.id, id));
    return true;
  });
}
