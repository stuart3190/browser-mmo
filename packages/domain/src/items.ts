import { and, asc, eq, inArray, lt, sql } from 'drizzle-orm';
import { schema } from '@mmo/db';
import type { DbOrTx, Tx } from '@mmo/db';
import {
  bindingOnAcquire,
  canPlaceInContainerKind,
  checkCanEquip,
  defaultContainerKindFor,
  rollItemProperties,
} from '@mmo/game-data';
import type {
  AcquisitionMethod,
  CharacterItems,
  ContainerKind,
  Item,
  ItemLocation,
  MoveItemRequest,
} from '@mmo/schemas';
import { DomainError, ErrorCode, uuidv7 } from '@mmo/shared';
import type { Actor, DomainContext } from './context';
import {
  characterCanUseContainer,
  containersForCharacter,
  firstFreeSlot,
  lockCharacterContainer,
  lockContainers,
  occupiedSlots,
} from './containers';
import { recordItemHistory } from './history';
import type { HistoryEvent } from './history';
import {
  bindingColumns,
  bindingFromRow,
  containerFromRow,
  itemViewFromRow,
  itemViews,
  locationColumns,
  locationFromRow,
  resolveLocation,
} from './mappers';
import { inTransaction } from './tx';

export type ItemRow = typeof schema.itemInstances.$inferSelect;
type CharacterRow = typeof schema.characters.$inferSelect;

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Loads a live character and asserts it belongs to `accountId`. */
export async function requireOwnedCharacter(
  db: DbOrTx,
  accountId: string,
  characterId: string,
): Promise<CharacterRow> {
  const [row] = await db
    .select()
    .from(schema.characters)
    .where(and(eq(schema.characters.id, characterId), sql`${schema.characters.deletedAt} IS NULL`));
  if (!row || row.accountId !== accountId)
    throw new DomainError(ErrorCode.NOT_FOUND, 'Character not found');
  return row;
}

/** SELECT ... FOR UPDATE on item rows, in ascending ID order (deadlock-safe). */
export async function lockItems(tx: Tx, ids: string[]): Promise<Map<string, ItemRow>> {
  const unique = [...new Set(ids)].sort();
  if (unique.length === 0) return new Map();
  const rows = await tx
    .select()
    .from(schema.itemInstances)
    .where(inArray(schema.itemInstances.id, unique))
    .orderBy(asc(schema.itemInstances.id))
    .for('update');
  return new Map(rows.map((r) => [r.id, r]));
}

export async function lockItem(tx: Tx, id: string): Promise<ItemRow> {
  const row = (await lockItems(tx, [id])).get(id);
  if (!row) throw new DomainError(ErrorCode.NOT_FOUND, 'Item not found');
  return row;
}

/** Writes a new location (+ optional other columns) and bumps the version. */
async function updateItem(
  tx: Tx,
  row: ItemRow,
  now: Date,
  patch: Partial<typeof schema.itemInstances.$inferInsert>,
): Promise<ItemRow> {
  const [updated] = await tx
    .update(schema.itemInstances)
    .set({ ...patch, version: row.version + 1, updatedAt: now })
    .where(and(eq(schema.itemInstances.id, row.id), eq(schema.itemInstances.version, row.version)))
    .returning();
  // Rows are locked, so a version mismatch here means a bug, not a race.
  if (!updated) throw new DomainError(ErrorCode.CONFLICT, 'Item changed concurrently');
  return updated;
}

// ---------------------------------------------------------------------------
// Creating items (the ONLY place item instances are minted)
// ---------------------------------------------------------------------------

export interface GrantItemInput {
  accountId: string;
  characterId: string;
  templateId: string;
  quantity: number;
  /** Override rarity (loot rolls, admin grants). Defaults to the template rarity. */
  rarityId?: string;
  method: AcquisitionMethod;
  /** Unique dedupe key for the source event. A second grant with the same key fails. */
  sourceRef?: string | null;
  actor: Actor;
  correlationId?: string;
  /** Deliver into this container kind instead of the template default (e.g. overflow mailbox). */
  containerKind?: ContainerKind;
}

export interface GrantResult {
  /** The newly minted instance row (may be `destroyed: stack_merged` if fully merged). */
  created: ItemRow;
  /** Every row whose visible state changed (new stack and/or topped-up stacks). */
  changed: ItemRow[];
}

/**
 * Mints a new item instance for a character inside an existing transaction.
 *
 * Stackable items are merged into existing compatible stacks first. A row is ALWAYS inserted for
 * the grant (even when fully merged it is stored as destroyed/stack_merged) so that every
 * acquisition has provenance and `sourceRef` dedupe works uniformly.
 */
export async function grantItemInTx(
  tx: Tx,
  ctx: DomainContext,
  input: GrantItemInput,
): Promise<GrantResult> {
  const template = ctx.gameData.itemTemplates.get(input.templateId);
  if (!template)
    throw new DomainError(ErrorCode.VALIDATION_FAILED, `Unknown item template ${input.templateId}`);
  if (
    !Number.isInteger(input.quantity) ||
    input.quantity < 1 ||
    input.quantity > template.maxStack
  ) {
    throw new DomainError(ErrorCode.VALIDATION_FAILED, `Quantity must be 1..${template.maxStack}`);
  }
  const rarity = ctx.gameData.rarities.get(input.rarityId ?? template.rarityId);
  if (!rarity) throw new DomainError(ErrorCode.VALIDATION_FAILED, 'Unknown rarity');

  const now = ctx.now();
  const container = await lockCharacterContainer(
    tx,
    input.characterId,
    input.containerKind ?? defaultContainerKindFor(template),
  );
  const binding = bindingOnAcquire(
    template,
    { accountId: input.accountId, characterId: input.characterId },
    now.toISOString(),
  );
  const bindingCols = bindingColumns(binding);
  const history: HistoryEvent[] = [];
  const changed: ItemRow[] = [];

  // 1. Top up compatible stacks.
  let remaining = input.quantity;
  const mergedInto: string[] = [];
  if (template.maxStack > 1) {
    const candidates = await tx
      .select()
      .from(schema.itemInstances)
      .where(
        and(
          eq(schema.itemInstances.locationKind, 'container'),
          eq(schema.itemInstances.containerId, container.id),
          eq(schema.itemInstances.templateId, template.id),
          eq(schema.itemInstances.rarityId, rarity.id),
          eq(schema.itemInstances.bindingKind, bindingCols.bindingKind),
          lt(schema.itemInstances.quantity, template.maxStack),
        ),
      )
      .orderBy(asc(schema.itemInstances.slotIndex))
      .for('update');
    for (const stack of candidates) {
      if (remaining === 0) break;
      if (
        stack.boundCharacterId !== bindingCols.boundCharacterId ||
        stack.boundAccountId !== bindingCols.boundAccountId
      )
        continue;
      const add = Math.min(template.maxStack - stack.quantity, remaining);
      remaining -= add;
      const updated = await updateItem(tx, stack, now, { quantity: stack.quantity + add });
      changed.push(updated);
      mergedInto.push(stack.id);
    }
  }

  // 2. Place the remainder in a free slot (or record the grant as fully merged).
  let location: ItemLocation;
  if (remaining > 0) {
    const slot = firstFreeSlot(container.capacity, await occupiedSlots(tx, container.id));
    if (slot === undefined)
      throw new DomainError(
        ErrorCode.CONTAINER_FULL,
        `Your ${container.kind.replace('_', ' ')} is full`,
      );
    location = {
      kind: 'container',
      containerId: container.id,
      containerKind: container.kind,
      slot,
    };
  } else {
    location = { kind: 'destroyed', reason: 'stack_merged' };
  }

  const rolled = rollItemProperties(template, rarity, ctx.gameData.raw.itemModifiers, ctx.rng);
  const id = uuidv7();
  const [created] = await tx
    .insert(schema.itemInstances)
    .values({
      id,
      templateId: template.id,
      rarityId: rolled.rarityId,
      quantity: remaining > 0 ? remaining : input.quantity,
      ownerAccountId: input.accountId,
      ownerCharacterId: input.characterId,
      originalOwnerAccountId: input.accountId,
      originalOwnerCharacterId: input.characterId,
      crafterCharacterId: input.method === 'crafted' ? input.characterId : null,
      acquisitionMethod: input.method,
      sourceRef: input.sourceRef ?? null,
      ...locationColumns(location),
      ...bindingCols,
      stats: rolled.stats,
      modifiers: rolled.modifiers,
      sockets: rolled.sockets,
      enchantments: [],
      durabilityCurrent: rolled.durability?.current ?? null,
      durabilityMax: rolled.durability?.max ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  history.push({
    itemInstanceId: id,
    eventType: input.method === 'admin_grant' ? 'admin_granted' : 'created',
    actor: input.actor,
    toOwnerAccountId: input.accountId,
    toLocation: location,
    quantity: input.quantity,
    correlationId: input.correlationId ?? null,
    details: { method: input.method, sourceRef: input.sourceRef ?? null, rarityId: rarity.id },
    occurredAt: now,
  });
  if (mergedInto.length > 0) {
    history.push({
      itemInstanceId: id,
      eventType: 'stack_merged',
      actor: input.actor,
      quantity: input.quantity - remaining,
      details: { mergedInto },
      occurredAt: now,
    });
  }
  if (binding.kind !== 'unbound') {
    history.push({
      itemInstanceId: id,
      eventType: 'bound',
      actor: input.actor,
      details: { binding },
      occurredAt: now,
    });
  }
  await recordItemHistory(tx, history);
  if (remaining > 0) changed.push(created!);
  return { created: created!, changed };
}

// ---------------------------------------------------------------------------
// Moving items: container <-> container, equip, unequip
// ---------------------------------------------------------------------------

export interface MoveItemInput {
  accountId: string;
  characterId: string;
  request: MoveItemRequest;
  requestId?: string;
}

/** Scratch equip-slot name used for the duration of a swap inside one transaction. */
const SWAP_SCRATCH_EQUIP_SLOT = '__swap__';

/**
 * Moves an item the character controls. Covers backpack ⇄ material pouch ⇄ character vault ⇄
 * account vault, equipping (with swap) and unequipping. Everything happens in one transaction
 * with the item rows and affected containers locked.
 */
export async function moveItem(ctx: DomainContext, input: MoveItemInput): Promise<Item[]> {
  const { accountId, characterId, request } = input;
  const actor: Actor = {
    accountId,
    characterId,
    ...(input.requestId ? { requestId: input.requestId } : {}),
  };

  return inTransaction(ctx, async (tx) => {
    const character = await requireOwnedCharacter(tx, accountId, characterId);
    const item = await lockItem(tx, request.itemInstanceId);
    if (item.ownerAccountId !== accountId)
      throw new DomainError(ErrorCode.ITEM_NOT_OWNED, 'You do not own this item');
    if (item.version !== request.expectedVersion) {
      throw new DomainError(ErrorCode.CONFLICT, 'Item has changed; refresh and retry', {
        currentVersion: item.version,
      });
    }
    const template = ctx.gameData.template(item.templateId);
    const binding = bindingFromRow(item);
    if (binding.kind === 'character' && binding.characterId !== characterId) {
      throw new DomainError(ErrorCode.ITEM_BOUND, 'Item is bound to another character');
    }

    // Source must be somewhere this character controls.
    const sourceContainerId = item.locationKind === 'container' ? item.containerId! : null;
    if (item.locationKind === 'equipped') {
      if (item.equipCharacterId !== characterId)
        throw new DomainError(ErrorCode.ITEM_NOT_OWNED, 'Item is equipped by another character');
    } else if (item.locationKind !== 'container') {
      throw new DomainError(
        ErrorCode.ITEM_NOT_IN_EXPECTED_LOCATION,
        `Item is currently in ${item.locationKind}`,
      );
    }

    const now = ctx.now();
    const fromLocation = await resolveLocation(tx, item);
    const changed: ItemRow[] = [];
    const history: HistoryEvent[] = [];

    if (request.to.kind === 'container') {
      const locked = await lockContainers(tx, [
        request.to.containerId,
        ...(sourceContainerId ? [sourceContainerId] : []),
      ]);
      const target = locked.get(request.to.containerId);
      if (!target || !characterCanUseContainer(target, accountId, characterId)) {
        throw new DomainError(ErrorCode.FORBIDDEN, 'You cannot use that container');
      }
      if (
        sourceContainerId &&
        !characterCanUseContainer(locked.get(sourceContainerId)!, accountId, characterId)
      ) {
        throw new DomainError(ErrorCode.FORBIDDEN, 'You cannot take items from that container');
      }
      const placement = canPlaceInContainerKind(template, binding, target.kind);
      if (!placement.ok)
        throw new DomainError(
          ErrorCode[placement.reason],
          `This item cannot go into the ${target.kind.replace('_', ' ')}`,
        );

      const occupied = await occupiedSlots(tx, target.id);
      let slot = request.to.slot;
      if (slot === undefined) {
        slot = firstFreeSlot(target.capacity, occupied);
        if (slot === undefined)
          throw new DomainError(ErrorCode.CONTAINER_FULL, 'Container is full');
      } else {
        if (slot >= target.capacity)
          throw new DomainError(ErrorCode.INVALID_SLOT, 'Slot out of range');
        if (sourceContainerId === target.id && item.slotIndex === slot)
          return itemViews(tx, ctx.gameData, [item]);
        if (occupied.has(slot)) throw new DomainError(ErrorCode.SLOT_OCCUPIED, 'Slot is occupied');
      }
      const toLocation: ItemLocation = {
        kind: 'container',
        containerId: target.id,
        containerKind: target.kind,
        slot,
      };
      changed.push(
        await updateItem(tx, item, now, {
          ...locationColumns(toLocation),
          ownerCharacterId: target.kind === 'account_vault' ? null : characterId,
        }),
      );
      history.push({
        itemInstanceId: item.id,
        eventType: item.locationKind === 'equipped' ? 'unequipped' : 'moved',
        actor,
        fromLocation,
        toLocation,
        occurredAt: now,
      });
    } else {
      // ---- Equip ----
      const slotId = request.to.slotId;
      const slotDef = ctx.gameData.equipmentSlots.get(slotId);
      if (!slotDef)
        throw new DomainError(ErrorCode.INVALID_SLOT, `Unknown equipment slot ${slotId}`);
      if (item.locationKind === 'equipped' && item.equipSlot === slotId)
        return itemViews(tx, ctx.gameData, [item]);
      if (sourceContainerId) {
        const locked = await lockContainers(tx, [sourceContainerId]);
        if (!characterCanUseContainer(locked.get(sourceContainerId)!, accountId, characterId)) {
          throw new DomainError(ErrorCode.FORBIDDEN, 'You cannot take items from that container');
        }
      }

      const equipped = await tx
        .select()
        .from(schema.itemInstances)
        .where(
          and(
            eq(schema.itemInstances.locationKind, 'equipped'),
            eq(schema.itemInstances.equipCharacterId, characterId),
          ),
        )
        .orderBy(asc(schema.itemInstances.id))
        .for('update');
      const bySlot = new Map(equipped.map((r) => [r.equipSlot!, r]));
      const occupant = bySlot.get(slotId);
      const mainHand = bySlot.get('main_hand');
      const mainHandSlotType =
        mainHand && mainHand.id !== item.id
          ? (ctx.gameData.template(mainHand.templateId).equipment?.slotType ?? null)
          : null;
      const offHand = bySlot.get('off_hand');

      const check = checkCanEquip({
        template,
        slot: slotDef,
        equipmentType: template.equipment
          ? ctx.gameData.equipmentTypes.get(template.equipment.equipmentTypeId)
          : undefined,
        characterClass: ctx.gameData.characterClass(character.classId),
        characterLevel: character.level,
        mainHandSlotType,
        offHandOccupied: offHand !== undefined && offHand.id !== item.id,
      });
      if (!check.ok) throw new DomainError(check.code, check.message);

      const toLocation: ItemLocation = { kind: 'equipped', characterId, slotId };
      let occupantRow = occupant;
      if (occupantRow) {
        // Swap: the occupant goes where the new item came from. Move it to a scratch location
        // first so the partial unique indexes never see two items in one slot.
        const occTemplate = ctx.gameData.template(occupantRow.templateId);
        if (sourceContainerId) {
          const srcKind = (await lockContainers(tx, [sourceContainerId])).get(
            sourceContainerId,
          )!.kind;
          const ok = canPlaceInContainerKind(occTemplate, bindingFromRow(occupantRow), srcKind);
          if (!ok.ok)
            throw new DomainError(ErrorCode.SLOT_OCCUPIED, 'Unequip the current item first');
        } else {
          const recheck = checkCanEquip({
            template: occTemplate,
            slot: ctx.gameData.equipmentSlots.get(item.equipSlot!)!,
            equipmentType: ctx.gameData.equipmentTypes.get(occTemplate.equipment!.equipmentTypeId),
            characterClass: ctx.gameData.characterClass(character.classId),
            characterLevel: character.level,
            mainHandSlotType: null,
            offHandOccupied: false,
          });
          if (!recheck.ok)
            throw new DomainError(ErrorCode.SLOT_OCCUPIED, 'Cannot swap these items');
        }
        occupantRow = await updateItem(tx, occupantRow, now, {
          equipSlot: SWAP_SCRATCH_EQUIP_SLOT,
        });
      }

      const bindNow = template.binding === 'on_equip' && binding.kind === 'unbound';
      const equippedRow = await updateItem(tx, item, now, {
        ...locationColumns(toLocation),
        ownerCharacterId: characterId,
        ...(bindNow
          ? bindingColumns({ kind: 'character', characterId, boundAt: now.toISOString() })
          : {}),
      });
      changed.push(equippedRow);
      history.push({
        itemInstanceId: item.id,
        eventType: 'equipped',
        actor,
        fromLocation,
        toLocation,
        occurredAt: now,
      });
      if (bindNow) {
        history.push({
          itemInstanceId: item.id,
          eventType: 'bound',
          actor,
          details: { rule: 'on_equip', characterId },
          occurredAt: now,
        });
      }

      if (occupantRow && occupant) {
        const occTo = fromLocation;
        const moved = await updateItem(tx, occupantRow, now, {
          ...locationColumns(occTo),
          ownerCharacterId: characterId,
        });
        changed.push(moved);
        history.push({
          itemInstanceId: occupant.id,
          eventType: occTo.kind === 'equipped' ? 'equipped' : 'unequipped',
          actor,
          fromLocation: locationFromRow(occupant),
          toLocation: occTo,
          details: { swappedWith: item.id },
          occurredAt: now,
        });
      }
    }

    await recordItemHistory(tx, history);
    return itemViews(tx, ctx.gameData, changed);
  });
}

// ---------------------------------------------------------------------------
// Player flags (lock / favourite / junk)
// ---------------------------------------------------------------------------

export async function setItemFlags(
  ctx: DomainContext,
  input: {
    accountId: string;
    itemInstanceId: string;
    locked?: boolean;
    favourite?: boolean;
    junk?: boolean;
  },
): Promise<Item> {
  return inTransaction(ctx, async (tx) => {
    const item = await lockItem(tx, input.itemInstanceId);
    if (item.ownerAccountId !== input.accountId)
      throw new DomainError(ErrorCode.ITEM_NOT_OWNED, 'You do not own this item');
    const updated = await updateItem(tx, item, ctx.now(), {
      ...(input.locked !== undefined ? { isLocked: input.locked } : {}),
      ...(input.favourite !== undefined ? { isFavourite: input.favourite } : {}),
      ...(input.junk !== undefined ? { isJunk: input.junk } : {}),
    });
    return (await itemViews(tx, ctx.gameData, [updated]))[0]!;
  });
}

// ---------------------------------------------------------------------------
// Admin revoke (moves the item to `destroyed`; rows are never deleted)
// ---------------------------------------------------------------------------

export async function revokeItemInTx(
  tx: Tx,
  ctx: DomainContext,
  itemInstanceId: string,
  actor: Actor,
  reason: string,
): Promise<ItemRow> {
  const item = await lockItem(tx, itemInstanceId);
  if (item.locationKind === 'destroyed')
    throw new DomainError(ErrorCode.ITEM_NOT_IN_EXPECTED_LOCATION, 'Item already destroyed');
  if (item.locationKind === 'marketplace_escrow' || item.locationKind === 'trade_escrow') {
    throw new DomainError(
      ErrorCode.ITEM_NOT_IN_EXPECTED_LOCATION,
      'Cancel the listing/trade before revoking',
    );
  }
  const now = ctx.now();
  const to: ItemLocation = { kind: 'destroyed', reason: 'admin_revoked' };
  const updated = await updateItem(tx, item, now, locationColumns(to));
  await recordItemHistory(tx, [
    {
      itemInstanceId: item.id,
      eventType: 'admin_revoked',
      actor,
      fromLocation: await resolveLocation(tx, item),
      toLocation: to,
      details: { reason },
      occurredAt: now,
    },
  ]);
  return updated;
}

/**
 * Removes `quantity` units of a template from a character's containers inside an existing
 * transaction (quest turn-in). Containers are locked first (same order as every slot-changing
 * operation), then the stacks; stacks are consumed in the order of `containerKinds` and slot
 * order. Locked items are never consumed. Throws INSUFFICIENT_ITEMS (rolling everything back) if
 * there are not enough. Every consumed row gets history (`destroyed` or `modified`).
 */
export async function consumeItemsInTx(
  tx: Tx,
  ctx: DomainContext,
  input: {
    characterId: string;
    templateId: string;
    quantity: number;
    containerKinds: ContainerKind[];
    actor: Actor;
    reason: string;
    correlationId: string;
  },
): Promise<ItemRow[]> {
  const containers = await tx
    .select({ id: schema.containers.id, kind: schema.containers.kind })
    .from(schema.containers)
    .where(
      and(
        eq(schema.containers.ownerCharacterId, input.characterId),
        inArray(schema.containers.kind, input.containerKinds),
      ),
    );
  const locked = await lockContainers(
    tx,
    containers.map((c) => c.id),
  );
  const rank = (containerId: string | null) =>
    input.containerKinds.indexOf(locked.get(containerId ?? '')!.kind);
  const rows = (
    await tx
      .select()
      .from(schema.itemInstances)
      .where(
        and(
          eq(schema.itemInstances.locationKind, 'container'),
          inArray(schema.itemInstances.containerId, [...locked.keys()]),
          eq(schema.itemInstances.templateId, input.templateId),
          eq(schema.itemInstances.isLocked, false),
        ),
      )
      .orderBy(asc(schema.itemInstances.id))
      .for('update')
  ).sort(
    (a, b) => rank(a.containerId) - rank(b.containerId) || (a.slotIndex ?? 0) - (b.slotIndex ?? 0),
  );
  const available = rows.reduce((n, r) => n + r.quantity, 0);
  if (locked.size === 0 || available < input.quantity)
    throw new DomainError(
      ErrorCode.INSUFFICIENT_ITEMS,
      `Not enough ${ctx.gameData.itemTemplates.get(input.templateId)?.name ?? input.templateId}`,
      { required: input.quantity, available },
    );
  const now = ctx.now();
  const changed: ItemRow[] = [];
  const history: HistoryEvent[] = [];
  let remaining = input.quantity;
  for (const row of rows) {
    if (remaining === 0) break;
    const take = Math.min(row.quantity, remaining);
    remaining -= take;
    const from = await resolveLocation(tx, row);
    if (take === row.quantity) {
      const to: ItemLocation = { kind: 'destroyed', reason: input.reason };
      changed.push(await updateItem(tx, row, now, locationColumns(to)));
      history.push({
        itemInstanceId: row.id,
        eventType: 'destroyed',
        actor: input.actor,
        fromLocation: from,
        toLocation: to,
        quantity: take,
        correlationId: input.correlationId,
        details: { reason: input.reason },
        occurredAt: now,
      });
    } else {
      changed.push(await updateItem(tx, row, now, { quantity: row.quantity - take }));
      history.push({
        itemInstanceId: row.id,
        eventType: 'modified',
        actor: input.actor,
        fromLocation: from,
        toLocation: from,
        quantity: take,
        correlationId: input.correlationId,
        details: { reason: input.reason, consumed: take, remaining: row.quantity - take },
        occurredAt: now,
      });
    }
  }
  await recordItemHistory(tx, history);
  return changed;
}

/** Units of a template in the given containers of a character (excluding locked items). */
export async function countCharacterItems(
  db: DbOrTx,
  characterId: string,
  containerKinds: ContainerKind[],
): Promise<Map<string, number>> {
  const rows = await db
    .select({
      templateId: schema.itemInstances.templateId,
      n: sql<number>`sum(${schema.itemInstances.quantity})::int`,
    })
    .from(schema.itemInstances)
    .innerJoin(schema.containers, eq(schema.containers.id, schema.itemInstances.containerId))
    .where(
      and(
        eq(schema.itemInstances.locationKind, 'container'),
        eq(schema.containers.ownerCharacterId, characterId),
        inArray(schema.containers.kind, containerKinds),
        eq(schema.itemInstances.isLocked, false),
      ),
    )
    .groupBy(schema.itemInstances.templateId);
  return new Map(rows.map((r) => [r.templateId, r.n]));
}

// ---------------------------------------------------------------------------
// Read models
// ---------------------------------------------------------------------------

/** Every container (with items) and the equipment of one character. */
export async function getCharacterItems(
  db: DbOrTx,
  ctx: DomainContext,
  accountId: string,
  characterId: string,
): Promise<CharacterItems> {
  const containers = await containersForCharacter(db, accountId, characterId);
  const kinds = new Map(containers.map((c) => [c.id, c.kind]));
  const ids = containers.map((c) => c.id);
  const inContainers = ids.length
    ? await db
        .select()
        .from(schema.itemInstances)
        .where(
          and(
            eq(schema.itemInstances.locationKind, 'container'),
            inArray(schema.itemInstances.containerId, ids),
          ),
        )
        .orderBy(asc(schema.itemInstances.slotIndex))
    : [];
  const equipped = await db
    .select()
    .from(schema.itemInstances)
    .where(
      and(
        eq(schema.itemInstances.locationKind, 'equipped'),
        eq(schema.itemInstances.equipCharacterId, characterId),
      ),
    );

  return {
    characterId,
    equipment: {
      characterId,
      slots: Object.fromEntries(
        equipped.map((r) => [r.equipSlot!, itemViewFromRow(ctx.gameData, r, kinds)]),
      ),
    },
    containers: containers.map((c) => ({
      container: containerFromRow(c),
      items: inContainers
        .filter((r) => r.containerId === c.id)
        .map((r) => itemViewFromRow(ctx.gameData, r, kinds)),
    })),
  };
}

export async function getItemHistory(db: DbOrTx, itemInstanceId: string) {
  return db
    .select()
    .from(schema.itemHistory)
    .where(eq(schema.itemHistory.itemInstanceId, itemInstanceId))
    .orderBy(asc(schema.itemHistory.occurredAt), asc(schema.itemHistory.id));
}
