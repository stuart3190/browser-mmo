import type { CharacterItems, Container, Item } from '@mmo/schemas';

/**
 * Client-side mirror of the server's item state for one character, framework-agnostic.
 *
 * The server is authoritative; this store only reconciles what it is told. Updates can arrive
 * out of order (HTTP response vs. realtime push), so every write is version-checked: an update or
 * removal older than what we hold is ignored. Removals leave a tombstone version so a late stale
 * upsert cannot resurrect an item. A full snapshot replaces everything.
 */
export class ItemStore {
  private items = new Map<string, Item>();
  private tombstones = new Map<string, number>();
  private containers = new Map<string, Container>();
  private readonly listeners = new Set<() => void>();
  /** Incremented on every change; cheap identity for React's useSyncExternalStore. */
  revision = 0;

  replaceAll(snapshot: CharacterItems): void {
    this.items = new Map();
    this.tombstones = new Map();
    this.containers = new Map(snapshot.containers.map((c) => [c.container.id, c.container]));
    for (const c of snapshot.containers) for (const i of c.items) this.items.set(i.instance.id, i);
    for (const i of Object.values(snapshot.equipment.slots)) this.items.set(i.instance.id, i);
    this.emit();
  }

  /** Applies an upsert/removal batch. Returns true if anything changed. */
  apply(upserts: Item[], removed: { id: string; version: number }[] = []): boolean {
    let changed = false;
    for (const item of upserts) {
      const id = item.instance.id;
      const current = this.items.get(id);
      const tomb = this.tombstones.get(id);
      if (current && current.instance.version > item.instance.version) continue;
      if (tomb !== undefined && tomb >= item.instance.version) continue;
      if (current && current.instance.version === item.instance.version) continue;
      this.items.set(id, item);
      this.tombstones.delete(id);
      changed = true;
    }
    for (const r of removed) {
      const current = this.items.get(r.id);
      if (current && current.instance.version > r.version) continue;
      if (current) {
        this.items.delete(r.id);
        changed = true;
      }
      this.tombstones.set(r.id, Math.max(r.version, this.tombstones.get(r.id) ?? -1));
    }
    if (changed) this.emit();
    return changed;
  }

  get(id: string): Item | undefined {
    return this.items.get(id);
  }

  all(): Item[] {
    return [...this.items.values()];
  }

  container(kind: Container['kind']): Container | undefined {
    return [...this.containers.values()].find((c) => c.kind === kind);
  }

  /** Items in a container kind, by slot. */
  inContainer(kind: Container['kind']): Item[] {
    return this.all()
      .filter(
        (i) =>
          i.instance.location.kind === 'container' && i.instance.location.containerKind === kind,
      )
      .sort((a, b) => slotOf(a) - slotOf(b));
  }

  /** slotId -> item for equipped items. */
  equipped(): Map<string, Item> {
    const out = new Map<string, Item>();
    for (const i of this.items.values())
      if (i.instance.location.kind === 'equipped') out.set(i.instance.location.slotId, i);
    return out;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    this.revision++;
    this.listeners.forEach((l) => l());
  }
}

const slotOf = (i: Item) =>
  i.instance.location.kind === 'container' ? i.instance.location.slot : -1;
