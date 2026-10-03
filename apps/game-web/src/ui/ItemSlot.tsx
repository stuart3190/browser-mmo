import type { Item } from '@mmo/schemas';
import { iconInitials, rarityColor } from '@mmo/ui';
import { useGame } from './context';
import { hoverTooltip } from './hover';

/**
 * One slot: icon placeholder (initials on a category colour), rarity border, stack count,
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
      <span className="slot-icon">{iconInitials(item)}</span>
      {item.instance.quantity > 1 && <span className="slot-qty">{item.instance.quantity}</span>}
      {equipped && (
        <span className="slot-equipped" title="Equipped">
          E
        </span>
      )}
      {state.pending.has(item.instance.id) && <span className="slot-pending" />}
    </button>
  );
}
