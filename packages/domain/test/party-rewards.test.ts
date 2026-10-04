import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { schema } from '@mmo/db';
import { uuidv7 } from '@mmo/shared';
import { acceptQuest, processKillEvent, recordKill, questRecords } from '../src/index';
import { setupContext, makePlayer } from './helpers';
const ctx = setupContext();
describe('durable shared hunt', () => {
  it('awards a frozen group atomically, splits XP, rolls loot once and ignores concurrent replays', async () => {
    const a = await makePlayer(ctx),
      b = await makePlayer(ctx);
    for (const p of [a, b])
      await acceptQuest(ctx, {
        characterId: p.characterId,
        questId: 'quest.greenvale.wolves_at_the_edge',
        npcId: 'npc.greenvale.elder_maren',
      });
    const killId = uuidv7();
    await recordKill(ctx.db, {
      killId,
      characterId: a.characterId,
      recipients: [a.characterId, b.characterId],
      lootCharacterId: b.characterId,
      enemyId: 'enemy.greenvale.grey_wolf',
      zoneId: 'zone.greenvale.meadows',
      spawnPointId: 'test.party',
      groupId: null,
      diedAt: new Date(),
      respawnAt: new Date(),
    });
    const results = await Promise.all([
      processKillEvent(ctx, killId),
      processKillEvent(ctx, killId),
    ]);
    expect(results.filter((r) => r.status === 'rewarded')).toHaveLength(1);
    const rows = await ctx.db
      .select()
      .from(schema.killRewards)
      .where(eq(schema.killRewards.killId, killId));
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.xp)).toEqual([25, 25]);
    expect(rows.find((r) => r.characterId === a.characterId)).toMatchObject({
      itemCount: 0,
      gold: 0,
    });
    for (const p of [a, b])
      expect((await questRecords(ctx.db, p.characterId))[0]!.progress).toEqual({ kill_wolves: 1 });
    expect((await processKillEvent(ctx, killId)).status).toBe('done');
  });
  it('rejects malformed duplicate recipients without minting anything', async () => {
    const a = await makePlayer(ctx);
    const killId = uuidv7();
    await recordKill(ctx.db, {
      killId,
      characterId: a.characterId,
      recipients: [a.characterId, a.characterId],
      lootCharacterId: a.characterId,
      enemyId: 'enemy.greenvale.grey_wolf',
      zoneId: 'zone.greenvale.meadows',
      spawnPointId: 'test.party',
      groupId: null,
      diedAt: new Date(),
      respawnAt: new Date(),
    });
    expect((await processKillEvent(ctx, killId)).status).toBe('void');
    expect(
      await ctx.db.select().from(schema.killRewards).where(eq(schema.killRewards.killId, killId)),
    ).toHaveLength(0);
  });
  it('rolls back earlier members if loot processing crashes and retries the whole frozen group once', async () => {
    const players = [await makePlayer(ctx), await makePlayer(ctx)].sort((a, b) =>
      a.characterId.localeCompare(b.characterId),
    );
    const [a, b] = players;
    const killId = uuidv7();
    await recordKill(ctx.db, {
      killId,
      characterId: a!.characterId,
      recipients: players.map((p) => p.characterId),
      lootCharacterId: b!.characterId,
      enemyId: 'enemy.greenvale.grey_wolf',
      zoneId: 'zone.greenvale.meadows',
      spawnPointId: 'test.party',
      groupId: null,
      diedAt: new Date(),
      respawnAt: new Date(),
    });
    expect(
      (
        await processKillEvent(
          {
            ...ctx,
            rng: {
              next() {
                throw new Error('simulated loot crash');
              },
            },
          },
          killId,
        )
      ).status,
    ).toBe('retry');
    expect(
      await ctx.db.select().from(schema.killRewards).where(eq(schema.killRewards.killId, killId)),
    ).toHaveLength(0);
    for (const p of players) {
      const [ch] = await ctx.db
        .select()
        .from(schema.characters)
        .where(eq(schema.characters.id, p.characterId));
      expect(ch!.xp).toBe(0);
    }
    expect((await processKillEvent(ctx, killId)).status).toBe('rewarded');
    expect(
      await ctx.db.select().from(schema.killRewards).where(eq(schema.killRewards.killId, killId)),
    ).toHaveLength(2);
  });
  it('records an unclaimed group death without rewarding dead, distant or offline members', async () => {
    const a = await makePlayer(ctx);
    const killId = uuidv7();
    await recordKill(ctx.db, {
      killId,
      characterId: a.characterId,
      recipients: [],
      lootCharacterId: a.characterId,
      enemyId: 'enemy.greenvale.grey_wolf',
      zoneId: 'zone.greenvale.meadows',
      spawnPointId: 'test.party',
      groupId: null,
      diedAt: new Date(),
      respawnAt: new Date(),
    });
    expect((await processKillEvent(ctx, killId)).status).toBe('done');
    const [event] = await ctx.db
      .select()
      .from(schema.killEvents)
      .where(eq(schema.killEvents.killId, killId));
    expect(event!.status).toBe('rewarded');
    expect(
      await ctx.db.select().from(schema.killRewards).where(eq(schema.killRewards.killId, killId)),
    ).toHaveLength(0);
  });
});
