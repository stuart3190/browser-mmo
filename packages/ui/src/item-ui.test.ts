import { describe, expect, it } from 'vitest';
import { getGameData } from '@mmo/game-data';
import type { Item, ItemLocation, StatBlock } from '@mmo/schemas';
import { DORMANT_EXTERNAL_OWNERSHIP } from '@mmo/schemas';
import { uuidv7 } from '@mmo/shared';
import {
  ItemStore,
  inventoryView,
  chooseEquipSlot,
  compareItemStats,
  itemRequirements,
  itemTypeLine,
} from './index';

const gd = getGameData();
const now = new Date().toISOString();
const CONTAINER = uuidv7();

function item(
  templateId: string,
  opts: { id?: string; version?: number; stats?: StatBlock; location?: ItemLocation } = {},
): Item {
  const template = gd.template(templateId);
  return {
    template,
    instance: {
      id: opts.id ?? uuidv7(),
      templateId,
      rarityId: template.rarityId,
      quantity: 1,
      ownership: {
        ownerAccountId: uuidv7(),
        ownerCharacterId: null,
        originalOwnerAccountId: null,
        originalOwnerCharacterId: null,
        crafterCharacterId: null,
      },
      location: opts.location ?? {
        kind: 'container',
        containerId: CONTAINER,
        containerKind: 'backpack',
        slot: 0,
      },
      acquisition: { method: 'system', sourceRef: null },
      binding: { kind: 'unbound' },
      stats: opts.stats ?? {},
      modifiers: [],
      sockets: [],
      enchantments: [],
      durability: null,
      appearance: null,
      flags: { locked: false, favourite: false, junk: false },
      external: DORMANT_EXTERNAL_OWNERSHIP,
      version: opts.version ?? 0,
      createdAt: now,
      updatedAt: now,
    },
  };
}

describe('ItemStore reconciliation', () => {
  it('ignores stale upserts that arrive after newer state (HTTP vs push ordering)', () => {
    const s = new ItemStore();
    const id = uuidv7();
    s.apply([
      item('weapon.sword.iron_longsword', {
        id,
        version: 2,
        location: { kind: 'equipped', characterId: uuidv7(), slotId: 'main_hand' },
      }),
    ]);
    s.apply([item('weapon.sword.iron_longsword', { id, version: 1 })]);
    expect(s.get(id)!.instance.location.kind).toBe('equipped');
    expect(s.equipped().get('main_hand')?.instance.id).toBe(id);
  });

  it('removes items and blocks stale resurrection via tombstones, but accepts newer versions', () => {
    const s = new ItemStore();
    const id = uuidv7();
    s.apply([item('weapon.sword.iron_longsword', { id, version: 1 })]);
    s.apply([], [{ id, version: 2 }]);
    expect(s.get(id)).toBeUndefined();
    s.apply([item('weapon.sword.iron_longsword', { id, version: 1 })]);
    expect(s.get(id)).toBeUndefined();
    s.apply([item('weapon.sword.iron_longsword', { id, version: 3 })]);
    expect(s.get(id)).toBeDefined();
  });

  it('never holds two copies of one item and notifies subscribers once per change', () => {
    const s = new ItemStore();
    let calls = 0;
    s.subscribe(() => calls++);
    const id = uuidv7();
    const a = item('weapon.sword.iron_longsword', { id, version: 4 });
    s.apply([a]);
    s.apply([a]); // duplicate push: no-op
    expect(s.all()).toHaveLength(1);
    expect(calls).toBe(1);
  });
});

describe('equip targeting and comparison', () => {
  it('fills the empty ring slot first, then swaps the first ring slot', () => {
    const ring = item('accessory.ring.copper_band');
    expect(chooseEquipSlot(gd, ring, new Map())).toBe('ring_1');
    expect(
      chooseEquipSlot(gd, ring, new Map([['ring_1', item('accessory.ring.copper_band')]])),
    ).toBe('ring_2');
    const both = new Map([
      ['ring_1', item('accessory.ring.copper_band')],
      ['ring_2', item('accessory.ring.copper_band')],
    ]);
    expect(chooseEquipSlot(gd, ring, both)).toBe('ring_1');
    expect(chooseEquipSlot(gd, item('weapon.sword.iron_longsword'), new Map())).toBe('main_hand');
    // One-handers swap the main hand rather than silently going to the off hand.
    expect(
      chooseEquipSlot(
        gd,
        item('weapon.sword.iron_longsword'),
        new Map([['main_hand', item('weapon.sword.iron_longsword')]]),
      ),
    ).toBe('main_hand');
    expect(chooseEquipSlot(gd, item('consumable.potion.minor_healing'), new Map())).toBeNull();
  });

  it('computes per-stat deltas against the equipped item or an empty slot', () => {
    const better = item('weapon.sword.iron_longsword', { stats: { strength: 4, attack_power: 9 } });
    const worse = item('weapon.sword.iron_longsword', {
      stats: { strength: 2, attack_power: 9, stamina: 1 },
    });
    expect(compareItemStats(better, worse)).toEqual([
      { stat: 'strength', label: 'Strength', from: 2, to: 4, delta: 2 },
      { stat: 'stamina', label: 'Stamina', from: 1, to: 0, delta: -1 },
    ]);
    expect(compareItemStats(better, null).map((d) => d.delta)).toEqual([4, 9]);
  });

  it('evaluates requirements for the viewer and describes the item type', () => {
    const reqs = itemRequirements(gd, item('weapon.sword.iron_longsword'), {
      level: 1,
      cls: gd.characterClass('class.mage'),
    });
    expect(reqs).toEqual([{ text: 'Sword proficiency', met: false }]);
    const ring = itemRequirements(gd, item('accessory.ring.copper_band'), {
      level: 1,
      cls: gd.characterClass('class.mage'),
    });
    expect(ring).toEqual([{ text: 'Requires level 3', met: false }]);
    expect(itemTypeLine(gd, item('weapon.staff.oak_staff'))).toBe('Two-Hand Staff');
    expect(itemTypeLine(gd, item('accessory.ring.copper_band'))).toBe('Ring');
  });
});

it('filters and sorts by authored rarity/name/level without mutating authoritative slots or IDs', () => {
  const a = item('weapon.sword.iron_longsword', {
    location: { kind: 'container', containerId: CONTAINER, containerKind: 'backpack', slot: 4 },
  });
  const b = item('accessory.cloak.oathkeepers_mantle', {
    location: { kind: 'container', containerId: CONTAINER, containerKind: 'backpack', slot: 1 },
  });
  const input = [a, b],
    before = structuredClone(input);
  expect(inventoryView(gd, input, { sort: 'slots' })).toEqual([b, a]);
  expect(inventoryView(gd, input, { sort: 'name' })).toEqual([a, b]);
  expect(inventoryView(gd, input, { sort: 'rarity' })[0]).toBe(b);
  expect(inventoryView(gd, input, { sort: 'level' })[0]).toBe(b);
  expect(inventoryView(gd, input, { search: '  oAtH  ', rarityIds: ['rare'] })).toEqual([b]);
  expect(inventoryView(gd, input, { search: 'nothing' })).toEqual([]);
  expect(input).toEqual(before);
});
