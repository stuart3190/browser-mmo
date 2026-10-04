import { fork, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { createDb } from '@mmo/db';
import {
  createCharacter,
  createDomainContext,
  DevAuthProvider,
  SessionService,
  adminGrantItem,
  moveItem,
} from '@mmo/domain';
import { arenaGameData, ARENA } from '@mmo/world/testing';
import { encodeClientMessage, parseServerMessage, type ServerMessage } from '@mmo/networking';
const handle = createDb({ url: process.env.TEST_DATABASE_URL! });
const ctx = createDomainContext({ db: handle.db, gameData: arenaGameData() });
const children: ChildProcess[] = [];
const sockets: WebSocket[] = [];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until<T>(fn: () => T | Promise<T>, timeout = 15000): Promise<NonNullable<T>> {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v;
    await sleep(20);
  }
  throw new Error('qualification deadline exceeded');
}
type Notice = {
  kind: string;
  port?: number;
  error?: string;
  state?: {
    position: { x: number; y: number; z: number };
    health: number;
    abilityCooldowns: Record<string, number>;
  };
  enemies?: string[];
  tick?: number;
};
async function boot(phase = '') {
  const child = fork(
    fileURLToPath(new URL('../../../scripts/qualification/process-host.ts', import.meta.url)),
    [],
    {
      execArgv: ['--import', 'tsx'],
      env: { ...process.env, NODE_ENV: 'test', KILL_PHASE: phase },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    },
  );
  children.push(child);
  const notices: Notice[] = [];
  let stderr = '';
  child.stderr!.on('data', (b) => (stderr += String(b)));
  child.on('message', (m) => notices.push(m as Notice));
  const notice = await until(
    () =>
      notices.find((n) => n.kind === 'ready' || n.kind === 'refused') ??
      (child.exitCode !== null
        ? (() => {
            throw new Error(stderr);
          })()
        : undefined),
  );
  return { child, notices, ...notice };
}
async function kill(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const gone = new Promise<void>((r) => child.once('exit', () => r()));
  child.kill('SIGCONT');
  child.kill('SIGKILL');
  await gone;
}
async function player(nearWolf = false) {
  const suffix = crypto.randomUUID().replaceAll('-', '');
  const { accountId } = await new DevAuthProvider(new Set()).authenticate(ctx, {
    username: `qp_${suffix.slice(0, 16)}`,
  });
  const c = await createCharacter(ctx, {
    accountId,
    name: 'Proof' + suffix.replace(/[^a-f]/g, '').slice(0, 12),
    classId: 'class.warrior',
  });
  const cd = Date.now() + 120000;
  await handle.pool.query(
    'update characters set zone_id=$1,pos_x=$2,pos_z=$3,current_health=72,ability_cooldowns=$4 where id=$5',
    [
      ARENA,
      nearWolf ? 2 : 0,
      nearWolf ? 11.5 : -8,
      JSON.stringify({ 'ability.warrior.heavy_strike': cd }),
      c.id,
    ],
  );
  const { token } = await new SessionService(1).create(ctx, accountId, 'game_web');
  return { id: c.id, token, cd };
}
async function join(host: Awaited<ReturnType<typeof boot>>, p: Awaited<ReturnType<typeof player>>) {
  const ws = new WebSocket(`ws://127.0.0.1:${host.port}/ws`, { origin: 'http://localhost:5173' });
  sockets.push(ws);
  const messages: ServerMessage[] = [];
  ws.on('message', (raw) => {
    const m = parseServerMessage(raw.toString());
    if (m.ok) messages.push(m.message);
  });
  await new Promise<void>((r, j) => {
    ws.once('open', r);
    ws.once('error', j);
  });
  let seq = 0;
  const send = (t: Parameters<typeof encodeClientMessage>[0], d: unknown) =>
    ws.send(encodeClientMessage(t, ++seq, d as never));
  send('auth.hello', { token: p.token, characterId: p.id, client: 'game_web' });
  await until(() => messages.find((m) => m.t === 'zone.snapshot'));
  return { ws, messages, send };
}
async function state(host: Awaited<ReturnType<typeof boot>>, id: string) {
  host.notices.splice(0);
  host.child.send({ kind: 'state', id });
  return until(() => host.notices.find((m) => m.kind === 'state'));
}
afterEach(async () => {
  for (const s of sockets.splice(0)) s.terminate();
  await Promise.all(children.splice(0).map(kill));
  await handle.pool.query('delete from zone_checkpoints');
});
afterAll(() => handle.close());
it(
  'SIGKILL preserves acknowledged movement, health and cooldown through rapid concurrent takeover',
  { timeout: 60000 },
  async () => {
    const owner = await boot();
    const p = await player();
    const c = await join(owner, p);
    c.send('move.input', { position: { x: 0.5, y: 0, z: -8 }, rotationY: 0.9 });
    c.send('ping', { clientTime: 123 });
    await until(() => c.messages.find((m) => m.t === 'pong' && m.d.clientTime === 123));
    const before = (await state(owner, p.id)).state!;
    await kill(owner.child);
    const contenders = await Promise.all([boot(), boot(), boot()]);
    expect(contenders.filter((c) => c.kind === 'ready')).toHaveLength(1);
    expect(
      contenders.filter((c) => c.kind === 'refused' && c.error?.includes('already owned')),
    ).toHaveLength(2);
    const next = contenders.find((c) => c.kind === 'ready')!;
    await join(next, p);
    const after = (await state(next, p.id)).state!;
    expect(after.position).toEqual(before.position);
    expect(after.health).toBeGreaterThanOrEqual(before.health);
    expect(after.health).toBeLessThan(80);
    expect(after.abilityCooldowns['ability.warrior.heavy_strike']).toBe(p.cd);
  },
);
it(
  'a paused owner retains its lock; terminated DB session fences it before takeover publication',
  { timeout: 60000 },
  async () => {
    const owner = await boot();
    const p = await player();
    const c = await join(owner, p);
    owner.child.kill('SIGSTOP');
    const duplicate = await boot();
    expect(duplicate.kind).toBe('refused');
    await handle.pool.query(
      "select pg_terminate_backend(pid) from pg_stat_activity where application_name='mmo-zone-owner' and datname=current_database()",
    );
    const next = await boot();
    expect(next.kind).toBe('ready');
    owner.child.kill('SIGCONT');
    await until(() => c.ws.readyState === WebSocket.CLOSED);
    expect((await fetch(`http://127.0.0.1:${owner.port}/health/ready`)).status).toBe(503);
    const tick = (await state(owner, p.id)).tick;
    await sleep(200);
    expect((await state(owner, p.id)).tick).toBe(tick);
    await join(next, p);
  },
);
for (const phase of ['beforeRecord', 'afterRecord', 'afterReward'])
  it(`SIGKILL ${phase} recovers exactly one reward`, { timeout: 60000 }, async () => {
    const owner = await boot(phase);
    const p = await player(true);
    const c = await join(owner, p);
    const s = await state(owner, p.id);
    owner.child.send({ kind: 'weapon', id: p.id });
    await until(() => owner.notices.find((n) => n.kind === 'weapon'));
    c.send('target.set', { entityId: s.enemies![0] });
    c.send('combat.attack', { start: true });
    await until(() => owner.notices.find((n) => n.kind === 'fault'));
    await kill(owner.child);
    const next = await boot();
    await until(async () => {
      const rows = await handle.pool.query('select * from kill_rewards where character_id=$1', [
        p.id,
      ]);
      return rows.rowCount === 1;
    });
    await join(next, p);
    await sleep(500);
    const counts = await handle.pool.query(
      "select (select count(*) from kill_rewards where character_id=$1)::int rewards,(select count(*) from kill_events where character_id=$1 and status='rewarded')::int events,(select xp from characters where id=$1) xp",
      [p.id],
    );
    expect(counts.rows[0]).toMatchObject({ rewards: 1, events: 1, xp: 50 });
    await kill(next.child);
    await boot();
    const again = await handle.pool.query(
      'select count(*)::int n from kill_rewards where character_id=$1',
      [p.id],
    );
    expect(again.rows[0].n).toBe(1);
  });

it(
  'SIGKILL during equipment UPDATE rolls back location, version and history',
  { timeout: 60000 },
  async () => {
    const p = await player();
    const row = (await handle.pool.query('select account_id from characters where id=$1', [p.id]))
      .rows[0];
    const item = await adminGrantItem(ctx, {
      characterId: p.id,
      templateId: 'weapon.sword.iron_longsword',
      quantity: 1,
      actor: { accountId: null, characterId: null },
      reason: 'kill equipment transaction proof',
    });
    const before = (
      await handle.pool.query('select * from item_instances where id=$1', [item.instance.id])
    ).rows[0];
    const history = (
      await handle.pool.query(
        'select count(*)::int n from item_history where item_instance_id=$1',
        [item.instance.id],
      )
    ).rows[0].n;
    const input = {
      accountId: row.account_id,
      characterId: p.id,
      request: {
        itemInstanceId: item.instance.id,
        expectedVersion: item.instance.version,
        to: { kind: 'equipped' as const, slotId: 'main_hand' },
      },
    };
    const worker = fork(
      fileURLToPath(new URL('../../../scripts/qualification/equipment-worker.ts', import.meta.url)),
      [],
      {
        execArgv: ['--import', 'tsx'],
        env: { ...process.env, NODE_ENV: 'test', MOVE_INPUT: JSON.stringify(input) },
        stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
      },
    );
    children.push(worker);
    let updated = false;
    worker.on('message', (m) => {
      if ((m as Notice).kind === 'updated') updated = true;
    });
    await until(() => updated);
    await kill(worker);
    expect(
      (await handle.pool.query('select * from item_instances where id=$1', [item.instance.id]))
        .rows[0],
    ).toEqual(before);
    expect(
      (
        await handle.pool.query(
          'select count(*)::int n from item_history where item_instance_id=$1',
          [item.instance.id],
        )
      ).rows[0].n,
    ).toBe(history);
    await moveItem(ctx, input);
    await expect(moveItem(ctx, input)).rejects.toThrow();
  },
);
it(
  'published damage survives SIGKILL and a revoked session cannot re-enter',
  { timeout: 60000 },
  async () => {
    const owner = await boot();
    const p = await player(true);
    const c = await join(owner, p);
    const snapshot = c.messages.find((m) => m.t === 'auth.ok')!;
    if (snapshot.t !== 'auth.ok') throw new Error('auth ok');
    const entityId = snapshot.d.entityId;
    const enemy = (await state(owner, p.id)).enemies![0];
    c.send('target.set', { entityId: enemy });
    c.send('combat.attack', { start: true });
    await until(
      () =>
        c.messages.filter((m) => m.t === 'combat.damage' && m.d.targetId === entityId).length >= 3,
      20000,
    ).catch(async (error) => {
      throw new Error(
        `${error}: ${JSON.stringify({ state: await state(owner, p.id), messages: c.messages.slice(-20) })}`,
      );
    });
    const hits = c.messages.filter((m) => m.t === 'combat.damage' && m.d.targetId === entityId);
    const last = hits.at(-1)!;
    if (last.t !== 'combat.damage') throw new Error('no damage');
    await kill(owner.child);
    const next = await boot();
    const again = await join(next, p);
    const recovered = (await state(next, p.id)).state!;
    expect(recovered.health).toBeLessThanOrEqual(last.d.targetHealth);
    // Revocation is durable independently of the zone checkpoint; an old token stays revoked.
    await handle.pool.query(
      'update sessions set revoked_at=now() where account_id=(select account_id from characters where id=$1)',
      [p.id],
    );
    await until(() => again.ws.readyState === WebSocket.CLOSED);
    await kill(next.child);
    const third = await boot();
    const denied = new WebSocket(`ws://127.0.0.1:${third.port}/ws`, {
      origin: 'http://localhost:5173',
    });
    sockets.push(denied);
    let snapshots = 0;
    denied.on('message', (raw) => {
      if (JSON.parse(raw.toString()).t === 'zone.snapshot') snapshots++;
    });
    await new Promise<void>((r) => denied.once('open', r));
    denied.send(
      encodeClientMessage('auth.hello', 1, {
        token: p.token,
        characterId: p.id,
        client: 'game_web',
      }),
    );
    await until(() => denied.readyState === WebSocket.CLOSED);
    expect(snapshots).toBe(0);
  },
);
