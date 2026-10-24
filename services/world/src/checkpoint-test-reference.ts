import type { ZoneSimulation } from './zone-simulation';

/** Original version-2 encoder, retained only for compatibility tests and relative benchmarks. */
export function legacyCheckpoint(sim: ZoneSimulation): string {
  const state = sim as unknown as Record<string, unknown>;
  return JSON.stringify(
    {
      version: 2,
      parties: sim.parties.checkpoint(),
      ...Object.fromEntries(
        [
          'appliedEffects',
          'tickCount',
          'nextEntity',
          'entities',
          'players',
          'pickups',
          'respawnQueue',
          'npcSpawns',
          'enemies',
          'kills',
          'groups',
        ].map((key) => [key, state[key]]),
      ),
    },
    (_key, value: unknown) => {
      if (value instanceof Map) return { $map: [...value] };
      if (value instanceof Set) return { $set: [...value] };
      if (value === Infinity) return { $infinity: true };
      return value;
    },
  );
}
