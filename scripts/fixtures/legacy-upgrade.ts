/** Fixed 0005 fixture: current domain code must never write into a historical schema. */
import { deepStrictEqual } from 'node:assert';
import { cp, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { createDb } from '../../packages/db/src/index';
import { runMigrations } from '../../packages/db/src/index';
import { getGameData } from '../../packages/game-data/src/index';

export async function verifyLegacyUpgrade(
  source: ReturnType<typeof createDb>,
  migrations: string,
  out: string,
) {
  const previous = resolve(out, 'previous-migrations');
  await cp(migrations, previous, { recursive: true });
  const journalPath = resolve(previous, 'meta/_journal.json');
  const journal = JSON.parse(await readFile(journalPath, 'utf8')) as {
    entries: { tag: string }[];
  };
  const last = journal.entries.at(-1)!.tag;
  const cutoff = journal.entries.findIndex((e) => e.tag === '0005_ability_cooldowns');
  if (cutoff < 0) throw new Error('Historical migration prefix missing');
  journal.entries = journal.entries.slice(0, cutoff + 1);
  await writeFile(journalPath, JSON.stringify(journal));
  await runMigrations(source.db, previous);
  const ids = Object.fromEntries(
    [
      'accounts',
      'characters',
      'containers',
      'item_instances',
      'item_history',
      'currency_balances',
      'currency_ledger',
    ].map((table) => [table, crypto.randomUUID()]),
  );
  const account = ids.accounts!,
    character = ids.characters!,
    bag = ids.containers!,
    item = ids.item_instances!;
  const template = getGameData().template('weapon.sword.iron_longsword');
  await source.pool.query('INSERT INTO accounts (id,username,display_name) VALUES ($1,$2,$2)', [
    account,
    'legacy_restore',
  ]);
  await source.pool.query(
    "INSERT INTO characters (id,account_id,name,class_id,zone_id,current_health) VALUES ($1,$2,'Legacyrestore','class.warrior','zone.greenvale.meadows',144)",
    [character, account],
  );
  await source.pool.query(
    "INSERT INTO containers (id,kind,owner_account_id,owner_character_id,capacity) VALUES ($1,'backpack',$2,$3,24)",
    [bag, account, character],
  );
  await source.pool.query(
    'INSERT INTO item_templates (id,name,category,rarity_id,max_stack,tradeable,data,content_hash) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
    [
      template.id,
      template.name,
      template.category,
      template.rarityId,
      template.maxStack,
      template.tradeable,
      JSON.stringify(template),
      'legacy-fixture',
    ],
  );
  await source.pool.query(
    "INSERT INTO item_instances (id,template_id,rarity_id,owner_account_id,owner_character_id,original_owner_account_id,original_owner_character_id,acquisition_method,source_ref,location_kind,container_id,slot_index,stats,durability_current,durability_max) VALUES ($1,$2,$3,$4,$5,$4,$5,'system','legacy.restore','container',$6,0,'{\"strength\":4,\"attackPower\":7}',73,80)",
    [item, template.id, template.rarityId, account, character, bag],
  );
  await source.pool.query(
    "INSERT INTO item_history (id,item_instance_id,event_type,to_owner_account_id,quantity) VALUES ($1,$2,'created',$3,1)",
    [ids.item_history, item, account],
  );
  await source.pool.query(
    "INSERT INTO currency_balances (id,currency_id,owner_account_id,owner_character_id,amount) VALUES ($1,'gold',$2,$3,1000)",
    [ids.currency_balances, account, character],
  );
  await source.pool.query(
    "INSERT INTO currency_ledger (id,currency_id,owner_account_id,owner_character_id,delta,balance_after,reason) VALUES ($1,'gold',$2,$3,1000,1000,'legacy_restore_fixture')",
    [ids.currency_ledger, account, character],
  );
  const before = new Map<string, Record<string, unknown>>();
  for (const [table, id] of Object.entries(ids)) {
    const result = await source.pool.query<{ data: Record<string, unknown> }>(
      `SELECT to_jsonb(t) data FROM ${table} t WHERE id=$1`,
      [id],
    );
    before.set(table, result.rows[0]!.data);
  }
  await runMigrations(source.db);
  for (const [table, id] of Object.entries(ids)) {
    const result = await source.pool.query<{ data: Record<string, unknown> }>(
      `SELECT to_jsonb(t) data FROM ${table} t WHERE id=$1`,
      [id],
    );
    const old = before.get(table)!;
    const current = result.rows[0]?.data;
    if (!current) throw new Error(`Upgrade lost ${table} fixture`);
    deepStrictEqual(
      Object.fromEntries(Object.keys(old).map((k) => [k, current[k]])),
      old,
      `Upgrade changed legacy ${table}`,
    );
  }
  const proof = {
    from: '0005_ability_cooldowns',
    to: last,
    preservedTables: Object.keys(ids),
    itemId: item,
  };
  await writeFile(resolve(out, 'upgrade-proof.json'), JSON.stringify(proof, null, 2));
  console.log(JSON.stringify({ populatedMigration: proof }));
}
