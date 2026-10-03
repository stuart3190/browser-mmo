import { useState } from 'react';
import { formatCurrency } from '@mmo/ui';
import { ContainerGrid } from './ContainerGrid';
import { useGame } from './context';
import { Tabs, Window } from './Window';

export function InventoryWindow() {
  const [tab, setTab] = useState<'backpack' | 'material_pouch'>('backpack');
  return (
    <Window id="inventory" title="Inventory">
      <Tabs
        value={tab}
        onChange={setTab}
        options={[
          { id: 'backpack', label: 'Backpack' },
          { id: 'material_pouch', label: 'Materials' },
        ]}
      />
      <ContainerGrid kind={tab} />
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
