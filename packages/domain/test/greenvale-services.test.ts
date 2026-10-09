import { expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { schema } from '@mmo/db';
import { uuidv7 } from '@mmo/shared';
import {
  exchangeAtNpc,
  finishCraft,
  adjustBalanceInTx,
  discoverLocations,
  getDiscoveries,
  getCharacterItems,
  grantItemInTx,
  inTransaction,
  acceptQuest,
  turnInQuest,
  getQuestLog,
} from '../src/index';
import { makePlayer, setupContext, expectCode } from './helpers';
const ctx = setupContext();
const npc = 'npc.world.greenvale_marches.profession';
async function materials(
  p: { accountId: string; characterId: string },
  templateId: string,
  quantity: number,
) {
  await inTransaction(ctx, (tx) =>
    grantItemInTx(tx, ctx, { ...p, templateId, quantity, method: 'system', actor: p }),
  );
}
it('crafts a real item once under six competing requests and preserves all costs/provenance', async () => {
  const p = await makePlayer(ctx);
  await materials(p, 'material.world.hardwood', 2);
  await materials(p, 'material.world.iron_shard', 4);
  const request = {
    ...p,
    npcId: npc,
    offerId: 'service.greenvale.craft_sword',
    requestId: uuidv7(),
  };
  const results = await Promise.all(Array.from({ length: 6 }, () => exchangeAtNpc(ctx, request)));
  expect(results.filter((r) => !r.duplicate)).toHaveLength(1);
  await ctx.db
    .update(schema.craftJobs)
    .set({ readyAt: new Date(0) })
    .where(eq(schema.craftJobs.id, request.requestId));
  await finishCraft(ctx, { ...p, jobId: request.requestId });
  const inv = await getCharacterItems(ctx.db, ctx, p.accountId, p.characterId);
  expect(
    inv.containers
      .flatMap((c) => c.items)
      .filter((i) => i.template.id === 'weapon.sword.iron_longsword'),
  ).toHaveLength(1);
  expect(inv.containers.find((c) => c.container.kind === 'material_pouch')!.items).toHaveLength(0);
  expect(
    await ctx.db
      .select()
      .from(schema.serviceReceipts)
      .where(eq(schema.serviceReceipts.characterId, p.characterId)),
  ).toHaveLength(1);
  await expectCode(
    exchangeAtNpc(ctx, { ...request, offerId: 'service.greenvale.craft_staff' }),
    'CONFLICT',
  );
});
it('rejects wrong NPC/ownership and delivers the reserved craft into Recovered when bags are full', async () => {
  const p = await makePlayer(ctx);
  const other = await makePlayer(ctx);
  const request = {
    ...p,
    npcId: npc,
    offerId: 'service.greenvale.craft_staff',
    requestId: uuidv7(),
  };
  await expectCode(
    exchangeAtNpc(ctx, { ...request, npcId: 'npc.greenvale.elder_maren' }),
    'WRONG_NPC',
  );
  await expectCode(exchangeAtNpc(ctx, { ...request, accountId: other.accountId }), 'NOT_FOUND');
  await materials(p, 'material.world.hardwood', 4);
  await materials(p, 'material.world.wild_herb', 2);
  await ctx.db.execute(
    sql`update containers set capacity=1 where owner_character_id=${p.characterId} and kind='backpack'`,
  );
  await materials(p, 'accessory.ring.copper_band', 1);
  await exchangeAtNpc(ctx, request);
  await ctx.db
    .update(schema.craftJobs)
    .set({ readyAt: new Date(0) })
    .where(eq(schema.craftJobs.id, request.requestId));
  await finishCraft(ctx, { ...p, jobId: request.requestId });
  const inv = await getCharacterItems(ctx.db, ctx, p.accountId, p.characterId);
  expect(
    inv.containers
      .find((c) => c.container.kind === 'material_pouch')!
      .items.map((i) => i.instance.quantity)
      .sort(),
  ).toEqual([]);
  expect(
    await ctx.db
      .select()
      .from(schema.serviceReceipts)
      .where(eq(schema.serviceReceipts.characterId, p.characterId)),
  ).toHaveLength(1);
  expect(inv.containers.find((c) => c.container.kind === 'mailbox')!.items[0]!.template.id).toBe(
    'weapon.staff.oak_staff',
  );
});
it('sells one stock unit, balances ledger, then buys once; insufficient funds grant nothing', async () => {
  const p = await makePlayer(ctx);
  await inTransaction(ctx, (tx) =>
    adjustBalanceInTx(tx, ctx, { ...p, currencyId: 'gold', delta: -1000, reason: 'vendor' }),
  );
  await materials(p, 'material.world.iron_shard', 20);
  const buy = {
    ...p,
    npcId: 'npc.world.greenvale_marches.merchant',
    offerId: 'service.greenvale.buy_cap',
    requestId: uuidv7(),
  };
  await expectCode(exchangeAtNpc(ctx, buy), 'INSUFFICIENT_FUNDS');
  for (let i = 0; i < 8; i++)
    await exchangeAtNpc(ctx, {
      ...buy,
      offerId: 'service.greenvale.sell_iron_shard',
      requestId: uuidv7(),
    });
  const bought = await exchangeAtNpc(ctx, buy);
  expect(bought.balances.find((b) => b.currencyId === 'gold')!.amount).toBe(0);
  await exchangeAtNpc(ctx, buy);
  const ledger = await ctx.db.execute(
    sql`select sum(delta)::int total,count(*)::int n from currency_ledger where owner_character_id=${p.characterId}`,
  );
  expect(ledger.rows[0]).toMatchObject({ total: 0, n: 11 });
});
it('records only living nearby personal discoveries, persists across reload and deduplicates concurrency', async () => {
  const p = await makePlayer(ctx);
  const sample = {
    characterId: p.characterId,
    zoneId: 'zone.aurelian.greenvale_marches',
    position: { x: 256, y: 0, z: 400 },
    health: 100,
  };
  expect(await discoverLocations(ctx, { ...sample, health: 0 })).toEqual([]);
  expect(
    await discoverLocations(ctx, { ...sample, position: { x: 99999, y: 0, z: 99999 } }),
  ).toEqual([]);
  await Promise.all(Array.from({ length: 4 }, () => discoverLocations(ctx, sample)));
  expect(await getDiscoveries({ ...ctx }, p.characterId)).toContain(
    'location.greenvale_marches.town',
  );
  expect(await discoverLocations(ctx, sample)).toEqual([]);
});
it('daily contracts reset only after cooldown, reject duplicate payout and keep unique cycle grants', async () => {
  const p = await makePlayer(ctx),
    q = 'quest.greenvale.marches_patrol',
    n = 'npc.world.greenvale_marches.guard';
  await acceptQuest(ctx, { characterId: p.characterId, questId: q, npcId: n });
  await ctx.db.execute(
    sql`update character_quests set progress='{"boars":2}' where character_id=${p.characterId} and quest_id=${q}`,
  );
  const paid = await Promise.allSettled(
    Array.from({ length: 4 }, () =>
      turnInQuest(ctx, { characterId: p.characterId, questId: q, npcId: n }),
    ),
  );
  expect(paid.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  await expectCode(
    acceptQuest(ctx, { characterId: p.characterId, questId: q, npcId: n }),
    'QUEST_ALREADY_COMPLETED',
  );
  await ctx.db.execute(
    sql`update character_quests set completed_at=now()-interval '25 hours' where character_id=${p.characterId} and quest_id=${q}`,
  );
  await acceptQuest(ctx, { characterId: p.characterId, questId: q, npcId: n });
  expect(
    (await getQuestLog(ctx.db, ctx, p.characterId)).find((v) => v.questId === q)!.objectives[0]!
      .current,
  ).toBe(0);
  await expectCode(
    turnInQuest(ctx, { characterId: p.characterId, questId: q, npcId: n }),
    'QUEST_INCOMPLETE',
  );
  await ctx.db.execute(
    sql`update character_quests set progress='{"boars":2}' where character_id=${p.characterId} and quest_id=${q}`,
  );
  await turnInQuest(ctx, { characterId: p.characterId, questId: q, npcId: n });
  const ledger = await ctx.db.execute(
    sql`select sum(delta)::int total from currency_ledger where owner_character_id=${p.characterId}`,
  );
  expect(ledger.rows[0]).toMatchObject({ total: 1160 });
});

it('completes the authored closure for two members with personal supplies/visits and shared exact-once kills', async () => {
  const { recordNpcTalk, recordExploration, recordKill, processKillEvent } =
    await import('../src/index');
  const players = [await makePlayer(ctx), await makePlayer(ctx)];
  const zone = 'zone.aurelian.greenvale_marches';
  for (const p of players) {
    await ctx.db
      .update(schema.characters)
      .set({ level: 4, zoneId: zone })
      .where(eq(schema.characters.id, p.characterId));
    await ctx.db.insert(schema.characterQuests).values({
      characterId: p.characterId,
      questId: 'quest.greenvale.keeper_outpost',
      status: 'completed',
      acceptedAt: new Date(),
      completedAt: new Date(),
      rewardedAt: new Date(),
    });
  }
  for (const suffix of [
    'marches_call',
    'marches_supply',
    'marches_boundary',
    'marches_vault',
    'marches_home',
  ]) {
    const q = ctx.gameData.quest(`quest.greenvale.${suffix}`);
    for (const p of players)
      await acceptQuest(ctx, { characterId: p.characterId, questId: q.id, npcId: q.giverNpcId! });
    for (const o of q.objectives) {
      if (o.kind === 'kill')
        for (let i = 0; i < o.count; i++) {
          const killId = uuidv7();
          await recordKill(ctx.db, {
            killId,
            characterId: players[0]!.characterId,
            recipients: players.map((p) => p.characterId),
            lootCharacterId: players[1]!.characterId,
            enemyId: o.enemyId,
            zoneId: zone,
            spawnPointId: `test.${killId}`,
            groupId: null,
            diedAt: new Date(),
            respawnAt: new Date(),
          });
          const results = await Promise.all([
            processKillEvent(ctx, killId),
            processKillEvent(ctx, killId),
          ]);
          expect(results.filter((r) => r.status === 'rewarded')).toHaveLength(1);
        }
      else
        for (const p of players) {
          if (o.kind === 'talk') await recordNpcTalk(ctx, p.characterId, o.npcId);
          if (o.kind === 'collect') await materials(p, o.itemTemplateId, o.count);
          if (o.kind === 'explore') {
            const position = ctx.gameData.zones
              .get(o.zoneId)!
              .landmarks.find((l) => l.id === o.areaId)!.position;
            await recordExploration(ctx, {
              characterId: p.characterId,
              zoneId: o.zoneId,
              position,
              health: 100,
            });
          }
        }
    }
    for (const p of players) {
      const log = await getQuestLog(ctx.db, ctx, p.characterId);
      expect(log.find((v) => v.questId === q.id)!.state).toBe('ready_to_turn_in');
      const request = {
        characterId: p.characterId,
        questId: q.id,
        npcId: q.turnInNpcId ?? q.giverNpcId!,
      };
      await turnInQuest(ctx, request);
      await expectCode(turnInQuest(ctx, request), 'QUEST_ALREADY_COMPLETED');
    }
  }
  for (const p of players)
    expect(
      (await getQuestLog(ctx.db, ctx, p.characterId)).filter(
        (v) => v.questId.startsWith('quest.greenvale.marches_') && v.state === 'completed',
      ),
    ).toHaveLength(5);
});
it.each(['node.greenvale_marches.timber_stack', 'node.greenvale_marches.quarry_vein'])(
  'uses durable generic gathering for %s, including a competing request and restart retry',
  async (nodeId) => {
    const { harvestResource } = await import('../src/index');
    const p = await makePlayer(ctx),
      other = await makePlayer(ctx);
    const results = await Promise.allSettled([
      harvestResource(ctx, { ...p, nodeId }),
      harvestResource(ctx, { ...other, nodeId }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    await expectCode(harvestResource({ ...ctx }, { ...p, nodeId }), 'ALREADY_CLAIMED');
  },
);
it('deduplicates item rewards within a repeat cycle while allowing a later earned cycle', async () => {
  const { GameData } = await import('@mmo/game-data');
  const raw = structuredClone(ctx.gameData.raw);
  raw.quests.find((q) => q.id === 'quest.greenvale.marches_patrol')!.rewards.items = [
    { itemTemplateId: 'material.world.iron_shard', quantity: 1 },
  ];
  const repeated = { ...ctx, gameData: GameData.load(raw) },
    p = await makePlayer(ctx),
    q = 'quest.greenvale.marches_patrol',
    n = 'npc.world.greenvale_marches.guard';
  for (let cycle = 0; cycle < 2; cycle++) {
    if (cycle)
      await ctx.db.execute(
        sql`update character_quests set completed_at=now()-interval '25 hours' where character_id=${p.characterId} and quest_id=${q}`,
      );
    await acceptQuest(repeated, { characterId: p.characterId, questId: q, npcId: n });
    await ctx.db.execute(
      sql`update character_quests set progress='{"boars":2}' where character_id=${p.characterId} and quest_id=${q}`,
    );
    const paid = await Promise.allSettled(
      Array.from({ length: 3 }, () =>
        turnInQuest(repeated, { characterId: p.characterId, questId: q, npcId: n }),
      ),
    );
    expect(paid.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  }
  const items = await getCharacterItems(ctx.db, ctx, p.accountId, p.characterId);
  expect(
    items.containers
      .flatMap((c) => c.items)
      .find((i) => i.template.id === 'material.world.iron_shard')!.instance.quantity,
  ).toBe(2);
  const grants = await ctx.db.execute(
    sql`select count(distinct source_ref)::int n from item_instances where owner_character_id=${p.characterId} and source_ref like ${'quest:' + q + ':%'} `,
  );
  expect(grants.rows[0]).toMatchObject({ n: 2 });
});
it('bounds unlucky required hunt drops without changing normal tables or duplicating party loot', async () => {
  const { awardKill } = await import('../src/index');
  const p = await makePlayer(ctx),
    q = 'quest.greenvale.wolves_at_the_edge';
  const unlucky = { ...ctx, rng: { next: () => 0.6 } }; // normal rolls deliberately choose caps, never pelts
  await acceptQuest(ctx, {
    characterId: p.characterId,
    questId: q,
    npcId: 'npc.greenvale.elder_maren',
  });
  const killId = uuidv7();
  await awardKill(unlucky, {
    characterId: p.characterId,
    enemyId: 'enemy.greenvale.grey_wolf',
    zoneId: 'zone.greenvale.meadows',
    killId,
  });
  await expectCode(
    awardKill(unlucky, {
      characterId: p.characterId,
      enemyId: 'enemy.greenvale.grey_wolf',
      zoneId: 'zone.greenvale.meadows',
      killId,
    }),
    'ALREADY_CLAIMED',
  );
  for (let i = 0; i < 4; i++)
    await awardKill(unlucky, {
      characterId: p.characterId,
      enemyId: 'enemy.greenvale.grey_wolf',
      zoneId: 'zone.greenvale.meadows',
      killId: uuidv7(),
    });
  const view = (await getQuestLog(ctx.db, ctx, p.characterId)).find(
    (q) => q.questId === 'quest.greenvale.wolves_at_the_edge',
  )!;
  expect(view.state).toBe('ready_to_turn_in');
  const items = await getCharacterItems(ctx.db, ctx, p.accountId, p.characterId);
  expect(
    items.containers
      .flatMap((c) => c.items)
      .filter((i) => i.template.id === 'material.hide.wolf_pelt')
      .reduce((n, i) => n + i.instance.quantity, 0),
  ).toBe(3);
  const companion = await makePlayer(ctx);
  await acceptQuest(ctx, {
    characterId: companion.characterId,
    questId: q,
    npcId: 'npc.greenvale.elder_maren',
  });
  await awardKill(unlucky, {
    characterId: companion.characterId,
    enemyId: 'enemy.greenvale.grey_wolf',
    zoneId: 'zone.greenvale.meadows',
    killId: uuidv7(),
    receivesLoot: false,
    shareCount: 2,
  });
  const shared = await getCharacterItems(ctx.db, ctx, companion.accountId, companion.characterId);
  expect(shared.containers.flatMap((c) => c.items)).toHaveLength(0);
});
it('two distinct craft operations cannot spend the same material stock', async () => {
  const p = await makePlayer(ctx);
  await materials(p, 'material.world.iron_shard', 4);
  await materials(p, 'material.world.hardwood', 2);
  const results = await Promise.allSettled(
    Array.from({ length: 2 }, () =>
      exchangeAtNpc(ctx, {
        ...p,
        npcId: npc,
        offerId: 'service.greenvale.craft_sword',
        requestId: uuidv7(),
      }),
    ),
  );
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  const [job] = await ctx.db
    .select()
    .from(schema.craftJobs)
    .where(eq(schema.craftJobs.characterId, p.characterId));
  await ctx.db
    .update(schema.craftJobs)
    .set({ readyAt: new Date(0) })
    .where(eq(schema.craftJobs.id, job!.id));
  await finishCraft(ctx, { ...p, jobId: job!.id });
  const items = await getCharacterItems(ctx.db, ctx, p.accountId, p.characterId);
  expect(
    items.containers
      .flatMap((c) => c.items)
      .filter((i) => i.template.id === 'weapon.sword.iron_longsword'),
  ).toHaveLength(1);
});
it('sells one acknowledged gear instance once, rejects stale/locked/foreign/storage items and balances its ledger', async () => {
  const { sellAtNpc } = await import('../src/index');
  const p = await makePlayer(ctx),
    other = await makePlayer(ctx);
  await materials(p, 'armor.leather.trapper_cap', 1);
  let inv = await getCharacterItems(ctx.db, ctx, p.accountId, p.characterId),
    item = inv.containers
      .flatMap((c) => c.items)
      .find((i) => i.template.id === 'armor.leather.trapper_cap')!;
  const request = {
    ...p,
    npcId: 'npc.world.greenvale_marches.merchant',
    itemId: item.instance.id,
    expectedVersion: item.instance.version,
    requestId: uuidv7(),
  };
  await expectCode(sellAtNpc(ctx, { ...request, accountId: other.accountId }), 'NOT_FOUND');
  await expectCode(
    sellAtNpc(ctx, { ...request, expectedVersion: item.instance.version + 1 }),
    'CONFLICT',
  );
  await ctx.db
    .update(schema.itemInstances)
    .set({ isLocked: true })
    .where(eq(schema.itemInstances.id, item.instance.id));
  await expectCode(sellAtNpc(ctx, request), 'CONFLICT');
  await ctx.db
    .update(schema.itemInstances)
    .set({ isLocked: false })
    .where(eq(schema.itemInstances.id, item.instance.id));
  const results = await Promise.all(Array.from({ length: 4 }, () => sellAtNpc(ctx, request)));
  expect(results.filter((r) => r.items.length === 1)).toHaveLength(1);
  const rows = await ctx.db.execute(
    sql`select count(*)::int n,sum(delta)::int total from currency_ledger where owner_character_id=${p.characterId} and reason='vendor'`,
  );
  expect(rows.rows[0]).toMatchObject({ n: 1, total: item.template.vendorValue });
  await expectCode(sellAtNpc(ctx, { ...request, requestId: uuidv7() }), 'CONFLICT');
  // Storage is excluded even when the ID/version are current.
  await inTransaction(ctx, (tx) =>
    grantItemInTx(tx, ctx, {
      ...p,
      templateId: 'armor.leather.trapper_cap',
      quantity: 1,
      method: 'system',
      actor: p,
      containerKind: 'character_vault',
    }),
  );
  inv = await getCharacterItems(ctx.db, ctx, p.accountId, p.characterId);
  item = inv.containers.find((c) => c.container.kind === 'character_vault')!.items[0]!;
  await expectCode(
    sellAtNpc(ctx, {
      ...request,
      itemId: item.instance.id,
      expectedVersion: item.instance.version,
      requestId: uuidv7(),
    }),
    'ITEM_NOT_IN_EXPECTED_LOCATION',
  );
});
