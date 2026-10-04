/** Destructive qualification of an explicitly selected disposable production deployment. */
/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFile, writeFile, open } from 'node:fs/promises';
import { WebSocket } from 'ws';
import { createDb } from '../../packages/db/src/index';
import {
  createDomainContext,
  provisionPasswordAccount,
  createCharacter,
} from '../../packages/domain/src/index';
import { getGameData } from '../../packages/game-data/src/index';
const url = process.env.TEST_DATABASE_URL;
assert(url && /^\/mmo_load_/.test(new URL(url).pathname) && process.env.DATABASE_URL === url);
assert.equal(process.env.NODE_ENV, 'production');
const dir = process.env.QUAL_DIR ?? '/tmp/mmo-production-qualification';
const pids = JSON.parse(await readFile(`${dir}/pids.json`, 'utf8'));
const originalPid = pids.realtime;
assert(
  (await readFile(`/proc/${pids.realtime}/cmdline`, 'utf8')).includes(
    'services/realtime/dist/main.js',
  ),
);
const h = createDb({ url });
const ctx = createDomainContext({ db: h.db, gameData: getGameData() });
const api = process.env.QUAL_URL ?? 'https://127.0.0.1:4443';
const pause = (n: number) => new Promise((r) => setTimeout(r, n));
async function until(fn: () => any, ms = 12000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const x = await fn();
    if (x) return x;
    await pause(30);
  }
  throw Error('qualification timed out');
}
const children: ReturnType<typeof spawn>[] = [];
const sockets: WebSocket[] = [];
let survivor: ReturnType<typeof spawn> | undefined;
async function boot(label: string) {
  const log = await open(`${dir}/${label}.log`, 'a', 0o600);
  const c = spawn(process.execPath, ['services/realtime/dist/main.js'], {
    env: process.env,
    stdio: ['ignore', log.fd, log.fd],
    detached: true,
  });
  c.unref();
  children.push(c);
  await log.close();
  return c;
}
async function login(username: string, password: string) {
  const r = await fetch(api + '/v1/auth/password-login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password, client: 'game_web' }),
  });
  assert.equal(r.status, 200);
  return ((await r.json()) as any).token;
}
async function join(token: string, id: string) {
  const ws = new WebSocket(api.replace('https:', 'wss:') + '/ws', { origin: api });
  sockets.push(ws);
  const messages: any[] = [];
  ws.on('message', (b) => messages.push(JSON.parse(b.toString())));
  await new Promise<void>((r, j) => {
    ws.once('open', r);
    ws.once('error', j);
  });
  let seq = 0;
  const send = (t: string, d: any) => ws.send(JSON.stringify({ v: 1, t, seq: ++seq, d }));
  send('auth.hello', { token, characterId: id, client: 'game_web' });
  await until(() => messages.find((m) => m.t === 'zone.snapshot'));
  return { ws, messages, send };
}
try {
  const duplicate = await boot('duplicate-owner');
  await until(() => duplicate.exitCode !== null);
  assert.notEqual(duplicate.exitCode, 0);
  assert.match(await readFile(`${dir}/duplicate-owner.log`, 'utf8'), /Zone already owned/);
  const username = `fault_${Date.now()}`,
    password = randomBytes(24).toString('hex');
  const accountId = await provisionPasswordAccount(ctx, username, password);
  const char = await createCharacter(ctx, {
    accountId,
    name:
      'Fault' +
      Date.now()
        .toString()
        .replace(/\d/g, (d) => 'abcdefghij'[Number(d)]!),
    classId: 'class.warrior',
  });
  const cd = Date.now() + 120000;
  await h.pool.query('update characters set current_health=72,ability_cooldowns=$1 where id=$2', [
    JSON.stringify({ 'ability.warrior.heavy_strike': cd }),
    char.id,
  ]);
  const token = await login(username, password);
  const c = await join(token, char.id);
  c.send('move.input', { position: { x: 0.2, y: 0, z: -8 }, rotationY: 0 });
  c.send('ping', { clientTime: Date.now() });
  await until(() => c.messages.find((m) => m.t === 'pong'));
  process.kill(pids.realtime, 'SIGSTOP');
  await pause(200);
  const held = await boot('paused-duplicate');
  await until(() => held.exitCode !== null);
  assert.notEqual(held.exitCode, 0);
  assert.match(await readFile(`${dir}/paused-duplicate.log`, 'utf8'), /Zone already owned/);
  const saved = (
    await h.pool.query(
      'select pos_x,pos_y,pos_z,current_health,ability_cooldowns from characters where id=$1',
      [char.id],
    )
  ).rows[0];
  const savedAt = Date.now();
  process.kill(pids.realtime, 'SIGKILL');
  await until(
    async () =>
      !(
        await h.pool.query(
          "select 1 from pg_locks where locktype='advisory' and classid=717723 and database=(select oid from pg_database where datname=current_database()) and granted",
        )
      ).rowCount,
  );
  const candidates = await Promise.all([
    boot('takeover-a'),
    boot('takeover-b'),
    boot('takeover-c'),
  ]);
  await until(() => candidates.filter((c) => c.exitCode !== null).length === 2);
  survivor = candidates.find((c) => c.exitCode === null)!;
  assert(survivor?.pid);
  pids.realtime = survivor.pid;
  await writeFile(`${dir}/pids.json`, JSON.stringify(pids));
  await until(async () => {
    try {
      return (await fetch('http://127.0.0.1:4401/health/ready')).ok;
    } catch {
      return false;
    }
  });
  const recovered = await join(token, char.id);
  const own = recovered.messages.find((m) => m.t === 'auth.ok').d.entityId;
  const entity = recovered.messages
    .find((m) => m.t === 'zone.snapshot')
    .d.entities.find((e: any) => e.id === own);
  assert.deepEqual(entity.position, { x: saved.pos_x, y: saved.pos_y, z: saved.pos_z });
  const row = (
    await h.pool.query('select current_health,ability_cooldowns from characters where id=$1', [
      char.id,
    ])
  ).rows[0];
  assert.equal(row.ability_cooldowns['ability.warrior.heavy_strike'], cd);
  // Safe-zone regeneration resumes after recovery. Bound it by the real rule and elapsed
  // time; a reset to full health still fails. Offline downtime need not be simulated.
  const regenBound =
    Math.ceil(
      (entity.maxHealth *
        getGameData().raw.combatRules.regenFractionPerSecond *
        (Date.now() - savedAt)) /
        1000,
    ) + 1;
  assert(
    row.current_health >= saved.current_health &&
      row.current_health <= saved.current_health + regenBound,
  );
  assert(row.current_health < entity.maxHealth);
  // Production ban, expiry, and controller replacement use actual sockets/sessions.
  const replacement = await join(token, char.id);
  await until(() => recovered.ws.readyState === WebSocket.CLOSED);
  await h.pool.query('update sessions set expires_at=now() where account_id=$1', [accountId]);
  await until(() => replacement.ws.readyState === WebSocket.CLOSED, 6000);
  await pause(2200);
  const fresh = await login(username, password);
  const banned = await join(fresh, char.id);
  await h.pool.query("update accounts set status='banned' where id=$1", [accountId]);
  await until(() => banned.ws.readyState === WebSocket.CLOSED, 6000);
  const proof = {
    at: new Date().toISOString(),
    production: true,
    duplicateOwnerRefused: true,
    pausedOwnerRetainsLock: true,
    SIGKILL: true,
    concurrentTakeovers: 3,
    winners: 1,
    recoveredPositionMatches: true,
    recoveredHealthWithinNormalRegen: true,
    cooldownDeadlinePreserved: true,
    singleController: true,
    expiryDisconnect: true,
    banDisconnect: true,
    savedHealth: saved.current_health,
    recoveredHealth: row.current_health,
    regenBound,
  };
  console.log(JSON.stringify(proof, null, 2));
  await writeFile(`${dir}/deployment-faults.json`, JSON.stringify(proof, null, 2));
} finally {
  try {
    process.kill(originalPid, 'SIGCONT');
  } catch {
    /* old host has exited */
  }
  for (const s of sockets) s.terminate();
  for (const c of children) if (c !== survivor && c.exitCode === null) c.kill('SIGKILL');
  await h.close();
}
