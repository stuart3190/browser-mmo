import { afterAll } from 'vitest';
import { loadDotEnv } from '@mmo/config';
import { createDb } from '@mmo/db';
import { getGameData, seededRng } from '@mmo/game-data';
import { uuidv7 } from '@mmo/shared';
import { DomainError } from '@mmo/shared';
import {
  DevAuthProvider,
  createCharacter,
  createDomainContext,
  getCharacterItems,
} from '../src/index';
import type { DomainContext } from '../src/index';

loadDotEnv();

export function setupContext(): DomainContext {
  const handle = createDb({ url: process.env.TEST_DATABASE_URL!, max: 10 });
  afterAll(() => handle.close());
  return createDomainContext({ db: handle.db, gameData: getGameData(), rng: seededRng(1234) });
}

let counter = 0;
/** Unique, schema-valid character name (letters only). */
function uniqueName(prefix: string): string {
  counter++;
  const letters = (Date.now().toString(36) + counter.toString(36)).replace(
    /[0-9]/g,
    (d) => 'abcdefghij'[Number(d)]!,
  );
  return (prefix + letters).slice(0, 20);
}

export interface TestPlayer {
  accountId: string;
  characterId: string;
}

export async function makePlayer(
  ctx: DomainContext,
  classId = 'class.warrior',
): Promise<TestPlayer> {
  const username = `u_${uuidv7().replace(/-/g, '').slice(-16)}`;
  const { accountId } = await new DevAuthProvider(new Set()).authenticate(ctx, { username });
  const c = await createCharacter(ctx, { accountId, name: uniqueName('Test'), classId });
  return { accountId, characterId: c.id };
}

export async function addCharacter(
  ctx: DomainContext,
  accountId: string,
  classId = 'class.warrior',
): Promise<string> {
  return (await createCharacter(ctx, { accountId, name: uniqueName('Alt'), classId })).id;
}

export async function containerId(
  ctx: DomainContext,
  p: TestPlayer,
  kind: string,
): Promise<string> {
  const items = await getCharacterItems(ctx.db, ctx, p.accountId, p.characterId);
  const c = items.containers.find((x) => x.container.kind === kind);
  if (!c) throw new Error(`no ${kind}`);
  return c.container.id;
}

/** Asserts a promise rejects with a DomainError carrying `code`. */
export async function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
  try {
    await promise;
  } catch (err) {
    if (err instanceof DomainError && err.code === code) return;
    throw new Error(
      `Expected DomainError ${code}, got: ${err instanceof Error ? `${err.name} ${(err as DomainError).code ?? ''} ${err.message}` : String(err)}`,
      { cause: err },
    );
  }
  throw new Error(`Expected DomainError ${code}, but the operation succeeded`);
}
