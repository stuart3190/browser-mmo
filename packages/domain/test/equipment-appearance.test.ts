import { expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { schema } from '@mmo/db';
import {
  getCombatProfile,
  getCharacterItems,
  grantItemInTx,
  inTransaction,
  moveItem,
} from '../src/index';
import { setupContext, makePlayer } from './helpers';
const ctx = setupContext();
it('derives only equipped visual identities, retains broken armour, and removes banked appearance', async () => {
  const p = await makePlayer(ctx);
  const slots = [
    ['head', 'armor.leather.trapper_cap'],
    ['chest', 'armor.plate.recruit_breastplate'],
    ['cloak', 'accessory.cloak.wayfarer_cloak'],
    ['off_hand', 'armor.shield.oak_buckler'],
  ] as const;
  const ids: string[] = [];
  for (const [slotId, templateId] of slots) {
    const item = await inTransaction(ctx, (tx) =>
      grantItemInTx(tx, ctx, { ...p, templateId, quantity: 1, method: 'system', actor: p }),
    );
    expect(
      Object.values((await getCombatProfile(ctx.db, ctx, p.characterId)).appearance.gear!),
    ).not.toContain(templateId);
    await moveItem(ctx, {
      ...p,
      request: {
        itemInstanceId: item.created.id,
        expectedVersion: item.created.version,
        to: { kind: 'equipped', slotId },
      },
    });
    ids.push(item.created.id);
  }
  const profile = await getCombatProfile(ctx.db, ctx, p.characterId);
  expect(profile.appearance.gear).toEqual({
    head: slots[0][1],
    chest: slots[1][1],
    cloak: slots[2][1],
    offHand: slots[3][1],
  });
  await ctx.db
    .update(schema.itemInstances)
    .set({ durabilityCurrent: 0 })
    .where(eq(schema.itemInstances.id, ids[1]!));
  const broken = await getCombatProfile(ctx.db, ctx, p.characterId);
  expect(broken.appearance).toEqual(profile.appearance);
  expect(broken.stats.armor).toBeLessThan(profile.stats.armor!);
  const inv = await getCharacterItems(ctx.db, ctx, p.accountId, p.characterId);
  const item = inv.equipment.slots.chest!;
  const bank = inv.containers.find((c) => c.container.kind === 'character_vault')!;
  await moveItem(ctx, {
    ...p,
    request: {
      itemInstanceId: item.instance.id,
      expectedVersion: item.instance.version,
      to: { kind: 'container', containerId: bank.container.id },
    },
  });
  expect((await getCombatProfile(ctx.db, ctx, p.characterId)).appearance.gear).toEqual({
    ...profile.appearance.gear,
    chest: null,
  });
});
