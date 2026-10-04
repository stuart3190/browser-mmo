import { useState } from 'react';
import { formatCurrency } from '@mmo/ui';
import { ContainerGrid } from './ContainerGrid';
import { useGame } from './context';
import { Tabs, Window } from './Window';

export function InventoryWindow() {
  const { state } = useGame();
  const [tab, setTab] = useState<'backpack' | 'material_pouch' | 'mailbox'>('backpack');
  const recovered = state.items.inContainer('mailbox').length;
  return (
    <Window id="inventory" title="Inventory">
      <Tabs
        value={tab}
        onChange={setTab}
        options={[
          { id: 'backpack', label: 'Backpack' },
          { id: 'material_pouch', label: 'Materials' },
          { id: 'mailbox', label: recovered > 0 ? `Recovered (${recovered})` : 'Recovered' },
        ]}
      />
      {tab === 'mailbox' && (
        <p className="muted small">
          Loot that did not fit your bags is kept here safely. Select an item and choose Take.
        </p>
      )}
      <ContainerGrid kind={tab} compact={tab === 'mailbox'} />
      <Wallet />
    </Window>
  );
}

export function Wallet() {
  const { state, gameData } = useGame();
  return (
    <div className="wallet" data-testid="wallet">
      {state.balances.map((b) => {
        const def = gameData.currencies.get(b.currencyId);
        return def ? <span key={b.currencyId}>{formatCurrency(def, b.amount)}</span> : null;
      })}
    </div>
  );
}
