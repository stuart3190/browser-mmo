import { expect, it } from 'vitest';
import { eq, like, sql } from 'drizzle-orm';
import { schema } from '@mmo/db';
import { harvestResource, getCharacterItems, inTransaction, grantItemInTx } from '../src/index';
import { expectCode, makePlayer, setupContext } from './helpers';
const ctx = setupContext();
const nodeId = 'node.greenvale_marches.herb_beds';
async function reset() {
  await ctx.db.delete(schema.resourceHarvests).where(eq(schema.resourceHarvests.nodeId, nodeId));
}
it('serializes competing shared harvests and persists one grant, provenance and regrowth deadline', async () => {
  await reset();
  const players = await Promise.all(Array.from({ length: 6 }, () => makePlayer(ctx)));
  const results = await Promise.allSettled(
    players.map((p) => harvestResource(ctx, { ...p, nodeId })),
  );
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  const [state] = await ctx.db
    .select()
    .from(schema.resourceHarvests)
    .where(eq(schema.resourceHarvests.nodeId, nodeId));
  expect(state!.readyAt.getTime()).toBeGreaterThan(Date.now() + 50000);
  const grants = await ctx.db
    .select()
    .from(schema.itemInstances)
    .where(like(schema.itemInstances.sourceRef, `resource:${nodeId}:%`));
  expect(grants).toHaveLength(1);
  expect(grants[0]!.quantity).toBe(2);
  const winner = players.find((p) => p.characterId === grants[0]!.ownerCharacterId)!;
  const inv = await getCharacterItems(ctx.db, ctx, winner.accountId, winner.characterId);
  expect(
    inv.containers.find((c) => c.container.kind === 'material_pouch')!.items[0]!.template.id,
  ).toBe('material.world.wild_herb');
  // A new operation/context after the committed grant (even without a world checkpoint) cannot regrant.
  await expectCode(harvestResource({ ...ctx }, { ...winner, nodeId }), 'ALREADY_CLAIMED');
  await ctx.db
    .update(schema.resourceHarvests)
    .set({ readyAt: new Date(0) })
    .where(eq(schema.resourceHarvests.nodeId, nodeId));
  await harvestResource(ctx, { ...winner, nodeId });
  const after = await getCharacterItems(ctx.db, ctx, winner.accountId, winner.characterId);
  expect(
    after.containers.find((c) => c.container.kind === 'material_pouch')!.items[0]!.instance
      .quantity,
  ).toBe(4);
});
it('rolls back depletion when the pouch cannot accept the grant', async () => {
  await reset();
  const p = await makePlayer(ctx);
  const inv = await getCharacterItems(ctx.db, ctx, p.accountId, p.characterId);
  const pouch = inv.containers.find((c) => c.container.kind === 'material_pouch')!.container;
  await ctx.db.execute(sql`update containers set capacity=1 where id=${pouch.id}`);
  await inTransaction(ctx, (tx) =>
    grantItemInTx(tx, ctx, {
      ...p,
      templateId: 'material.world.field_hide',
      quantity: 1,
      method: 'world_pickup',
      actor: p,
    }),
  );
  await expectCode(harvestResource(ctx, { ...p, nodeId }), 'CONTAINER_FULL');
  expect(
    await ctx.db
      .select()
      .from(schema.resourceHarvests)
      .where(eq(schema.resourceHarvests.nodeId, nodeId)),
  ).toHaveLength(0);
  await ctx.db.execute(sql`update containers set capacity=${pouch.capacity} where id=${pouch.id}`);
  await harvestResource(ctx, { ...p, nodeId });
});
it('rejects unknown/catalog-only nodes and unauthorized character ownership without a grant', async () => {
  const p = await makePlayer(ctx),
    other = await makePlayer(ctx);
  await expectCode(harvestResource(ctx, { ...p, nodeId: 'resource.hardwood' }), 'NOT_FOUND');
  await expectCode(
    harvestResource(ctx, { ...p, characterId: other.characterId, nodeId }),
    'NOT_FOUND',
  );
});
