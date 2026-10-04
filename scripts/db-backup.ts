/** Usage: DATABASE_URL=... pnpm exec tsx scripts/db-backup.ts backup|restore FILE
 * Restore requires an EMPTY database named mmo_restore_*. No destructive drop/clean option.
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, writeFile, chmod, open } from 'node:fs/promises';
import { createDb } from '../packages/db/src/client';

const [mode, file] = process.argv.slice(2);
const url = process.env.DATABASE_URL;
if (!url || !file || !['backup', 'restore'].includes(mode ?? ''))
  throw new Error('Set DATABASE_URL; usage: backup|restore FILE');
const parsed = new URL(url);
const env = {
  ...process.env,
  PGHOST: parsed.hostname,
  PGPORT: parsed.port || '5432',
  PGUSER: decodeURIComponent(parsed.username),
  PGPASSWORD: decodeURIComponent(parsed.password),
  PGDATABASE: decodeURIComponent(parsed.pathname.slice(1)),
  PGSSLMODE: parsed.searchParams.get('sslmode') ?? 'prefer',
};
const run = (name: string, args: string[]) =>
  new Promise<void>((resolve, reject) => {
    const child = spawn(name, args, { env, stdio: ['ignore', 'inherit', 'inherit'] });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`${name} failed (${code})`)),
    );
  });
async function digest() {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file!)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}
const handle = createDb({ url, max: 2 });
const client = await handle.pool.connect();
async function inventory() {
  const tables = await client.query<{ schemaname: string; tablename: string }>(
    "select schemaname,tablename from pg_tables where schemaname in ('public','drizzle') order by 1,2",
  );
  const counts: Record<string, number> = {};
  for (const t of tables.rows) {
    const ident = (v: string) => '"' + v.replaceAll('"', '""') + '"';
    const result = await client.query<{ n: string }>(
      `select count(*) n from ${ident(t.schemaname)}.${ident(t.tablename)}`,
    );
    counts[`${t.schemaname}.${t.tablename}`] = Number(result.rows[0]!.n);
  }
  return counts;
}
async function integrity() {
  const checks = {
    unvalidatedConstraints:
      "select count(*) n from pg_constraint where connamespace='public'::regnamespace and not convalidated",
    walletLedgerMismatch: `select count(*) n from currency_balances b where b.amount <> coalesce((select sum(l.delta) from currency_ledger l where l.currency_id=b.currency_id and l.owner_account_id=b.owner_account_id and l.owner_character_id is not distinct from b.owner_character_id),0)`,
    escrowMismatch: `select count(*) n from marketplace_listings l join item_instances i on i.id=l.item_instance_id where l.status='active' and (i.location_kind<>'marketplace_escrow' or i.listing_id is distinct from l.id)`,
    orphanEscrow: `select count(*) n from item_instances i left join marketplace_listings l on l.id=i.listing_id where i.location_kind='marketplace_escrow' and (l.id is null or l.status<>'active' or l.item_instance_id<>i.id)`,
    negativeWallets: 'select count(*) n from currency_balances where amount<0',
  };
  for (const [name, sql] of Object.entries(checks)) {
    const result = await client.query<{ n: string }>(sql);
    if (Number(result.rows[0]!.n)) throw new Error(`Integrity check failed: ${name}`);
  }
}
try {
  if (mode === 'backup') {
    process.umask(0o077);
    await client.query('begin isolation level repeatable read read only');
    const snapshot = await client.query<{ id: string }>('select pg_export_snapshot() id');
    await integrity();
    const counts = await inventory();
    const reserved = await open(file, 'wx', 0o600);
    await reserved.close();
    await run('pg_dump', [
      '--format=custom',
      '--no-owner',
      '--no-acl',
      `--snapshot=${snapshot.rows[0]!.id}`,
      '--file',
      file,
    ]);
    await client.query('commit');
    await chmod(file, 0o600);
    await writeFile(
      `${file}.json`,
      JSON.stringify(
        { version: 1, sha256: await digest(), counts, at: new Date().toISOString() },
        null,
        2,
      ),
      { mode: 0o600 },
    );
    console.log(JSON.stringify({ result: 'backup_verified', counts }));
  } else {
    if (!/^mmo_restore_[a-z0-9_]+$/.test(env.PGDATABASE))
      throw new Error('Restore target must be an empty mmo_restore_* disposable database');
    if (Object.keys(await inventory()).length) throw new Error('Restore target is not empty');
    const manifest = JSON.parse(await readFile(`${file}.json`, 'utf8')) as {
      version: number;
      sha256: string;
      counts: Record<string, number>;
    };
    if (manifest.version !== 1 || manifest.sha256 !== (await digest()))
      throw new Error('Backup checksum/version mismatch');
    await run('pg_restore', [
      '--exit-on-error',
      '--single-transaction',
      '--no-owner',
      '--no-acl',
      '--dbname',
      env.PGDATABASE,
      file,
    ]);
    const counts = await inventory();
    if (JSON.stringify(counts) !== JSON.stringify(manifest.counts))
      throw new Error('Restored row counts differ');
    await integrity();
    // Old bearer tokens must never become valid again after disaster recovery.
    await client.query('update sessions set revoked_at=now() where revoked_at is null');
    console.log(
      JSON.stringify({
        result: 'restore_verified',
        counts,
        checks: ['constraints', 'ledger', 'escrow', 'balances', 'session_revocation'],
      }),
    );
  }
} finally {
  await client.query('rollback').catch(() => undefined);
  client.release();
  await handle.close();
}
