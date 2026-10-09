import { expect, it } from 'vitest';
import { and, eq, like, sql } from 'drizzle-orm';
import { schema, ZoneOwnership } from '@mmo/db';
import { uuidv7 } from '@mmo/shared';
import { brokenVault, toolFor } from '@mmo/game-data';
import {
  admitDungeon,
  completeDungeon,
  instanceKey,
  exchangeAtNpc,
  finishCraft,
  professionState,
  consumeRemedy,
  harvestResource,
  grantItemInTx,
  inTransaction,
  getCharacterItems,
} from '../src';
import { setupContext, makePlayer, expectCode } from './helpers';
const ctx = setupContext();
async function grant(p: Awaited<ReturnType<typeof makePlayer>>, templateId: string, quantity = 1) {
  return inTransaction(ctx, (tx) =>
    grantItemInTx(tx, ctx, { ...p, templateId, quantity, method: 'system', actor: p }),
  );
}
async function level(p: Awaited<ReturnType<typeof makePlayer>>) {
  await ctx.db
    .update(schema.characters)
    .set({ level: 4 })
    .where(eq(schema.characters.id, p.characterId));
}
it('reserves one timed craft under competing requests, rejects early claims and completes exactly once after restart', async () => {
  const p = await makePlayer(ctx);
  await grant(p, 'material.world.wild_herb', 4);
  const req = {
    ...p,
    npcId: 'npc.world.greenvale_marches.profession',
    offerId: 'service.greenvale.craft_remedy',
    requestId: uuidv7(),
  };
  const starts = await Promise.all(Array.from({ length: 6 }, () => exchangeAtNpc(ctx, req)));
  expect(starts.filter((r) => !r.duplicate)).toHaveLength(1);
  await expectCode(finishCraft(ctx, { ...p, jobId: req.requestId }), 'CONFLICT');
  await expectCode(exchangeAtNpc(ctx, { ...req, requestId: uuidv7() }), 'CONFLICT');
  await ctx.db
    .update(schema.craftJobs)
    .set({ readyAt: new Date(0) })
    .where(eq(schema.craftJobs.id, req.requestId));
  const completions = await Promise.all(
    Array.from({ length: 6 }, () => finishCraft({ ...ctx }, { ...p, jobId: req.requestId })),
  );
  expect(completions.filter(Boolean)).toHaveLength(1);
  expect(
    (await professionState(ctx, p.characterId)).professions.find((p) => p.id === 'crafting')!.xp,
  ).toBe(20);
  expect(
    await ctx.db
      .select()
      .from(schema.itemInstances)
      .where(eq(schema.itemInstances.sourceRef, `craft:${req.requestId}`)),
  ).toHaveLength(1);
});
it('failed craft delivery retains the ready job and progression until space exists', async () => {
  const p = await makePlayer(ctx);
  await grant(p, 'material.world.wild_herb', 2);
  const requestId = uuidv7();
  await exchangeAtNpc(ctx, {
    ...p,
    npcId: 'npc.world.greenvale_marches.profession',
    offerId: 'service.greenvale.craft_remedy',
    requestId,
  });
  await ctx.db
    .update(schema.craftJobs)
    .set({ readyAt: new Date(0) })
    .where(eq(schema.craftJobs.id, requestId));
  await ctx.db.execute(
    sql`update containers set capacity=1 where owner_character_id=${p.characterId} and kind in ('backpack','mailbox')`,
  );
  await grant(p, 'accessory.ring.copper_band');
  await inTransaction(ctx, (tx) =>
    grantItemInTx(tx, ctx, {
      ...p,
      templateId: 'accessory.ring.copper_band',
      quantity: 1,
      method: 'system',
      actor: p,
      containerKind: 'mailbox',
    }),
  );
  await expectCode(finishCraft(ctx, { ...p, jobId: requestId }), 'CONTAINER_FULL');
  expect(
    (await professionState(ctx, p.characterId)).professions.find((p) => p.id === 'crafting')!.xp,
  ).toBe(0);
  expect((await professionState(ctx, p.characterId)).jobs[0]!.completed).toBe(false);
});
it('uses only owned unlocked backpack tools and applies rank-gated tier bonuses atomically with harvest XP', async () => {
  const p = await makePlayer(ctx),
    nodeId = 'node.greenvale_marches.herb_beds';
  await grant(p, toolFor('herbalism', 2));
  for (let n = 0; n < 11; n++) {
    await ctx.db.delete(schema.resourceHarvests).where(eq(schema.resourceHarvests.nodeId, nodeId));
    await harvestResource(ctx, { ...p, nodeId });
  }
  expect(
    (await professionState(ctx, p.characterId)).professions.find((p) => p.id === 'herbalism')!.xp,
  ).toBe(120);
  const inventory = await getCharacterItems(ctx.db, ctx, p.accountId, p.characterId);
  expect(
    inventory.containers
      .flatMap((c) => c.items)
      .find((i) => i.template.id === 'material.world.wild_herb')!.instance.quantity,
  ).toBe(24);
});
it('consumable replay/concurrency decrements one exact stack and stores one durable pending heal with persistent cooldown', async () => {
  const p = await makePlayer(ctx),
    other = await makePlayer(ctx);
  const remedy = await grant(p, 'consumable.greenvale.remedy', 3);
  const req = { ...p, itemId: remedy.created.id, requestId: uuidv7() };
  await expectCode(consumeRemedy(ctx, { ...req, accountId: other.accountId }), 'NOT_FOUND');
  await Promise.all(Array.from({ length: 6 }, () => consumeRemedy(ctx, req)));
  await expectCode(consumeRemedy({ ...ctx }, { ...req, requestId: uuidv7() }), 'CONFLICT');
  const [item] = await ctx.db
    .select()
    .from(schema.itemInstances)
    .where(eq(schema.itemInstances.id, req.itemId));
  expect(item!.quantity).toBe(2);
  expect(
    await ctx.db
      .select()
      .from(schema.consumableUses)
      .where(eq(schema.consumableUses.characterId, p.characterId)),
  ).toHaveLength(1);
});
it('admission serializes overlapping cohorts, requires level four and reserves membership without admitting a stranger', async () => {
  const p = await makePlayer(ctx),
    q = await makePlayer(ctx),
    r = await makePlayer(ctx);
  await level(p);
  await level(q);
  await level(r);
  const results = await Promise.allSettled([
    admitDungeon(ctx, { ...p, memberIds: [p.characterId, q.characterId], partyId: uuidv7() }),
    admitDungeon(ctx, { ...r, memberIds: [r.characterId, q.characterId], partyId: uuidv7() }),
  ]);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  const low = await makePlayer(ctx);
  await expectCode(
    admitDungeon(ctx, { ...low, memberIds: [low.characterId], partyId: null }),
    'FORBIDDEN',
  );
});
it('completion requires all private deaths, rewards only joined members exactly once and preserves ledger/provenance', async () => {
  const p = await makePlayer(ctx),
    q = await makePlayer(ctx);
  await level(p);
  await level(q);
  const instance = await admitDungeon(ctx, {
    ...p,
    memberIds: [p.characterId, q.characterId],
    partyId: uuidv7(),
  });
  await ctx.db
    .update(schema.dungeonMembers)
    .set({ joinedAt: new Date() })
    .where(
      and(
        eq(schema.dungeonMembers.instanceId, instance.id),
        eq(schema.dungeonMembers.characterId, p.characterId),
      ),
    );
  expect(await completeDungeon(ctx, instance.id)).toBe(false);
  for (const spawnPointId of brokenVault.objectives)
    await ctx.db.insert(schema.killEvents).values({
      killId: uuidv7(),
      zoneId: instanceKey(instance.id),
      enemyId: 'enemy.world.greenvale_marches.stonekin.5',
      spawnPointId,
      characterId: p.characterId,
      diedAt: new Date(),
      respawnAt: new Date(Date.now() + 100000),
      status: 'rewarded',
    });
  const results = await Promise.all(
    Array.from({ length: 6 }, () => completeDungeon(ctx, instance.id)),
  );
  expect(results.filter(Boolean)).toHaveLength(1);
  expect(
    await ctx.db
      .select()
      .from(schema.itemInstances)
      .where(like(schema.itemInstances.sourceRef, `dungeon:${instance.id}:%`)),
  ).toHaveLength(1);
  const ledger = await ctx.db.execute(
    sql`select count(*)::int n from currency_ledger where owner_character_id=${p.characterId} and reason='loot' and delta=150`,
  );
  expect(ledger.rows[0]).toMatchObject({ n: 1 });
  const members = await ctx.db
    .select()
    .from(schema.dungeonMembers)
    .where(eq(schema.dungeonMembers.instanceId, instance.id));
  expect(members.filter((m) => m.rewardedAt)).toHaveLength(1);
});
it('does not complete expired runs or reuse their identity and ignores deaths from another private instance', async () => {
  const p = await makePlayer(ctx);
  await level(p);
  const first = await admitDungeon(ctx, { ...p, memberIds: [p.characterId], partyId: null });
  await ctx.db
    .update(schema.dungeonInstances)
    .set({ expiresAt: new Date(0) })
    .where(eq(schema.dungeonInstances.id, first.id));
  expect(await completeDungeon(ctx, first.id)).toBe(false);
  const second = await admitDungeon(ctx, { ...p, memberIds: [p.characterId], partyId: null });
  expect(second.id).not.toBe(first.id);
  expect(await completeDungeon(ctx, second.id)).toBe(false);
});

it('party payout races with repeated fenced checkpoints without membership/character lock inversion', async () => {
  const players = await Promise.all([makePlayer(ctx), makePlayer(ctx)]);
  for (const p of players) await level(p);
  const instance = await admitDungeon(ctx, {
    ...players[0]!,
    memberIds: players.map((p) => p.characterId),
    partyId: uuidv7(),
  });
  const joinedAt = new Date('2026-01-01T00:00:00Z');
  await ctx.db
    .update(schema.dungeonMembers)
    .set({ joinedAt })
    .where(eq(schema.dungeonMembers.instanceId, instance.id));
  for (const spawnPointId of brokenVault.objectives)
    await ctx.db.insert(schema.killEvents).values({
      killId: uuidv7(),
      zoneId: instanceKey(instance.id),
      enemyId: 'enemy.greenvale.vault_keeper',
      spawnPointId,
      characterId: players[0]!.characterId,
      diedAt: new Date(),
      respawnAt: new Date(Date.now() + 100000),
      status: 'rewarded',
    });
  const lost: unknown[] = [];
  const owner = new ZoneOwnership(ctx.db, (error) => lost.push(error));
  const key = instanceKey(instance.id);
  await owner.acquire([key]);
  try {
    const checkpoints = (async () => {
      for (let i = 0; i < 20; i++)
        await owner.commit([
          {
            zoneId: key,
            catalogZoneId: brokenVault.zoneId,
            instanceId: instance.id,
            payload: '{}',
            characters: [...players].reverse().map((p) => ({
              id: p.characterId,
              x: 8 + i / 100,
              y: 0,
              z: 32,
              rotation: 0,
              health: 100 - i,
              cooldowns: {},
            })),
          },
        ]);
    })();
    const results = await Promise.all([
      checkpoints,
      ...Array.from({ length: 6 }, () => completeDungeon(ctx, instance.id)),
    ]);
    expect(results.filter((r) => r === true)).toHaveLength(1);
    expect(owner.active).toBe(true);
    expect(lost).toEqual([]);
    const members = await ctx.db
      .select()
      .from(schema.dungeonMembers)
      .where(eq(schema.dungeonMembers.instanceId, instance.id));
    expect(members.every((m) => m.rewardedAt && m.joinedAt?.getTime() === joinedAt.getTime())).toBe(
      true,
    );
    expect(
      await ctx.db
        .select()
        .from(schema.itemInstances)
        .where(like(schema.itemInstances.sourceRef, `dungeon:${instance.id}:%`)),
    ).toHaveLength(2);
    const ledger = await ctx.db.execute(
      sql`select count(*)::int n from currency_ledger where owner_character_id in (${players[0]!.characterId},${players[1]!.characterId}) and reason='loot' and delta=150`,
    );
    expect(ledger.rows[0]).toMatchObject({ n: 2 });
  } finally {
    await owner.close();
    await ctx.db.delete(schema.zoneCheckpoints).where(eq(schema.zoneCheckpoints.zoneId, key));
  }
});
