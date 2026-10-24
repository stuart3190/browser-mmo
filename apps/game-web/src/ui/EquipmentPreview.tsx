import type { ItemTemplate, StatKey } from '@mmo/schemas';
import { checkCanEquip } from '@mmo/game-data';
import { STAT_LABELS } from '@mmo/ui';
import { useGame } from './context';

/** Catalog preview, never a claim about a particular rolled instance or a net equipment upgrade. */
export function EquipmentPreview({
  template,
  testPrefix = 'equipment',
}: {
  template: ItemTemplate;
  testPrefix?: string;
}) {
  const { gameData, state } = useGame();
  const gear = template.equipment;
  if (!gear) return null;
  const type = gameData.equipmentTypes.get(gear.equipmentTypeId);
  const slot = gameData.raw.equipmentSlots.find((s) => s.accepts.includes(gear.slotType));
  const fit = slot
    ? checkCanEquip({
        template,
        slot,
        equipmentType: type,
        characterClass: gameData.characterClass(state.character.classId),
        characterLevel: state.character.level,
        mainHandSlotType: null,
        offHandOccupied: false,
      })
    : null;
  const rarity = gameData.rarities.get(template.rarityId);
  const scaled = (n: number) => Math.round(n * (rarity?.statMultiplier ?? 1));
  const range = (min: number, max: number) => (min === max ? `${min}` : `${min}–${max}`);
  const stamina = gear.baseStats.stamina,
    health = gear.baseStats.max_health;
  const healthRange = [0, 1].map((i) => {
    const key = i === 0 ? 'min' : 'max';
    return (
      scaled(health?.[key] ?? 0) +
      scaled(stamina?.[key] ?? 0) * gameData.raw.combatRules.healthPerStamina
    );
  });
  return (
    <div className="equipment-preview">
      <p className="small muted">
        {rarity?.name ?? template.rarityId} · Level {template.requiredLevel} ·{' '}
        {type?.name ?? gear.equipmentTypeId}
        {template.allowedClassIds.length > 0 &&
          ` · ${template.allowedClassIds.map((id) => gameData.characterClass(id).name).join(' / ')}`}
      </p>
      {fit && (
        <p
          className={`small ${fit.ok ? 'muted' : 'error'}`}
          data-testid={`${testPrefix}-equipment-fit`}
        >
          {fit.ok ? 'Your class and level can use this equipment.' : fit.message}
        </p>
      )}
      <p className="small service-preview" data-testid={`${testPrefix}-output`}>
        {gear.weapon &&
          `${gear.weapon.minDamage}–${gear.weapon.maxDamage} weapon damage · ${(gear.weapon.attackSpeedMs / 1000).toFixed(1)}s · `}
        {Object.entries(gear.baseStats)
          .map(
            ([id, r]) =>
              `${STAT_LABELS[id as StatKey] ?? id} +${range(scaled(r.min), scaled(r.max))}`,
          )
          .join(' · ')}
        {gear.maxDurability && ` · ${gear.maxDurability} condition`}
      </p>
      {healthRange[1]! > 0 && (
        <p className="small" data-testid={`${testPrefix}-health`}>
          Base attributes add {range(healthRange[0]!, healthRange[1]!)} maximum health before
          replacing other gear.
        </p>
      )}
      {rarity && rarity.modifierCount.max > 0 && (
        <p className="small muted">
          Bonus attributes roll on creation. Inspect the earned item for its final values.
        </p>
      )}
      <p className="small muted">
        {template.binding === 'on_pickup'
          ? 'Binds to your character when received.'
          : template.binding === 'on_equip'
            ? 'Binds to your character when equipped.'
            : template.binding === 'account'
              ? 'Bound to your account.'
              : template.tradeable
                ? 'Tradeable while unbound.'
                : 'Cannot be traded.'}
      </p>
    </div>
  );
}
