import { describe, expect, it } from 'vitest';
import { ItemTemplateSchema } from '@mmo/schemas';
import {
  GameData,
  applyExperience,
  bindingOnAcquire,
  canPlaceInContainerKind,
  checkCanEquip,
  getGameData,
  listingFee,
  rawGameData,
  rollItemProperties,
  saleFee,
  seededRng,
  xpToNextLevel,
} from './index';

describe('game data', () => {
  it('loads and cross-validates the authored content', () => {
    const gd = getGameData();
    expect(gd.itemTemplates.size).toBeGreaterThan(5);
    expect(gd.rarities.get('mythic')?.tier).toBe(5);
    expect(gd.equipmentSlots.size).toBe(16);
  });

  it('rejects broken cross references', () => {
    const broken = structuredClone(rawGameData);
    broken.itemTemplates[0] = { ...broken.itemTemplates[0]!, rarityId: 'does_not_exist' };
    expect(() => GameData.load(broken)).toThrow(/unknown id "does_not_exist"/);
  });

  it('rejects inconsistent item templates at the schema level', () => {
    const t = getGameData().template('weapon.sword.iron_longsword');
    expect(ItemTemplateSchema.safeParse({ ...t, maxStack: 5 }).success).toBe(false);
    expect(
      ItemTemplateSchema.safeParse({ ...t, binding: 'on_pickup', tradeable: true }).success,
    ).toBe(false);
  });
});

describe('item rolling', () => {
  const gd = getGameData();
  const sword = gd.template('weapon.sword.iron_longsword');

  it('is deterministic for a seed and respects rarity rules', () => {
    const a = rollItemProperties(sword, gd.rarity('epic'), gd.raw.itemModifiers, seededRng(42));
    const b = rollItemProperties(sword, gd.rarity('epic'), gd.raw.itemModifiers, seededRng(42));
    expect(a).toEqual(b);
    expect(a.modifiers.length).toBeGreaterThanOrEqual(2);
    expect(a.sockets.length).toBe(1);
    expect(a.durability).toEqual({ current: 80, max: 80 });
  });

  it('gives common items no modifiers', () => {
    const r = rollItemProperties(sword, gd.rarity('common'), gd.raw.itemModifiers, seededRng(1));
    expect(r.modifiers).toEqual([]);
    expect(r.stats.strength).toBeGreaterThanOrEqual(2);
  });
});

describe('equip rules', () => {
  const gd = getGameData();
  const base = {
    equipmentType: undefined,
    characterLevel: 10,
    mainHandSlotType: null,
    offHandOccupied: false,
  };

  it('allows a warrior to wield a sword in the main hand', () => {
    const t = gd.template('weapon.sword.iron_longsword');
    const res = checkCanEquip({
      ...base,
      template: t,
      slot: gd.equipmentSlots.get('main_hand')!,
      equipmentType: gd.equipmentTypes.get('sword'),
      characterClass: gd.characterClass('class.warrior'),
    });
    expect(res.ok).toBe(true);
  });

  it('rejects wrong slot, missing proficiency, class restriction and level', () => {
    const sword = gd.template('weapon.sword.iron_longsword');
    const robe = gd.template('armor.cloth.apprentice_robe');
    const ring = gd.template('accessory.ring.copper_band');
    const mage = gd.characterClass('class.mage');
    const warrior = gd.characterClass('class.warrior');
    const slot = (id: string) => gd.equipmentSlots.get(id)!;
    const type = (id: string) => gd.equipmentTypes.get(id);

    expect(
      checkCanEquip({
        ...base,
        template: sword,
        slot: slot('head'),
        equipmentType: type('sword'),
        characterClass: warrior,
      }),
    ).toMatchObject({ ok: false, code: 'INVALID_SLOT' });
    expect(
      checkCanEquip({
        ...base,
        template: sword,
        slot: slot('main_hand'),
        equipmentType: type('sword'),
        characterClass: mage,
      }),
    ).toMatchObject({ ok: false, code: 'CLASS_RESTRICTED' });
    expect(
      checkCanEquip({
        ...base,
        template: robe,
        slot: slot('chest'),
        equipmentType: type('cloth'),
        characterClass: warrior,
      }),
    ).toMatchObject({ ok: false, code: 'CLASS_RESTRICTED' });
    expect(
      checkCanEquip({
        ...base,
        characterLevel: 1,
        template: ring,
        slot: slot('ring_2'),
        equipmentType: type('ring'),
        characterClass: mage,
      }),
    ).toMatchObject({ ok: false, code: 'LEVEL_TOO_LOW' });
  });

  it('blocks two-handers while an off hand is equipped', () => {
    const staff = gd.template('weapon.staff.oak_staff');
    const res = checkCanEquip({
      ...base,
      offHandOccupied: true,
      template: staff,
      slot: gd.equipmentSlots.get('main_hand')!,
      equipmentType: gd.equipmentTypes.get('staff'),
      characterClass: gd.characterClass('class.mage'),
    });
    expect(res).toMatchObject({ ok: false, code: 'SLOT_OCCUPIED' });
  });
});

describe('storage placement rules', () => {
  const gd = getGameData();
  it('keeps character-bound items out of the shared account vault', () => {
    const trinket = gd.template('accessory.trinket.ember_heart');
    const bound = bindingOnAcquire(
      trinket,
      { accountId: 'a', characterId: 'c' },
      new Date().toISOString(),
    );
    expect(bound.kind).toBe('character');
    expect(canPlaceInContainerKind(trinket, bound, 'account_vault')).toEqual({
      ok: false,
      reason: 'ITEM_NOT_VAULTABLE',
    });
    expect(canPlaceInContainerKind(trinket, bound, 'character_vault')).toEqual({ ok: true });
  });
  it('keeps non-materials out of the material pouch and quest items out of vaults', () => {
    expect(
      canPlaceInContainerKind(
        gd.template('weapon.sword.iron_longsword'),
        { kind: 'unbound' },
        'material_pouch',
      ).ok,
    ).toBe(false);
    expect(
      canPlaceInContainerKind(
        gd.template('quest.misc.elders_letter'),
        { kind: 'unbound' },
        'character_vault',
      ).ok,
    ).toBe(false);
  });
});

describe('progression and fees', () => {
  const gd = getGameData();
  it('rolls XP over multiple levels', () => {
    const need1 = xpToNextLevel(gd.raw.experienceCurve, 1);
    const need2 = xpToNextLevel(gd.raw.experienceCurve, 2);
    const res = applyExperience(gd.raw.experienceCurve, { level: 1, xp: 0 }, need1 + need2 + 5);
    expect(res).toEqual({ level: 3, xp: 5, levelsGained: 2 });
  });
  it('computes marketplace fees from data', () => {
    const rules = gd.raw.marketplaceRules;
    expect(listingFee(rules, 100)).toBe(10); // min fee
    expect(listingFee(rules, 100_000)).toBe(1_000);
    expect(saleFee(rules, 1_000)).toBe(50);
  });
});
