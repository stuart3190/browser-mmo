import { useState } from 'react';
import { ContainerGrid } from './ContainerGrid';
import { Wallet } from './InventoryWindow';
import { Tabs, Window } from './Window';

/**
 * Bank: personal character vault and the account-wide shared vault, with the backpack below so
 * items can be deposited without opening another window. Placeholder rule: the bank can be opened
 * anywhere (no banker NPC proximity check yet).
 */
export function BankWindow() {
  const [tab, setTab] = useState<'character_vault' | 'account_vault'>('character_vault');
  return (
    <Window id="bank" title="Bank">
      <Tabs
        value={tab}
        onChange={setTab}
        options={[
          { id: 'character_vault', label: 'Personal vault' },
          { id: 'account_vault', label: 'Shared vault' },
        ]}
      />
      <ContainerGrid kind={tab} />
      <h3 className="subhead">Backpack</h3>
      <ContainerGrid kind="backpack" />
      <Wallet />
    </Window>
  );
}
