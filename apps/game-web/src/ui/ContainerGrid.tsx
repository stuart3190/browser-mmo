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
}: {
  kind: Container['kind'];
  compact?: boolean;
}) {
  const { state } = useGame();
  const container = state.items.container(kind);
  if (!container) return <p className="muted">Not available.</p>;
  const bySlot = new Map(
    state.items
      .inContainer(kind)
      .map((i) => [i.instance.location.kind === 'container' ? i.instance.location.slot : -1, i]),
  );
  const used = bySlot.size;
  return (
    <>
      <div className="grid" data-container={kind}>
        {compact
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
        {compact && used === 0 && <p className="muted small">Nothing here.</p>}
      </div>
      <div className="grid-footer muted">
        {used} / {container.capacity} slots used
      </div>
    </>
  );
}
