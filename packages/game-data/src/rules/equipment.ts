import type {
  CharacterClass,
  EquipmentSlotDefinition,
  EquipmentTypeDefinition,
  ItemTemplate,
} from '@mmo/schemas';
import { ErrorCode } from '@mmo/shared';
import { TWO_HANDED_SLOT_TYPES } from '../content/equipment';

export type EquipCheck = { ok: true } | { ok: false; code: ErrorCode; message: string };

/**
 * Pure equip validation. The server calls this inside the equip transaction; clients may call it
 * to grey out invalid slots, but the server result is the only one that counts.
 */
export function checkCanEquip(args: {
  template: ItemTemplate;
  slot: EquipmentSlotDefinition;
  equipmentType: EquipmentTypeDefinition | undefined;
  characterClass: CharacterClass;
  characterLevel: number;
  /** Slot type of the item currently in main_hand, if any (for two-hand rules). */
  mainHandSlotType: string | null;
  offHandOccupied: boolean;
}): EquipCheck {
  const { template, slot, equipmentType, characterClass, characterLevel } = args;
  const eq = template.equipment;
  if (!eq) return { ok: false, code: ErrorCode.CANNOT_EQUIP, message: 'Item is not equipment' };
  if (!slot.accepts.includes(eq.slotType)) {
    return {
      ok: false,
      code: ErrorCode.INVALID_SLOT,
      message: `Slot ${slot.id} does not accept ${eq.slotType}`,
    };
  }
  if (characterLevel < template.requiredLevel) {
    return {
      ok: false,
      code: ErrorCode.LEVEL_TOO_LOW,
      message: `Requires level ${template.requiredLevel}`,
    };
  }
  if (
    template.allowedClassIds.length > 0 &&
    !template.allowedClassIds.includes(characterClass.id)
  ) {
    return {
      ok: false,
      code: ErrorCode.CLASS_RESTRICTED,
      message: 'Your class cannot use this item',
    };
  }
  if (!equipmentType) {
    return {
      ok: false,
      code: ErrorCode.CANNOT_EQUIP,
      message: `Unknown equipment type ${eq.equipmentTypeId}`,
    };
  }
  if (equipmentType.requiresProficiency) {
    const prof = [...characterClass.armorProficiencies, ...characterClass.weaponProficiencies];
    if (!prof.includes(equipmentType.id)) {
      return {
        ok: false,
        code: ErrorCode.CLASS_RESTRICTED,
        message: `Your class cannot use ${equipmentType.name}`,
      };
    }
  }
  const isTwoHanded = (TWO_HANDED_SLOT_TYPES as readonly string[]).includes(eq.slotType);
  if (slot.id === 'main_hand' && isTwoHanded && args.offHandOccupied) {
    return {
      ok: false,
      code: ErrorCode.SLOT_OCCUPIED,
      message: 'Unequip your off hand to wield a two-handed weapon',
    };
  }
  if (
    slot.id === 'off_hand' &&
    args.mainHandSlotType &&
    (TWO_HANDED_SLOT_TYPES as readonly string[]).includes(args.mainHandSlotType)
  ) {
    return { ok: false, code: ErrorCode.SLOT_OCCUPIED, message: 'Two-handed weapon equipped' };
  }
  return { ok: true };
}
