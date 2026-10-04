/** Bounded keyed token buckets. Unknown keys fail closed while the table is full. */
export class RateLimit {
  private readonly entries = new Map<string, { tokens: number; at: number }>();
  constructor(
    private readonly capacity: number,
    private readonly perSecond: number,
    private readonly maxKeys = 4096,
  ) {}
  take(key: string, now = Date.now()): boolean {
    let entry = this.entries.get(key);
    if (!entry) {
      if (this.entries.size >= this.maxKeys) {
        for (const [id, value] of this.entries) {
          if (now - value.at >= (this.capacity / this.perSecond) * 1000) this.entries.delete(id);
        }
        if (this.entries.size >= this.maxKeys) return false;
      }
      entry = { tokens: this.capacity, at: now };
      this.entries.set(key, entry);
    }
    entry.tokens = Math.min(
      this.capacity,
      entry.tokens + (Math.max(0, now - entry.at) / 1000) * this.perSecond,
    );
    entry.at = Math.max(now, entry.at);
    if (entry.tokens < 1) return false;
    entry.tokens--;
    return true;
  }
}
