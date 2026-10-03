import { inArray } from 'drizzle-orm';
import { schema } from '@mmo/db';
import type { DbOrTx } from '@mmo/db';
import type {
  Container,
  Item,
  ItemBindingState,
  ItemInstance,
  ItemLocation,
  PlayerAccount,
  PlayerCharacter,
} from '@mmo/schemas';
import { DORMANT_EXTERNAL_OWNERSHIP } from '@mmo/schemas';
import type { GameData } from '@mmo/game-data';

type ItemRow = typeof schema.itemInstances.$inferSelect;
type ContainerRow = typeof schema.containers.$inferSelect;
type CharacterRow = typeof schema.characters.$inferSelect;
type AccountRow = typeof schema.accounts.$inferSelect;

const iso = (d: Date) => d.toISOString();

function containerKindOf(
  id: string,
  kinds: ReadonlyMap<string, Container['kind']> | undefined,
): Container['kind'] {
  const kind = kinds?.get(id);
  // Never guess: a wrong kind in a DTO would mislead every client.
  if (!kind) throw new Error(`containerKind for ${id} not resolved; use itemViews()`);
  return kind;
}

export function locationFromRow(
  row: ItemRow,
  containerKindById?: ReadonlyMap<string, Container['kind']>,
): ItemLocation {
  switch (row.locationKind) {
    case 'container':
      return {
        kind: 'container',
        containerId: row.containerId!,
        containerKind: containerKindOf(row.containerId!, containerKindById),
        slot: row.slotIndex!,
      };
    case 'equipped':
      return { kind: 'equipped', characterId: row.equipCharacterId!, slotId: row.equipSlot! };
    case 'marketplace_escrow':
      return { kind: 'marketplace_escrow', listingId: row.listingId! };
    case 'trade_escrow':
      return { kind: 'trade_escrow', tradeId: row.tradeId! };
    case 'destroyed':
      return { kind: 'destroyed', reason: row.destroyedReason ?? 'unknown' };
  }
}

/** Column values for a location (used in UPDATE statements). All location columns are set. */
export function locationColumns(loc: ItemLocation) {
  const cleared = {
    containerId: null as string | null,
    slotIndex: null as number | null,
    equipCharacterId: null as string | null,
    equipSlot: null as string | null,
    listingId: null as string | null,
    tradeId: null as string | null,
    destroyedReason: null as string | null,
  };
  switch (loc.kind) {
    case 'container':
      return {
        ...cleared,
        locationKind: 'container' as const,
        containerId: loc.containerId,
        slotIndex: loc.slot,
      };
    case 'equipped':
      return {
        ...cleared,
        locationKind: 'equipped' as const,
        equipCharacterId: loc.characterId,
        equipSlot: loc.slotId,
      };
    case 'marketplace_escrow':
      return { ...cleared, locationKind: 'marketplace_escrow' as const, listingId: loc.listingId };
    case 'trade_escrow':
      return { ...cleared, locationKind: 'trade_escrow' as const, tradeId: loc.tradeId };
    case 'destroyed':
      return { ...cleared, locationKind: 'destroyed' as const, destroyedReason: loc.reason };
  }
}

export function bindingFromRow(row: ItemRow): ItemBindingState {
  if (row.bindingKind === 'character') {
    return {
      kind: 'character',
      characterId: row.boundCharacterId!,
      boundAt: iso(row.boundAt ?? row.createdAt),
    };
  }
  if (row.bindingKind === 'account') {
    return {
      kind: 'account',
      accountId: row.boundAccountId!,
      boundAt: iso(row.boundAt ?? row.createdAt),
    };
  }
  return { kind: 'unbound' };
}

export function bindingColumns(b: ItemBindingState) {
  switch (b.kind) {
    case 'unbound':
      return {
        bindingKind: 'unbound' as const,
        boundCharacterId: null,
        boundAccountId: null,
        boundAt: null,
      };
    case 'character':
      return {
        bindingKind: 'character' as const,
        boundCharacterId: b.characterId,
        boundAccountId: null,
        boundAt: new Date(b.boundAt),
      };
    case 'account':
      return {
        bindingKind: 'account' as const,
        boundCharacterId: null,
        boundAccountId: b.accountId,
        boundAt: new Date(b.boundAt),
      };
  }
}

export function itemFromRow(
  row: ItemRow,
  containerKindById?: ReadonlyMap<string, Container['kind']>,
): ItemInstance {
  return {
    id: row.id,
    templateId: row.templateId,
    rarityId: row.rarityId,
    quantity: row.quantity,
    ownership: {
      ownerAccountId: row.ownerAccountId,
      ownerCharacterId: row.ownerCharacterId,
      originalOwnerAccountId: row.originalOwnerAccountId,
      originalOwnerCharacterId: row.originalOwnerCharacterId,
      crafterCharacterId: row.crafterCharacterId,
    },
    location: locationFromRow(row, containerKindById),
    acquisition: {
      method: row.acquisitionMethod as ItemInstance['acquisition']['method'],
      sourceRef: row.sourceRef,
    },
    binding: bindingFromRow(row),
    stats: row.stats as ItemInstance['stats'],
    modifiers: row.modifiers as ItemInstance['modifiers'],
    sockets: row.sockets as ItemInstance['sockets'],
    enchantments: row.enchantments as ItemInstance['enchantments'],
    durability:
      row.durabilityMax !== null && row.durabilityCurrent !== null
        ? { current: row.durabilityCurrent, max: row.durabilityMax }
        : null,
    appearance: (row.appearance as ItemInstance['appearance']) ?? null,
    flags: { locked: row.isLocked, favourite: row.isFavourite, junk: row.isJunk },
    external: DORMANT_EXTERNAL_OWNERSHIP,
    version: row.version,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

export function itemViewFromRow(
  gameData: GameData,
  row: ItemRow,
  kinds?: ReadonlyMap<string, Container['kind']>,
): Item {
  return { instance: itemFromRow(row, kinds), template: gameData.template(row.templateId) };
}

/** Location of one row with its container kind resolved from the database. */
export async function resolveLocation(db: DbOrTx, row: ItemRow): Promise<ItemLocation> {
  if (row.locationKind !== 'container') return locationFromRow(row);
  const [c] = await db
    .select({ id: schema.containers.id, kind: schema.containers.kind })
    .from(schema.containers)
    .where(inArray(schema.containers.id, [row.containerId!]));
  return locationFromRow(row, new Map(c ? [[c.id, c.kind]] : []));
}

/** Converts rows to API views, resolving the container kind of every container location. */
export async function itemViews(db: DbOrTx, gameData: GameData, rows: ItemRow[]): Promise<Item[]> {
  const ids = [
    ...new Set(rows.filter((r) => r.locationKind === 'container').map((r) => r.containerId!)),
  ];
  const kinds = new Map<string, Container['kind']>();
  if (ids.length > 0) {
    const cs = await db
      .select({ id: schema.containers.id, kind: schema.containers.kind })
      .from(schema.containers)
      .where(inArray(schema.containers.id, ids));
    for (const c of cs) kinds.set(c.id, c.kind);
  }
  return rows.map((r) => itemViewFromRow(gameData, r, kinds));
}

export function containerFromRow(row: ContainerRow): Container {
  return {
    id: row.id,
    kind: row.kind,
    ownerAccountId: row.ownerAccountId,
    ownerCharacterId: row.ownerCharacterId,
    ownerGuildId: row.ownerGuildId,
    capacity: row.capacity,
    createdAt: iso(row.createdAt),
  };
}

export function characterFromRow(row: CharacterRow): PlayerCharacter {
  return {
    id: row.id,
    accountId: row.accountId,
    name: row.name,
    classId: row.classId,
    specialisationId: row.specialisationId,
    level: row.level,
    xp: row.xp,
    zoneId: row.zoneId,
    position: { x: row.posX, y: row.posY, z: row.posZ },
    createdAt: iso(row.createdAt),
  };
}

export function accountFromRow(row: AccountRow): PlayerAccount {
  return {
    id: row.id,
    username: row.username,
    displayName: row.displayName,
    role: row.role,
    status: row.status,
    createdAt: iso(row.createdAt),
  };
}
