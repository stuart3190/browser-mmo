import type { GameData } from '@mmo/game-data';
import type { Item, MoveItemRequest } from '@mmo/schemas';
import { chooseEquipSlot } from '@mmo/ui';
import type { ApiClient } from '../api';
import { ApiError } from '../api';
import type { GameState } from './game-state';

/**
 * Item intents from the UI. Every action is a request to the authoritative HTTP API with the
 * item's current `version`; the response is applied immediately and the realtime change feed
 * confirms it (and informs any other client of the same account). Nothing is changed locally
 * before the server accepts it.
 */
export class ItemActions {
  constructor(
    private readonly api: ApiClient,
    private readonly state: GameState,
    private readonly gameData: GameData,
  ) {}

  equip(item: Item): Promise<void> {
    const slotId = chooseEquipSlot(this.gameData, item, this.state.items.equipped());
    if (!slotId) {
      this.state.toast(`${item.template.name} cannot be equipped`, 'error');
      return Promise.resolve();
    }
    return this.move(item, { kind: 'equipped', slotId }, `Equipped ${item.template.name}`);
  }

  unequip(item: Item): Promise<void> {
    return this.toBag(item, `Unequipped ${item.template.name}`);
  }

  deposit(
    item: Item,
    kind: 'character_vault' | 'account_vault' = 'character_vault',
  ): Promise<void> {
    const vault = this.state.items.container(kind);
    if (!vault) return Promise.resolve();
    return this.move(
      item,
      { kind: 'container', containerId: vault.id },
      `Stored ${item.template.name} in the ${kind === 'account_vault' ? 'shared vault' : 'vault'}`,
    );
  }

  withdraw(item: Item): Promise<void> {
    return this.toBag(item, `Retrieved ${item.template.name}`);
  }

  private toBag(item: Item, message: string): Promise<void> {
    const bag = this.state.items.container(
      item.template.goesToMaterialPouch ? 'material_pouch' : 'backpack',
    );
    if (!bag) return Promise.resolve();
    return this.move(item, { kind: 'container', containerId: bag.id }, message);
  }

  private async move(item: Item, to: MoveItemRequest['to'], message: string): Promise<void> {
    const id = item.instance.id;
    if (this.state.pending.has(id)) return; // UI-level double-submit guard; the server is the real guard
    this.state.update((s) => s.pending.add(id));
    try {
      const { items } = await this.api.moveItem(this.state.character.id, {
        itemInstanceId: id,
        expectedVersion: item.instance.version,
        to,
      });
      this.state.items.apply(items);
      this.state.addLog(message);
    } catch (err) {
      const code = err instanceof ApiError ? err.code : 'INTERNAL';
      this.state.toast(err instanceof Error ? err.message : 'Request failed', 'error');
      this.state.addLog(`${code}: ${err instanceof Error ? err.message : ''}`, 'error');
    } finally {
      this.state.update((s) => s.pending.delete(id));
    }
  }
}
