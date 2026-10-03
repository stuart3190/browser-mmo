/**
 * Injectable RNG so rolls are deterministic in tests. Production uses Math.random-backed `defaultRng`
 * on the SERVER ONLY — clients never roll anything authoritative.
 */
export interface Rng {
  /** Float in [0, 1). */
  next(): number;
}

export const defaultRng: Rng = { next: () => Math.random() };

/** Mulberry32 — small seeded PRNG for tests and reproducible simulations. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return {
    next() {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}

export function randomInt(rng: Rng, min: number, max: number): number {
  return Math.floor(rng.next() * (max - min + 1)) + min;
}

export function weightedPick<T extends { weight: number }>(
  rng: Rng,
  entries: readonly T[],
): T | undefined {
  const total = entries.reduce((s, e) => s + e.weight, 0);
  if (total <= 0) return undefined;
  let roll = rng.next() * total;
  for (const entry of entries) {
    roll -= entry.weight;
    if (roll < 0) return entry;
  }
  return entries[entries.length - 1];
}
