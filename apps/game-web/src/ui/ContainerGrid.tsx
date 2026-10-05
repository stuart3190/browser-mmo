import { inventoryView, type InventorySort } from '@mmo/ui';
import type { Container } from '@mmo/schemas';
import { useGame } from './context';
import { ItemSlot } from './ItemSlot';

/**
 * Fixed-capacity slot grid for any container kind (bags and vaults share this). `compact` shows
 * only occupied slots (large system containers such as the mailbox).
 */
export function ContainerGrid({
  kind,
  compact = false,
  view,
}: {
  kind: Container['kind'];
  compact?: boolean;
  view?: { search: string; rarityIds: string[]; sort: InventorySort };
}) {
  const { state, gameData } = useGame();
  const container = state.items.container(kind);
  if (!container) return <p className="muted">Not available.</p>;
  const bySlot = new Map(
    state.items
      .inContainer(kind)
      .map((i) => [i.instance.location.kind === 'container' ? i.instance.location.slot : -1, i]),
  );
  const used = bySlot.size;
  const presentation =
    view && (view.search.trim() || view.rarityIds.length || view.sort !== 'slots');
  const visible = view ? inventoryView(gameData, state.items.inContainer(kind), view) : [];
  return (
    <>
      <div className="grid" data-container={kind}>
        {presentation
          ? visible.map((item) => (
              <ItemSlot
                key={item.instance.id}
                item={item}
                testId={`${kind}-item-${item.instance.id}`}
              />
            ))
          : compact
            ? [...bySlot.entries()]
                .sort((a, b) => a[0] - b[0])
                .map(([slot, item]) => (
                  <ItemSlot key={slot} item={item} testId={`${kind}-slot-${slot}`} />
                ))
            : Array.from({ length: container.capacity }, (_, slot) => (
                <ItemSlot
                  key={slot}
                  item={bySlot.get(slot) ?? null}
                  testId={`${kind}-slot-${slot}`}
                />
              ))}
        {presentation && visible.length === 0 && (
          <p className="muted small">No matching items. Clear filters to see your bag.</p>
        )}
        {!presentation && compact && used === 0 && <p className="muted small">Nothing here.</p>}
      </div>
      <div className="grid-footer muted">
        {used} / {container.capacity} slots used
        {presentation ? ` · ${visible.length} shown (view only)` : ''}
      </div>
    </>
  );
}
