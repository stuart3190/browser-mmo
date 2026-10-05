import { useState } from 'react';
import { formatCurrency, type InventorySort } from '@mmo/ui';
import { ContainerGrid } from './ContainerGrid';
import { useGame } from './context';
import { Tabs, Window } from './Window';

export function InventoryWindow() {
  const { state, gameData } = useGame();
  const [tab, setTab] = useState<'backpack' | 'material_pouch' | 'mailbox'>('backpack');
  const [search, setSearch] = useState('');
  const [rarity, setRarity] = useState('');
  const [sort, setSort] = useState<InventorySort>('slots');
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
      <div className="inventory-tools">
        <label>
          Search
          <input
            type="search"
            aria-label="Search inventory"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Item name…"
          />
        </label>
        <label>
          Rarity
          <select
            aria-label="Filter rarity"
            value={rarity}
            onChange={(e) => setRarity(e.target.value)}
          >
            <option value="">All rarities</option>
            {gameData.raw.rarities.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          View order
          <select
            aria-label="Sort inventory"
            value={sort}
            onChange={(e) => setSort(e.target.value as InventorySort)}
          >
            <option value="slots">Bag slots</option>
            <option value="name">Name</option>
            <option value="rarity">Rarity</option>
            <option value="level">Item level</option>
          </select>
        </label>
        {(search || rarity || sort !== 'slots') && (
          <button
            type="button"
            onClick={() => {
              setSearch('');
              setRarity('');
              setSort('slots');
            }}
          >
            Reset view
          </button>
        )}
      </div>
      <ContainerGrid
        kind={tab}
        compact={tab === 'mailbox'}
        view={{ search, rarityIds: rarity ? [rarity] : [], sort }}
      />
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
