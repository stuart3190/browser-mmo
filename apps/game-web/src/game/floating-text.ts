/**
 * Floating combat text (damage numbers, "Miss") drawn as short-lived DOM elements above the 3D
 * view. Purely cosmetic: values come from server combat events.
 */
export class FloatingText {
  private readonly layer: HTMLDivElement;

  constructor() {
    this.layer = document.createElement('div');
    this.layer.className = 'float-layer';
    document.body.appendChild(this.layer);
  }

  spawn(
    at: { x: number; y: number },
    text: string,
    kind: 'dealt' | 'taken' | 'crit' | 'miss' | 'xp',
  ): void {
    if (this.layer.childElementCount > 40) this.layer.firstElementChild?.remove();
    const el = document.createElement('div');
    el.className = `float-text ${kind}`;
    el.textContent = text;
    el.style.left = `${Math.round(at.x + (Math.random() * 24 - 12))}px`;
    el.style.top = `${Math.round(at.y - 30)}px`;
    el.addEventListener('animationend', () => el.remove());
    this.layer.appendChild(el);
  }
}
