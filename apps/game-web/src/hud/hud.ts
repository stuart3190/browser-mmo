import type { GameData } from '@mmo/game-data';
import type { CharacterItems, Item } from '@mmo/schemas';
import { describeLocation, itemLabel, rarityColor } from '@mmo/ui';

/**
 * Plain-DOM HUD overlay. Intentionally minimal; a real UI framework decision is deferred
 * (see docs/gameplay/inventory.md). The HUD only renders server state — it never mutates items.
 */
export class Hud {
  private readonly status = el('div', 'panel hud-status');
  private readonly prompt = el('div', 'panel hud-prompt');
  private readonly inventory = el('div', 'panel hud-inventory');
  private readonly log = el('div', 'panel hud-log');
  private items = new Map<string, Item>();
  private equipped = new Map<string, Item>();

  constructor(
    root: HTMLElement,
    private readonly gameData: GameData,
  ) {
    this.prompt.hidden = true;
    root.append(this.status, this.prompt, this.inventory, this.log);
    this.renderInventory();
  }

  setStatus(html: string): void {
    this.status.innerHTML = html;
  }

  setPrompt(text: string | null): void {
    this.prompt.hidden = text === null;
    if (text !== null && this.prompt.textContent !== text) this.prompt.textContent = text;
  }

  addLog(text: string, isError = false): void {
    const line = el('div', isError ? 'error' : '');
    line.textContent = `${new Date().toLocaleTimeString()} ${text}`;
    this.log.appendChild(line);
    while (this.log.childElementCount > 30) this.log.firstElementChild?.remove();
    this.log.scrollTop = this.log.scrollHeight;
  }

  setInventory(all: CharacterItems): void {
    this.items = new Map(all.containers.flatMap((c) => c.items).map((i) => [i.instance.id, i]));
    this.equipped = new Map(Object.values(all.equipment.slots).map((i) => [i.instance.id, i]));
    this.renderInventory();
  }

  /** Upserts changed items from an inventory.updated push. */
  applyUpdate(items: Item[]): void {
    for (const i of items) {
      this.items.delete(i.instance.id);
      this.equipped.delete(i.instance.id);
      if (i.instance.location.kind === 'container') this.items.set(i.instance.id, i);
      else if (i.instance.location.kind === 'equipped') this.equipped.set(i.instance.id, i);
    }
    this.renderInventory();
  }

  private renderInventory(): void {
    const groups = new Map<string, Item[]>();
    for (const i of this.items.values()) {
      const loc = i.instance.location;
      const key = loc.kind === 'container' ? loc.containerKind : loc.kind;
      groups.set(key, [...(groups.get(key) ?? []), i]);
    }
    const parts: string[] = ['<strong>Inventory</strong>'];
    if (this.equipped.size)
      parts.push(section('Equipped', [...this.equipped.values()], this.gameData));
    for (const kind of ['backpack', 'material_pouch', 'character_vault', 'account_vault']) {
      const list = groups.get(kind) ?? [];
      if (list.length) parts.push(section(kind.replace('_', ' '), list, this.gameData));
    }
    if (this.items.size === 0 && this.equipped.size === 0)
      parts.push('<div style="color:#888">Empty. Press E near a glowing box.</div>');
    this.inventory.innerHTML = parts.join('');
  }
}

function section(title: string, items: Item[], gd: GameData): string {
  const rows = items
    .sort((a, b) => slotOf(a) - slotOf(b))
    .map(
      (i) =>
        `<div title="${escapeHtml(i.instance.id)} — ${escapeHtml(describeLocation(i.instance.location))}" style="color:${rarityColor(gd, i.instance.rarityId)}">${escapeHtml(itemLabel(i))}</div>`,
    )
    .join('');
  return `<h3>${escapeHtml(title)}</h3>${rows}`;
}

const slotOf = (i: Item) =>
  i.instance.location.kind === 'container' ? i.instance.location.slot : 0;

function el(tag: string, className: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = className;
  return e;
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}
