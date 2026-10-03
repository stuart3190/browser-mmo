import type { Item, StatKey } from '@mmo/schemas';
import {
  STAT_LABELS,
  STAT_ORDER,
  bindingLabel,
  compareItemStats,
  comparisonTarget,
  formatCurrency,
  itemRequirements,
  itemTypeLine,
  rarityColor,
} from '@mmo/ui';
import { itemTotalStats, PRIMARY_CURRENCY_ID } from '@mmo/game-data';
import { useGame } from './context';

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
const signed = (n: number) => (n > 0 ? `+${fmt(n)}` : fmt(n));

/** Full MMO-style tooltip, plus a comparison block against what is currently equipped. */
export function ItemTooltip({ item, compare = true }: { item: Item; compare?: boolean }) {
  const { state, gameData } = useGame();
  const t = item.template;
  const inst = item.instance;
  const rarity = gameData.rarities.get(inst.rarityId);
  const viewer = {
    level: state.character.level,
    cls: gameData.characterClass(state.character.classId),
  };
  const equippedMap = state.items.equipped();
  const loc = inst.location;
  const equippedSlot =
    loc.kind === 'equipped' ? gameData.equipmentSlots.get(loc.slotId)?.name : null;
  const base = new Set(Object.keys(inst.stats));
  const total = itemTotalStats(inst);
  const target = compare && t.equipment ? comparisonTarget(gameData, item, equippedMap) : null;
  const binding = bindingLabel(item);
  const gold = gameData.currencies.get(PRIMARY_CURRENCY_ID);

  return (
    <div className="tooltip" data-testid="item-tooltip">
      <div className="tt-name" style={{ color: rarityColor(gameData, inst.rarityId) }}>
        {t.name}
        {inst.quantity > 1 && <span className="tt-qty"> ×{inst.quantity}</span>}
      </div>
      {equippedSlot && <div className="tt-equipped">Equipped · {equippedSlot}</div>}
      <div className="tt-line" style={{ color: rarity?.color }}>
        {rarity?.name}
      </div>
      {binding && <div className="tt-line">{binding}</div>}
      <div className="tt-row">
        <span>{itemTypeLine(gameData, item)}</span>
        {t.equipment && <span>Item level {t.itemLevel}</span>}
      </div>
      {t.equipment?.weapon && (
        <div className="tt-row">
          <span>
            {t.equipment.weapon.minDamage}–{t.equipment.weapon.maxDamage} damage
          </span>
          <span>Speed {(t.equipment.weapon.attackSpeedMs / 1000).toFixed(1)}</span>
        </div>
      )}
      {STAT_ORDER.filter((k) => total[k] !== undefined).map((k: StatKey) => (
        <div key={k} className={base.has(k) ? 'tt-stat' : 'tt-stat tt-bonus'}>
          {signed(total[k]!)} {STAT_LABELS[k]}
        </div>
      ))}
      {inst.modifiers.length > 0 && (
        <div className="tt-line tt-muted">
          {inst.modifiers
            .map(
              (m) =>
                gameData.raw.itemModifiers.find((d) => d.id === m.modifierId)?.name ?? m.modifierId,
            )
            .join(', ')}
        </div>
      )}
      {inst.sockets.map((s, i) => (
        <div key={i} className="tt-line tt-muted">
          ◇ {s.color} socket{s.gemItemInstanceId ? ' (filled)' : ''}
        </div>
      ))}
      {inst.durability && (
        <div className="tt-line">
          Durability {inst.durability.current} / {inst.durability.max}
        </div>
      )}
      {itemRequirements(gameData, item, viewer).map((r) => (
        <div key={r.text} className={r.met ? 'tt-line' : 'tt-line tt-unmet'}>
          {r.text}
        </div>
      ))}
      {t.description && <div className="tt-desc">“{t.description}”</div>}
      {t.vendorValue > 0 && gold && (
        <div className="tt-line tt-muted">
          Sell value {formatCurrency(gold, t.vendorValue * inst.quantity)}
        </div>
      )}
      {target && (
        <Comparison
          item={item}
          slotName={gameData.equipmentSlots.get(target.slotId)?.name ?? target.slotId}
          current={target.item}
        />
      )}
    </div>
  );
}

function Comparison({
  item,
  current,
  slotName,
}: {
  item: Item;
  current: Item | null;
  slotName: string;
}) {
  const deltas = compareItemStats(item, current);
  return (
    <div className="tt-compare" data-testid="item-comparison">
      <div className="tt-compare-title">
        {current
          ? `Compared with equipped ${current.template.name} (${slotName})`
          : `${slotName} slot is empty`}
      </div>
      {deltas.length === 0 && <div className="tt-muted">No stat change</div>}
      {deltas.map((d) => (
        <div
          key={d.stat}
          className={d.delta > 0 ? 'tt-up' : 'tt-down'}
          data-stat={d.stat}
          data-delta={d.delta}
        >
          {d.delta > 0 ? '▲' : '▼'} {signed(d.delta)} {d.label}
        </div>
      ))}
    </div>
  );
}
