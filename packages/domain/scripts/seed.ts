import { eq } from 'drizzle-orm';
import { loadDotEnv } from '@mmo/config';
import { createDb, schema, syncItemTemplates } from '@mmo/db';
import { getGameData } from '@mmo/game-data';
import {
  DevAuthProvider,
  createCharacter,
  createDomainContext,
  createListing,
  getCharacterItems,
  grantItemInTx,
  inTransaction,
  moveItem,
} from '../src/index';

/**
 * Seeds a development database with realistic demo data. Idempotent: content is upserted every
 * run; demo accounts are only created if missing. Never run against production.
 *
 *   admin  (role admin)      — use for the admin app
 *   alice  / Alice (Warrior) — equipped sword, potions, ore, a vaulted cloak
 *   bob    / Bob   (Mage)    — has an active marketplace listing
 */
loadDotEnv();
if (process.env.NODE_ENV === 'production') throw new Error('Refusing to seed production');
const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const handle = createDb({ url, max: 4, applicationName: 'mmo-seed' });
const gameData = getGameData();
const ctx = createDomainContext({ db: handle.db, gameData });
const auth = new DevAuthProvider(new Set(['admin']));
const system = { accountId: null, characterId: null };

async function ensurePlayer(username: string, characterName: string, classId: string) {
  const { accountId } = await auth.authenticate(ctx, { username });
  const [existing] = await handle.db
    .select()
    .from(schema.characters)
    .where(eq(schema.characters.accountId, accountId));
  if (existing) return { accountId, characterId: existing.id, created: false };
  const c = await createCharacter(ctx, { accountId, name: characterName, classId });
  return { accountId, characterId: c.id, created: true };
}

async function give(
  p: { accountId: string; characterId: string },
  templateId: string,
  quantity = 1,
  rarityId?: string,
) {
  return inTransaction(ctx, (tx) =>
    grantItemInTx(tx, ctx, {
      ...p,
      templateId,
      quantity,
      method: 'seed',
      actor: system,
      ...(rarityId ? { rarityId } : {}),
    }),
  );
}

try {
  const n = await syncItemTemplates(handle.db, gameData);
  console.log(`Synced ${n} item templates.`);

  await ensurePlayer('admin', 'Warden', 'class.cleric');

  const alice = await ensurePlayer('alice', 'Alice', 'class.warrior');
  if (alice.created) {
    const sword = await give(alice, 'weapon.sword.iron_longsword', 1, 'rare');
    await moveItem(ctx, {
      ...alice,
      request: {
        itemInstanceId: sword.created.id,
        expectedVersion: sword.created.version,
        to: { kind: 'equipped', slotId: 'main_hand' },
      },
    });
    await give(alice, 'consumable.potion.minor_healing', 5);
    await give(alice, 'material.ore.copper_ore', 12);
    const cloak = await give(alice, 'accessory.cloak.wayfarer_cloak');
    const items = await getCharacterItems(handle.db, ctx, alice.accountId, alice.characterId);
    const vault = items.containers.find((c) => c.container.kind === 'character_vault')!;
    await moveItem(ctx, {
      ...alice,
      request: {
        itemInstanceId: cloak.created.id,
        expectedVersion: cloak.created.version,
        to: { kind: 'container', containerId: vault.container.id },
      },
    });
    console.log('Created alice / Alice.');
  }

  const bob = await ensurePlayer('bob', 'Bob', 'class.mage');
  if (bob.created) {
    await give(bob, 'weapon.staff.oak_staff');
    const bow = await give(bob, 'weapon.bow.hunting_bow');
    await createListing(ctx, {
      actor: { ...bob },
      itemInstanceId: bow.created.id,
      price: 450,
      durationHours: 48,
    });
    console.log('Created bob / Bob with a marketplace listing.');
  }
  console.log('Seed complete. Dev logins: admin, alice, bob.');
} finally {
  await handle.close();
}
