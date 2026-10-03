/** Tiny shared hover-tooltip controller (mouse only; touch uses the details sheet). */
type Listener = () => void;

class HoverTooltip {
  itemId: string | null = null;
  anchor: DOMRect | null = null;
  private listeners = new Set<Listener>();
  show(itemId: string, el: HTMLElement) {
    this.itemId = itemId;
    this.anchor = el.getBoundingClientRect();
    this.listeners.forEach((l) => l());
  }
  hide() {
    this.itemId = null;
    this.listeners.forEach((l) => l());
  }
  subscribe = (l: Listener) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  get = () => this.itemId;
}

export const hoverTooltip = new HoverTooltip();
