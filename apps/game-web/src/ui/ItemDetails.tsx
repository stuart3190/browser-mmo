import { canPlaceInContainerKind } from '@mmo/game-data';
import { useGame } from './context';
import { ItemTooltip } from './ItemTooltip';

/**
 * Selected-item sheet: the tooltip plus every action valid for where the item is. This is the
 * touch-friendly path (no hover needed); on desktop it is also opened by clicking a slot.
 * Buttons are hints only — the server re-validates everything.
 */
export function ItemDetails() {
  const { state, actions, quests } = useGame();
  const item = state.selectedItemId ? state.items.get(state.selectedItemId) : undefined;
  if (!item) return null;
  const loc = item.instance.location;
  const busy = state.pending.has(item.instance.id);
  const inBag =
    loc.kind === 'container' &&
    (loc.containerKind === 'backpack' || loc.containerKind === 'material_pouch');
  const inVault =
    loc.kind === 'container' &&
    (loc.containerKind === 'character_vault' || loc.containerKind === 'account_vault');
  const inMailbox = loc.kind === 'container' && loc.containerKind === 'mailbox';
  const bankOpen = state.open.has('bank');
  const canShare = canPlaceInContainerKind(
    item.template,
    item.instance.binding,
    'account_vault',
  ).ok;
  const canVault = canPlaceInContainerKind(
    item.template,
    item.instance.binding,
    'character_vault',
  ).ok;
  const close = () => state.update((s) => (s.selectedItemId = null));

  return (
    <aside className="details" data-testid="item-details" aria-label="Item details">
      <ItemTooltip item={item} />
      {inBag && item.template.id === 'consumable.greenvale.remedy' && (
        <button
          data-testid="use-remedy"
          disabled={
            state.vitals?.dead || !state.vitals || state.vitals.health >= state.vitals.maxHealth
          }
          onClick={() => quests.useItem(item.instance.id)}
        >
          Drink remedy · +60 health
        </button>
      )}
      <div className="details-actions">
        {inMailbox && (
          <button disabled={busy} onClick={() => void actions.withdraw(item)} data-action="take">
            Take
          </button>
        )}
        {item.template.equipment && loc.kind !== 'equipped' && !inMailbox && (
          <button disabled={busy} onClick={() => void actions.equip(item)} data-action="equip">
            Equip
          </button>
        )}
        {loc.kind === 'equipped' && (
          <button disabled={busy} onClick={() => void actions.unequip(item)} data-action="unequip">
            Unequip
          </button>
        )}
        {(inBag || loc.kind === 'equipped') && bankOpen && canVault && (
          <button
            disabled={busy}
            onClick={() => void actions.deposit(item, 'character_vault')}
            data-action="deposit"
          >
            To vault
          </button>
        )}
        {(inBag || loc.kind === 'equipped') && bankOpen && canShare && (
          <button
            disabled={busy}
            onClick={() => void actions.deposit(item, 'account_vault')}
            data-action="deposit-shared"
          >
            To shared vault
          </button>
        )}
        {inVault && (
          <button
            disabled={busy}
            onClick={() => void actions.withdraw(item)}
            data-action="withdraw"
          >
            Retrieve
          </button>
        )}
        {inBag && !bankOpen && canVault && (
          <span className="muted small">Open the bank (V) to store items.</span>
        )}
        <button className="secondary" onClick={close} data-action="close">
          Close
        </button>
      </div>
    </aside>
  );
}
