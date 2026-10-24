/** Only provisions disposable password accounts; character creation and all gameplay stay in UI. */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createDb } from '../../packages/db/src/index';
import { createDomainContext, provisionPasswordAccount } from '../../packages/domain/src/index';
import { getGameData } from '../../packages/game-data/src/index';
const url = process.env.DATABASE_URL;
const dir = process.env.PRODUCTION_PROOF_DIR;
assert(
  url && /^\/qualification_prod_/.test(new URL(url).pathname),
  'Disposable qualification_prod_* database required',
);
assert(dir, 'Private proof directory required');
const handle = createDb({ url });
try {
  const ctx = createDomainContext({ db: handle.db, gameData: getGameData() });
  const password = randomBytes(24).toString('hex');
  const stamp = randomBytes(5).toString('hex');
  const users = [`proofa_${stamp}`, `proofb_${stamp}`];
  for (const name of users) await provisionPasswordAccount(ctx, name, password);
  await writeFile(join(dir, 'password'), password + '\n', { mode: 0o600 });
  await writeFile(join(dir, 'users.json'), JSON.stringify(users));
} finally {
  await handle.close();
}
