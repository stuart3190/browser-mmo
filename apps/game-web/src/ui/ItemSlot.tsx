import { conditionRules } from '@mmo/game-data';
import type { Item } from '@mmo/schemas';
import { rarityColor } from '@mmo/ui';
import { useGame } from './context';
import { hoverTooltip } from './hover';
import { ItemGlyph } from './ItemGlyph';

/**
 * One slot: vector item silhouette on a category colour, rarity border, stack count,
 * equipped marker. Tap/click selects (details sheet with actions, works on touch); mouse hover
 * shows a tooltip.
 */
export function ItemSlot({
  item,
  label,
  testId,
}: {
  item: Item | null;
  label?: string;
  testId?: string;
}) {
  const { state, gameData } = useGame();
  if (!item) {
    return (
      <div className="slot empty" data-testid={testId}>
        {label && <span className="slot-label">{label}</span>}
      </div>
    );
  }
  const color = rarityColor(gameData, item.instance.rarityId);
  const equipped = item.instance.location.kind === 'equipped';
  const condition = item.instance.durability;
  const worn = condition && condition.current / condition.max <= conditionRules.warningFraction;
  const selected = state.selectedItemId === item.instance.id;
  return (
    <button
      className={`slot filled cat-${item.template.category}${selected ? ' selected' : ''}`}
      style={{ borderColor: color }}
      data-testid={testId}
      data-item-id={item.instance.id}
      aria-label={`${item.template.name}${item.instance.quantity > 1 ? ` x${item.instance.quantity}` : ''}${equipped ? ' (equipped)' : ''}`}
      onClick={() => state.update((s) => (s.selectedItemId = item.instance.id))}
      onPointerEnter={(e) =>
        e.pointerType === 'mouse' && hoverTooltip.show(item.instance.id, e.currentTarget)
      }
      onPointerLeave={() => hoverTooltip.hide()}
    >
      <span className="slot-icon">
        <ItemGlyph template={item.template} />
      </span>
      {item.instance.quantity > 1 && <span className="slot-qty">{item.instance.quantity}</span>}
      {equipped && (
        <span className="slot-equipped" title="Equipped">
          E
        </span>
      )}
      {worn && (
        <span
          className="slot-worn"
          title={
            condition.current === 0
              ? 'Broken — repair to restore bonuses'
              : 'Low condition — repair soon'
          }
          aria-label={condition.current === 0 ? 'Broken equipment' : 'Low equipment condition'}
        >
          !
        </span>
      )}
      {state.pending.has(item.instance.id) && <span className="slot-pending" />}
    </button>
  );
}
