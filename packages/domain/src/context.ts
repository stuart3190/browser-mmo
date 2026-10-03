import type { Database } from '@mmo/db';
import type { GameData, Rng } from '@mmo/game-data';
import { defaultRng } from '@mmo/game-data';

/**
 * Everything a domain operation needs. Created once per process and passed explicitly — no
 * hidden globals, so tests can inject a seeded RNG and a fixed clock.
 */
export interface DomainContext {
  db: Database;
  gameData: GameData;
  rng: Rng;
  now: () => Date;
}

export function createDomainContext(args: {
  db: Database;
  gameData: GameData;
  rng?: Rng;
  now?: () => Date;
}): DomainContext {
  return {
    db: args.db,
    gameData: args.gameData,
    rng: args.rng ?? defaultRng,
    now: args.now ?? (() => new Date()),
  };
}

/** Who is performing an action. Recorded in history/audit rows. */
export interface Actor {
  accountId: string | null;
  characterId: string | null;
  /** Correlates log lines across services for one client request. */
  requestId?: string;
}

export const SYSTEM_ACTOR: Actor = { accountId: null, characterId: null };
