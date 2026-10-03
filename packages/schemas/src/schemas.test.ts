import { describe, expect, it } from 'vitest';
import { uuidv7 } from '@mmo/shared';
import {
  CreateListingRequestSchema,
  DORMANT_EXTERNAL_OWNERSHIP,
  ItemInstanceSchema,
  ItemLocationSchema,
  MoveItemRequestSchema,
  PlayerCharacterSchema,
} from './index';

const now = new Date().toISOString();

function validInstance() {
  return {
    id: uuidv7(),
    templateId: 'weapon.sword.iron_longsword',
    rarityId: 'common',
    quantity: 1,
    ownership: {
      ownerAccountId: uuidv7(),
      ownerCharacterId: uuidv7(),
      originalOwnerAccountId: null,
      originalOwnerCharacterId: null,
      crafterCharacterId: null,
    },
    location: { kind: 'container', containerId: uuidv7(), containerKind: 'backpack', slot: 0 },
    acquisition: { method: 'world_pickup', sourceRef: 'world_pickup:spawn.x:1' },
    binding: { kind: 'unbound' },
    stats: { strength: 3 },
    modifiers: [],
    sockets: [],
    enchantments: [],
    durability: { current: 80, max: 80 },
    appearance: null,
    flags: { locked: false, favourite: false, junk: false },
    external: DORMANT_EXTERNAL_OWNERSHIP,
    version: 0,
    createdAt: now,
    updatedAt: now,
  };
}

describe('ItemInstanceSchema', () => {
  it('accepts a well-formed instance', () => {
    expect(ItemInstanceSchema.safeParse(validInstance()).success).toBe(true);
  });

  it('rejects any attempt to enable external ownership (dormant fields must stay inert)', () => {
    const inst = {
      ...validInstance(),
      external: { externalOwnershipEnabled: true, externalAssetId: 'x', externalNetwork: 'y' },
    };
    expect(ItemInstanceSchema.safeParse(inst).success).toBe(false);
  });

  it('rejects zero/negative quantity and unknown stat keys', () => {
    expect(ItemInstanceSchema.safeParse({ ...validInstance(), quantity: 0 }).success).toBe(false);
    expect(
      ItemInstanceSchema.safeParse({ ...validInstance(), stats: { godmode: 1 } }).success,
    ).toBe(false);
  });
});

describe('ItemLocationSchema', () => {
  it('only allows exactly one location shape at a time', () => {
    expect(
      ItemLocationSchema.safeParse({ kind: 'equipped', characterId: uuidv7(), slotId: 'main_hand' })
        .success,
    ).toBe(true);
    expect(
      ItemLocationSchema.safeParse({ kind: 'marketplace_escrow', listingId: uuidv7() }).success,
    ).toBe(true);
    // A container location missing its slot is invalid.
    expect(
      ItemLocationSchema.safeParse({
        kind: 'container',
        containerId: uuidv7(),
        containerKind: 'backpack',
      }).success,
    ).toBe(false);
    expect(ItemLocationSchema.safeParse({ kind: 'floating' }).success).toBe(false);
  });
});

describe('API request schemas', () => {
  it('validates move requests', () => {
    const ok = MoveItemRequestSchema.safeParse({
      itemInstanceId: uuidv7(),
      expectedVersion: 3,
      to: { kind: 'equipped', slotId: 'main_hand' },
    });
    expect(ok.success).toBe(true);
    const bad = MoveItemRequestSchema.safeParse({
      itemInstanceId: 'not-a-uuid',
      expectedVersion: -1,
      to: {},
    });
    expect(bad.success).toBe(false);
  });

  it('rejects zero/negative/fractional marketplace prices', () => {
    const base = { characterId: uuidv7(), itemInstanceId: uuidv7(), durationHours: 24 };
    expect(CreateListingRequestSchema.safeParse({ ...base, price: 0 }).success).toBe(false);
    expect(CreateListingRequestSchema.safeParse({ ...base, price: 1.5 }).success).toBe(false);
    expect(CreateListingRequestSchema.safeParse({ ...base, price: 10 }).success).toBe(true);
  });

  it('validates character names', () => {
    const c = {
      id: uuidv7(),
      accountId: uuidv7(),
      name: 'Aria',
      classId: 'class.mage',
      specialisationId: null,
      level: 1,
      xp: 0,
      zoneId: 'zone.greenvale.meadows',
      position: { x: 0, y: 0, z: 0 },
      createdAt: now,
    };
    expect(PlayerCharacterSchema.safeParse(c).success).toBe(true);
    expect(PlayerCharacterSchema.safeParse({ ...c, name: '<script>' }).success).toBe(false);
  });
});
