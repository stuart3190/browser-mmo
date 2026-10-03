import { describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { schema } from '@mmo/db';
import { uuidv7 } from '@mmo/shared';
import {
  claimWorldPickup,
  getCharacterItems,
  getItemHistory,
  inTransaction,
  grantItemInTx,
} from '../src/index';
import { expectCode, makePlayer, setupContext } from './helpers';

const ctx = setupContext();

describe('item creation and ownership', () => {
  it('mints a unique instance owned by the character, in the right container, with provenance', async () => {
    const p = await makePlayer(ctx);
    const [item] = await claimWorldPickup(ctx, {
      accountId: p.accountId,
      characterId: p.characterId,
      templateId: 'weapon.sword.iron_longsword',
      quantity: 1,
      spawnPointId: 'spawn.greenvale.sword_rack',
      spawnInstanceId: uuidv7(),
    });
    expect(item!.instance.ownership.ownerAccountId).toBe(p.accountId);
    expect(item!.instance.ownership.ownerCharacterId).toBe(p.characterId);
    expect(item!.instance.ownership.originalOwnerCharacterId).toBe(p.characterId);
    expect(item!.instance.acquisition.method).toBe('world_pickup');
    expect(item!.instance.location).toMatchObject({ kind: 'container', slot: 0 });
    expect(item!.instance.external.externalOwnershipEnabled).toBe(false);
    expect(item!.instance.durability).toEqual({ current: 80, max: 80 });

    const inv = await getCharacterItems(ctx.db, ctx, p.accountId, p.characterId);
    const backpack = inv.containers.find((c) => c.container.kind === 'backpack')!;
    expect(backpack.items.map((i) => i.instance.id)).toEqual([item!.instance.id]);

    const history = await getItemHistory(ctx.db, item!.instance.id);
    expect(history.map((h) => h.eventType)).toEqual(['created']);
  });

  it('rejects a second claim of the same spawn instance (dedupe survives restarts via unique sourceRef)', async () => {
    const p = await makePlayer(ctx);
    const args = {
      accountId: p.accountId,
      characterId: p.characterId,
      templateId: 'weapon.sword.iron_longsword',
      quantity: 1,
      spawnPointId: 'spawn.greenvale.sword_rack',
      spawnInstanceId: uuidv7(),
    };
    await claimWorldPickup(ctx, args);
    await expectCode(claimWorldPickup(ctx, args), 'ALREADY_CLAIMED');
    const other = await makePlayer(ctx);
    await expectCode(
      claimWorldPickup(ctx, {
        ...args,
        accountId: other.accountId,
        characterId: other.characterId,
      }),
      'ALREADY_CLAIMED',
    );
  });

  it('lets exactly one of many concurrent claims for the same spawn succeed', async () => {
    const players = await Promise.all(Array.from({ length: 6 }, () => makePlayer(ctx)));
    const spawnInstanceId = uuidv7();
    const results = await Promise.allSettled(
      players.map((p) =>
        claimWorldPickup(ctx, {
          accountId: p.accountId,
          characterId: p.characterId,
          templateId: 'weapon.sword.iron_longsword',
          quantity: 1,
          spawnPointId: 'spawn.greenvale.sword_rack',
          spawnInstanceId,
        }),
      ),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const [{ n }] = (await ctx.db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.itemInstances)
      .where(
        eq(
          schema.itemInstances.sourceRef,
          `world_pickup:spawn.greenvale.sword_rack:${spawnInstanceId}`,
        ),
      )) as [{ n: number }];
    expect(n).toBe(1);
  });

  it('stacks materials into the material pouch and records the merge', async () => {
    const p = await makePlayer(ctx);
    const claim = () =>
      claimWorldPickup(ctx, {
        accountId: p.accountId,
        characterId: p.characterId,
        templateId: 'material.ore.copper_ore',
        quantity: 3,
        spawnPointId: 'spawn.greenvale.ore_pile',
        spawnInstanceId: uuidv7(),
      });
    const [first] = await claim();
    expect(first!.instance.location).toMatchObject({
      kind: 'container',
      containerKind: 'material_pouch',
    });
    const [merged] = await claim();
    expect(merged!.instance.id).toBe(first!.instance.id);
    expect(merged!.instance.quantity).toBe(6);

    const inv = await getCharacterItems(ctx.db, ctx, p.accountId, p.characterId);
    const pouch = inv.containers.find((c) => c.container.kind === 'material_pouch')!;
    expect(pouch.items).toHaveLength(1);
    // The second grant still has its own (destroyed: stack_merged) provenance row.
    const rows = await ctx.db
      .select()
      .from(schema.itemInstances)
      .where(eq(schema.itemInstances.ownerCharacterId, p.characterId));
    expect(
      rows.filter((r) => r.locationKind === 'destroyed' && r.destroyedReason === 'stack_merged'),
    ).toHaveLength(1);
  });

  it('binds bind-on-pickup items to the character at creation', async () => {
    const p = await makePlayer(ctx);
    const { created } = await inTransaction(ctx, (tx) =>
      grantItemInTx(tx, ctx, {
        accountId: p.accountId,
        characterId: p.characterId,
        templateId: 'accessory.trinket.ember_heart',
        quantity: 1,
        method: 'loot_drop',
        actor: { accountId: p.accountId, characterId: p.characterId },
      }),
    );
    expect(created.bindingKind).toBe('character');
    expect(created.boundCharacterId).toBe(p.characterId);
  });

  it('refuses to mint into a full container and leaves no partial state', async () => {
    const p = await makePlayer(ctx);
    const grant = () =>
      inTransaction(ctx, (tx) =>
        grantItemInTx(tx, ctx, {
          accountId: p.accountId,
          characterId: p.characterId,
          templateId: 'weapon.sword.iron_longsword',
          quantity: 1,
          method: 'system',
          actor: { accountId: null, characterId: null },
        }),
      );
    for (let i = 0; i < 24; i++) await grant();
    await expectCode(grant(), 'CONTAINER_FULL');
    const rows = await ctx.db
      .select()
      .from(schema.itemInstances)
      .where(eq(schema.itemInstances.ownerCharacterId, p.characterId));
    expect(rows).toHaveLength(24);
  });
});

describe('database-level invariants (last line of defence)', () => {
  it('rejects rows whose location columns describe two places at once', async () => {
    const p = await makePlayer(ctx);
    const [item] = await claimWorldPickup(ctx, {
      accountId: p.accountId,
      characterId: p.characterId,
      templateId: 'weapon.sword.iron_longsword',
      quantity: 1,
      spawnPointId: 'spawn.greenvale.sword_rack',
      spawnInstanceId: uuidv7(),
    });
    await expect(
      ctx.db
        .update(schema.itemInstances)
        .set({ equipCharacterId: p.characterId, equipSlot: 'main_hand' }) // still location_kind=container
        .where(eq(schema.itemInstances.id, item!.instance.id)),
    ).rejects.toThrow();
  });

  it('rejects two items in the same container slot', async () => {
    const p = await makePlayer(ctx);
    const claim = () =>
      claimWorldPickup(ctx, {
        accountId: p.accountId,
        characterId: p.characterId,
        templateId: 'weapon.sword.iron_longsword',
        quantity: 1,
        spawnPointId: 'spawn.greenvale.sword_rack',
        spawnInstanceId: uuidv7(),
      });
    const [a] = await claim();
    const [b] = await claim();
    await expect(
      ctx.db
        .update(schema.itemInstances)
        .set({ slotIndex: 0 })
        .where(eq(schema.itemInstances.id, b!.instance.id)),
    ).rejects.toThrow();
    expect(a!.instance.location).toMatchObject({ slot: 0 });
  });

  it('rejects enabling dormant external ownership fields', async () => {
    const p = await makePlayer(ctx);
    const [item] = await claimWorldPickup(ctx, {
      accountId: p.accountId,
      characterId: p.characterId,
      templateId: 'weapon.sword.iron_longsword',
      quantity: 1,
      spawnPointId: 'spawn.greenvale.sword_rack',
      spawnInstanceId: uuidv7(),
    });
    await expect(
      ctx.db
        .update(schema.itemInstances)
        .set({ externalOwnershipEnabled: true })
        .where(eq(schema.itemInstances.id, item!.instance.id)),
    ).rejects.toThrow();
  });
});
