import { expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { schema } from '@mmo/db';
import { uuidv7 } from '@mmo/shared';
import {
  exchangeAtNpc,
  finishCraft,
  grantItemInTx,
  inTransaction,
  getCharacterItems,
  getBalances,
  moveItem,
  getCombatProfile,
} from '../src';
import { setupContext, makePlayer, expectCode } from './helpers';
const ctx = setupContext();

it.each(['sword', 'staff'])(
  'gates the coastal %s commission before taking costs, and preserves one crafted upgrade under retries',
  async (type) => {
    const p = await makePlayer(ctx, type === 'sword' ? 'class.warrior' : 'class.mage');
    const req = {
      ...p,
      npcId: 'npc.amber_coast.iona',
      offerId: `service.amber_coast.craft_${type}`,
      requestId: uuidv7(),
    };
    await expectCode(exchangeAtNpc(ctx, req), 'FORBIDDEN');
    await ctx.db
      .update(schema.characters)
      .set({ level: 5 })
      .where(eq(schema.characters.id, p.characterId));
    for (const [templateId, quantity] of [
      ['material.world.field_hide', 2],
      ['material.world.iron_shard', 1],
    ] as const)
      await inTransaction(ctx, (tx) =>
        grantItemInTx(tx, ctx, { ...p, templateId, quantity, method: 'system', actor: p }),
      );
    const balance = async () =>
      (await getBalances(ctx.db, p.accountId, p.characterId)).find((b) => b.currencyId === 'gold')!
        .amount;
    const initial = await balance();
    await expectCode(exchangeAtNpc(ctx, req), 'QUEST_NOT_AVAILABLE');
    await ctx.db.insert(schema.characterQuests).values({
      characterId: p.characterId,
      questId: 'quest.amber_coast.last_bell',
      status: 'active',
      progress: { bellkeeper: 1, last_oath: 1 },
      acceptedAt: new Date(),
    });
    await expectCode(exchangeAtNpc(ctx, req), 'QUEST_NOT_AVAILABLE');
    expect(await balance()).toBe(initial);
    expect(
      (await getCharacterItems(ctx.db, ctx, p.accountId, p.characterId)).containers.find(
        (c) => c.container.kind === 'material_pouch',
      )!.items,
    ).toHaveLength(2);
    await ctx.db
      .update(schema.characterQuests)
      .set({
        status: 'completed',
        completedAt: new Date(),
        rewardedAt: new Date(),
        turnInId: uuidv7(),
      })
      .where(
        and(
          eq(schema.characterQuests.characterId, p.characterId),
          eq(schema.characterQuests.questId, 'quest.amber_coast.last_bell'),
        ),
      );
    const starts = await Promise.all(Array.from({ length: 4 }, () => exchangeAtNpc(ctx, req)));
    expect(starts.filter((r) => !r.duplicate)).toHaveLength(1);
    expect(await balance()).toBe(initial - 100);
    await expectCode(finishCraft(ctx, { ...p, jobId: req.requestId }), 'CONFLICT');
    await ctx.db
      .update(schema.craftJobs)
      .set({ readyAt: new Date(0) })
      .where(eq(schema.craftJobs.id, req.requestId));
    const completions = await Promise.all(
      Array.from({ length: 4 }, () => finishCraft(ctx, { ...p, jobId: req.requestId })),
    );
    expect(completions.filter(Boolean)).toHaveLength(1);
    const items = (
      await getCharacterItems(ctx.db, ctx, p.accountId, p.characterId)
    ).containers.flatMap((c) => c.items);
    expect(items).toHaveLength(1);
    const item = items[0]!;
    expect(item.instance.templateId).toBe(`weapon.${type}.tidewatch`);
    expect(item.instance.ownership.crafterCharacterId).toBe(p.characterId);
    expect(item.instance.durability).toEqual({ current: 100, max: 100 });
    await moveItem(ctx, {
      ...p,
      request: {
        itemInstanceId: item.instance.id,
        expectedVersion: item.instance.version,
        to: { kind: 'equipped', slotId: 'main_hand' },
      },
    });
    const profile = await getCombatProfile(ctx.db, ctx, p.characterId);
    expect(profile.weapon.templateId).toBe(item.template.id);
    expect(profile.weapon.min).toBe(type === 'sword' ? 10 : 12);
    expect(profile.stats[type === 'sword' ? 'attack_power' : 'spell_power']).toBeGreaterThanOrEqual(
      type === 'sword' ? 14 : 18,
    );
  },
);
