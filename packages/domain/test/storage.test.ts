import { describe, expect, it } from 'vitest';
import { uuidv7 } from '@mmo/shared';
import type { Item } from '@mmo/schemas';
import {
  claimWorldPickup,
  getCharacterItems,
  getItemHistory,
  grantItemInTx,
  inTransaction,
  moveItem,
} from '../src/index';
import { addCharacter, containerId, expectCode, makePlayer, setupContext } from './helpers';
import type { TestPlayer } from './helpers';

const ctx = setupContext();

async function give(p: TestPlayer, templateId: string): Promise<Item> {
  const { created } = await inTransaction(ctx, (tx) =>
    grantItemInTx(tx, ctx, {
      accountId: p.accountId,
      characterId: p.characterId,
      templateId,
      quantity: 1,
      method: 'system',
      actor: { accountId: null, characterId: null },
    }),
  );
  const inv = await getCharacterItems(ctx.db, ctx, p.accountId, p.characterId);
  return inv.containers.flatMap((c) => c.items).find((i) => i.instance.id === created.id)!;
}

const move = (
  p: TestPlayer,
  item: Item,
  to: Parameters<typeof moveItem>[1]['request']['to'],
  version = item.instance.version,
) =>
  moveItem(ctx, {
    accountId: p.accountId,
    characterId: p.characterId,
    request: { itemInstanceId: item.instance.id, expectedVersion: version, to },
  });

describe('inventory and vault transfers', () => {
  it('moves backpack -> character vault -> account vault -> another character of the same account', async () => {
    const p = await makePlayer(ctx);
    const sword = await give(p, 'weapon.sword.iron_longsword');
    const vault = await containerId(ctx, p, 'character_vault');
    const shared = await containerId(ctx, p, 'account_vault');

    const [inVault] = await move(p, sword, { kind: 'container', containerId: vault });
    expect(inVault!.instance.location).toMatchObject({ kind: 'container', containerId: vault });
    expect(inVault!.instance.version).toBe(sword.instance.version + 1);

    const [inShared] = await move(p, inVault!, { kind: 'container', containerId: shared });
    expect(inShared!.instance.ownership.ownerCharacterId).toBeNull(); // account-scoped now

    const alt = { accountId: p.accountId, characterId: await addCharacter(ctx, p.accountId) };
    const altBackpack = await containerId(ctx, alt, 'backpack');
    const [onAlt] = await move(alt, inShared!, {
      kind: 'container',
      containerId: altBackpack,
      slot: 5,
    });
    expect(onAlt!.instance.ownership.ownerCharacterId).toBe(alt.characterId);
    expect(onAlt!.instance.location).toMatchObject({ containerId: altBackpack, slot: 5 });

    const history = await getItemHistory(ctx.db, sword.instance.id);
    expect(history.map((h) => h.eventType)).toEqual(['created', 'moved', 'moved', 'moved']);
  });

  it('prevents other accounts and other characters from moving or taking items', async () => {
    const owner = await makePlayer(ctx);
    const thief = await makePlayer(ctx);
    const sword = await give(owner, 'weapon.sword.iron_longsword');
    const thiefBackpack = await containerId(ctx, thief, 'backpack');
    await expectCode(
      move(thief, sword, { kind: 'container', containerId: thiefBackpack }),
      'ITEM_NOT_OWNED',
    );

    // Owner cannot push into someone else's container either.
    await expectCode(
      move(owner, sword, { kind: 'container', containerId: thiefBackpack }),
      'FORBIDDEN',
    );

    // A second character on the same account cannot reach into the first character's backpack.
    const alt = {
      accountId: owner.accountId,
      characterId: await addCharacter(ctx, owner.accountId),
    };
    const altBackpack = await containerId(ctx, alt, 'backpack');
    await expectCode(
      move(alt, sword, { kind: 'container', containerId: altBackpack }),
      'FORBIDDEN',
    );
  });

  it('enforces container rules: binding, material pouch, quest items, occupied slots, stale versions', async () => {
    const p = await makePlayer(ctx);
    const trinket = await give(p, 'accessory.trinket.ember_heart'); // bind on pickup
    const letter = await give(p, 'quest.misc.elders_letter');
    const sword = await give(p, 'weapon.sword.iron_longsword');
    const shared = await containerId(ctx, p, 'account_vault');
    const vault = await containerId(ctx, p, 'character_vault');
    const pouch = await containerId(ctx, p, 'material_pouch');
    const backpack = await containerId(ctx, p, 'backpack');

    await expectCode(
      move(p, trinket, { kind: 'container', containerId: shared }),
      'ITEM_NOT_VAULTABLE',
    );
    await expectCode(
      move(p, letter, { kind: 'container', containerId: vault }),
      'ITEM_NOT_VAULTABLE',
    );
    await expectCode(
      move(p, sword, { kind: 'container', containerId: pouch }),
      'CONTAINER_KIND_MISMATCH',
    );
    await expectCode(
      move(p, sword, { kind: 'container', containerId: backpack, slot: 0 }),
      'SLOT_OCCUPIED',
    );
    await expectCode(
      move(p, sword, { kind: 'container', containerId: backpack, slot: 999 }),
      'INVALID_SLOT',
    );
    await expectCode(
      move(p, sword, { kind: 'container', containerId: vault }, sword.instance.version + 7),
      'CONFLICT',
    );
  });

  it('never duplicates an item when the same move races itself into two destinations', async () => {
    const p = await makePlayer(ctx);
    const sword = await give(p, 'weapon.sword.iron_longsword');
    const vault = await containerId(ctx, p, 'character_vault');
    const shared = await containerId(ctx, p, 'account_vault');
    const results = await Promise.allSettled([
      move(p, sword, { kind: 'container', containerId: vault }),
      move(p, sword, { kind: 'container', containerId: shared }),
      move(p, sword, { kind: 'equipped', slotId: 'main_hand' }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const inv = await getCharacterItems(ctx.db, ctx, p.accountId, p.characterId);
    const everywhere = [
      ...inv.containers.flatMap((c) => c.items),
      ...Object.values(inv.equipment.slots),
    ].filter((i) => i.instance.id === sword.instance.id);
    expect(everywhere).toHaveLength(1);
  });
});

describe('equipment transfers', () => {
  it('equips, binds on equip, swaps, and unequips', async () => {
    const p = await makePlayer(ctx, 'class.warrior');
    const plate = await give(p, 'armor.plate.recruit_breastplate'); // bind on equip
    const [equipped] = await move(p, plate, { kind: 'equipped', slotId: 'chest' });
    expect(equipped!.instance.location).toEqual({
      kind: 'equipped',
      characterId: p.characterId,
      slotId: 'chest',
    });
    expect(equipped!.instance.binding.kind).toBe('character');

    // Swap: second breastplate replaces the first, which goes to the new one's old slot.
    const plate2 = await give(p, 'armor.plate.recruit_breastplate');
    const plate2Slot = (plate2.instance.location as { slot: number }).slot;
    const swapped = await move(p, plate2, { kind: 'equipped', slotId: 'chest' });
    const old = swapped.find((i) => i.instance.id === plate.instance.id)!;
    expect(old.instance.location).toMatchObject({ kind: 'container', slot: plate2Slot });

    // Unequip into the backpack.
    const inv = await getCharacterItems(ctx.db, ctx, p.accountId, p.characterId);
    const current = inv.equipment.slots['chest']!;
    const backpack = await containerId(ctx, p, 'backpack');
    const [unequipped] = await move(p, current, { kind: 'container', containerId: backpack });
    expect(unequipped!.instance.location.kind).toBe('container');
    const after = await getCharacterItems(ctx.db, ctx, p.accountId, p.characterId);
    expect(after.equipment.slots['chest']).toBeUndefined();
  });

  it('validates slot, class proficiency, level and two-handed rules on the server', async () => {
    const mage = await makePlayer(ctx, 'class.mage');
    const sword = await give(mage, 'weapon.sword.iron_longsword');
    await expectCode(
      move(mage, sword, { kind: 'equipped', slotId: 'main_hand' }),
      'CLASS_RESTRICTED',
    );
    await expectCode(move(mage, sword, { kind: 'equipped', slotId: 'head' }), 'INVALID_SLOT');
    await expectCode(move(mage, sword, { kind: 'equipped', slotId: 'not_a_slot' }), 'INVALID_SLOT');
    const ring = await give(mage, 'accessory.ring.copper_band'); // requires level 3
    await expectCode(move(mage, ring, { kind: 'equipped', slotId: 'ring_1' }), 'LEVEL_TOO_LOW');

    const warrior = await makePlayer(ctx, 'class.warrior');
    const shield = await give(warrior, 'armor.shield.oak_buckler');
    await move(warrior, shield, { kind: 'equipped', slotId: 'off_hand' });
    const cleric = await makePlayer(ctx, 'class.cleric');
    const buckler = await give(cleric, 'armor.shield.oak_buckler');
    const staff = await give(cleric, 'weapon.staff.oak_staff');
    await move(cleric, buckler, { kind: 'equipped', slotId: 'off_hand' });
    await expectCode(
      move(cleric, staff, { kind: 'equipped', slotId: 'main_hand' }),
      'SLOT_OCCUPIED',
    );
  });

  it('cannot equip an item that another account owns', async () => {
    const a = await makePlayer(ctx);
    const b = await makePlayer(ctx);
    const [sword] = await claimWorldPickup(ctx, {
      accountId: a.accountId,
      characterId: a.characterId,
      templateId: 'weapon.sword.iron_longsword',
      quantity: 1,
      spawnPointId: 'spawn.greenvale.sword_rack',
      spawnInstanceId: uuidv7(),
    });
    await expectCode(move(b, sword!, { kind: 'equipped', slotId: 'main_hand' }), 'ITEM_NOT_OWNED');
  });
});
