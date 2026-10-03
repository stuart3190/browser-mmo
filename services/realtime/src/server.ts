import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { WebSocketServer } from 'ws';
import type { WebSocket } from 'ws';
import { sql } from 'drizzle-orm';
import type { DomainContext, SessionService } from '@mmo/domain';
import {
  awardKill,
  characterFromRow,
  claimWorldPickup,
  getCombatProfile,
  requireOwnedCharacter,
  saveCharacterHealth,
  saveCharacterPosition,
} from '@mmo/domain';
import type { CombatProfile } from '@mmo/domain';
import { ChangeFeedListener } from '@mmo/db';
import type { ClientMessage } from '@mmo/networking';
import {
  SequenceGuard,
  encodeServerMessage,
  parseClientMessage,
  MAX_CLIENT_FRAME_BYTES,
} from '@mmo/networking';
import type { Logger, Metrics } from '@mmo/server-kit';
import { DomainError, ErrorCode, uuidv7 } from '@mmo/shared';
import { ZoneSimulation } from '@mmo/world';
import type { KillEvent, OutMessage } from '@mmo/world';
import type { Rng } from '@mmo/game-data';
import { TokenBucket } from './rate-limit';
import { AccountSync, loadContainerIds, sendFullState } from './sync';
import type { SyncTarget } from './sync';

export interface RealtimeDeps {
  ctx: DomainContext;
  sessions: SessionService;
  logger: Logger;
  metrics: Metrics;
  zoneIds: string[];
  tickHz: number;
  allowedOrigins: string[];
  /** How often dirty positions are flushed to the database. */
  positionSaveIntervalMs?: number;
  authTimeoutMs?: number;
  /**
   * PostgreSQL URL for the LISTEN/NOTIFY change feed (ADR 0014). When set, item and wallet
   * changes made by ANY process (API, admin, jobs) are pushed to connected clients.
   */
  changeFeedUrl?: string;
  /** WebSocket ping interval; connections that miss a pong are terminated. */
  heartbeatMs?: number;
  /**
   * How long a character stays in the world after its connection closes. A reconnect within this
   * window re-attaches to the same in-world character (combat continues; disconnecting cannot be
   * used to escape a fight). 0 = remove immediately.
   */
  lingerMs?: number;
  /** Simulation RNG (combat rolls). Inject a seeded one in tests. */
  rng?: Rng;
}

/** A character present in a zone simulation, with or without a live connection. */
interface InWorld {
  accountId: string;
  characterId: string;
  name: string;
  zone: ZoneSimulation;
  /** Epoch ms after which a disconnected character is removed; null while connected. */
  lingerUntil: number | null;
}

interface PendingKill {
  kill: KillEvent;
  attempts: number;
  nextAttemptAt: number;
}

interface Connection {
  id: string;
  ws: WebSocket;
  log: Logger;
  seq: SequenceGuard;
  bucket: TokenBucket;
  rateViolations: number;
  authTimer: NodeJS.Timeout | undefined;
  /** Set once authenticated. */
  player?: {
    accountId: string;
    characterId: string;
    zone: ZoneSimulation;
    containerIds: Set<string>;
  };
  /** Heartbeat: cleared on ping, set on pong. */
  alive: boolean;
  /** Serialises auth so a client cannot race two hellos. */
  authenticating: boolean;
}

/**
 * Realtime gateway. One process hosts N zone simulations. Connections are authenticated with a
 * session token from the HTTP API in the first frame; afterwards every frame is validated,
 * sequence-checked and rate-limited before it reaches the simulation.
 */
export function createRealtimeServer(deps: RealtimeDeps) {
  const { ctx, logger } = deps;
  const zones = new Map(
    deps.zoneIds.map((id) => [
      id,
      new ZoneSimulation(ctx.gameData, id, deps.rng ? { rng: deps.rng } : {}),
    ]),
  );
  const byCharacter = new Map<string, Connection>();
  const inWorld = new Map<string, InWorld>();
  const pendingKills: PendingKill[] = [];
  let killsInFlight = 0;
  let shuttingDown = false;
  const lingerMs = deps.lingerMs ?? 10_000;
  const rewards = deps.metrics.counter('combat_rewards_total', 'Kill reward attempts by result');
  const connections = new Set<Connection>();
  const wsConnections = deps.metrics.gauge('ws_connections', 'Open WebSocket connections');
  const wsMessages = deps.metrics.counter(
    'ws_messages_total',
    'Inbound WebSocket messages by type/result',
  );
  const pickups = deps.metrics.counter('world_pickups_total', 'Pickup attempts by result');
  const tickDuration = deps.metrics.gauge(
    'world_tick_ms',
    'Duration of the last simulation tick (ms)',
  );

  const http: Server = createServer((req, res) => {
    void (async () => {
      if (req.url === '/health/live') return json(res, 200, { status: 'ok' });
      if (req.url === '/health/ready') {
        try {
          await ctx.db.execute(sql`select 1`);
          return json(res, 200, {
            status: 'ok',
            zones: [...zones.keys()],
            players: byCharacter.size,
            changeFeed: changeFeed ? (changeFeed.connected ? 'ok' : 'reconnecting') : 'disabled',
          });
        } catch {
          return json(res, 503, { status: 'unavailable' });
        }
      }
      if (req.url === '/metrics') {
        res.writeHead(200, { 'content-type': 'text/plain; version=0.0.4' });
        return res.end(deps.metrics.render());
      }
      json(res, 404, { error: { code: 'NOT_FOUND', message: 'Not found' } });
    })();
  });

  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: MAX_CLIENT_FRAME_BYTES,
    perMessageDeflate: false,
  });

  http.on('upgrade', (req: IncomingMessage, socket, head) => {
    const origin = req.headers.origin;
    // Browsers always send Origin; reject cross-site pages (CSWSH). Non-browser clients (mobile, tools) may omit it.
    if (req.url !== '/ws' || (origin !== undefined && !deps.allowedOrigins.includes(origin))) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => onConnection(ws));
  });

  function send(conn: Connection, msg: OutMessage, ack?: number) {
    if (conn.ws.readyState !== conn.ws.OPEN) return;
    conn.ws.send(encodeServerMessage(msg.t, msg.d as never, ack ?? (msg as { ack?: number }).ack));
  }

  function sendError(
    conn: Connection,
    code: ErrorCode,
    message: string,
    ack?: number,
    fatal = false,
  ) {
    send(conn, { t: 'error', d: { code, message, fatal } }, ack);
    if (fatal) conn.ws.close(4000, code);
  }

  function onConnection(ws: WebSocket) {
    const now = Date.now();
    const conn: Connection = {
      id: uuidv7(),
      ws,
      log: logger.child({ connectionId: undefined }),
      seq: new SequenceGuard(),
      bucket: new TokenBucket(40, 20, now),
      rateViolations: 0,
      authTimer: undefined,
      authenticating: false,
      alive: true,
    };
    conn.log = logger.child({ connectionId: conn.id });
    connections.add(conn);
    wsConnections.set(connections.size);
    conn.authTimer = setTimeout(() => {
      if (!conn.player)
        sendError(conn, ErrorCode.UNAUTHENTICATED, 'Authentication timeout', undefined, true);
    }, deps.authTimeoutMs ?? 10_000);

    ws.on('message', (data, isBinary) => {
      if (isBinary)
        return sendError(
          conn,
          ErrorCode.VALIDATION_FAILED,
          'Binary frames not supported',
          undefined,
          true,
        );
      void handleFrame(conn, data.toString());
    });
    ws.on('pong', () => (conn.alive = true));
    ws.on('close', () => void onClose(conn));
    ws.on('error', (err) => conn.log.warn({ err }, 'socket error'));
  }

  async function handleFrame(conn: Connection, raw: string) {
    const now = Date.now();
    if (!conn.bucket.take(now)) {
      wsMessages.inc({ type: 'any', result: 'rate_limited' });
      if (++conn.rateViolations > 100)
        return sendError(conn, ErrorCode.RATE_LIMITED, 'Too many messages', undefined, true);
      return; // silently drop: don't amplify floods with replies
    }
    const parsed = parseClientMessage(raw);
    if (!parsed.ok) {
      wsMessages.inc({ type: 'invalid', result: 'rejected' });
      const fatal = parsed.code === ErrorCode.PROTOCOL_VERSION_UNSUPPORTED || !conn.player;
      return sendError(conn, parsed.code, parsed.reason, undefined, fatal);
    }
    const msg = parsed.message;
    if (!conn.seq.accept(msg.seq)) {
      wsMessages.inc({ type: msg.t, result: 'replay' });
      return sendError(
        conn,
        ErrorCode.CONFLICT,
        'Out-of-order or replayed sequence number',
        msg.seq,
      );
    }
    wsMessages.inc({ type: msg.t, result: 'accepted' });
    try {
      if (msg.t === 'auth.hello') return await handleAuth(conn, msg);
      if (!conn.player)
        return sendError(conn, ErrorCode.UNAUTHENTICATED, 'Authenticate first', msg.seq, true);
      await handleGameMessage(conn, conn.player, msg, now);
    } catch (err) {
      if (err instanceof DomainError) return sendError(conn, err.code, err.message, msg.seq);
      conn.log.error({ err, type: msg.t }, 'message handler failed');
      sendError(conn, ErrorCode.INTERNAL, 'Internal error', msg.seq);
    }
  }

  async function handleAuth(conn: Connection, msg: Extract<ClientMessage, { t: 'auth.hello' }>) {
    if (conn.player || conn.authenticating)
      return sendError(conn, ErrorCode.CONFLICT, 'Already authenticated', msg.seq);
    conn.authenticating = true;
    const session = await deps.sessions.resolve(ctx, msg.d.token);
    if (!session)
      return sendError(conn, ErrorCode.UNAUTHENTICATED, 'Invalid session', msg.seq, true);
    const row = await requireOwnedCharacter(ctx.db, session.account.id, msg.d.characterId).catch(
      () => null,
    );
    if (!row) return sendError(conn, ErrorCode.FORBIDDEN, 'Not your character', msg.seq, true);
    const zone = zones.get(row.zoneId);
    if (!zone)
      return sendError(
        conn,
        ErrorCode.NOT_FOUND,
        `Zone ${row.zoneId} is not hosted here`,
        msg.seq,
        true,
      );
    if (conn.ws.readyState !== conn.ws.OPEN) return;

    // One live connection per character: the newest login wins.
    const existing = byCharacter.get(row.id);
    if (existing) {
      sendError(existing, ErrorCode.CONFLICT, 'Logged in from another session', undefined, true);
      await onClose(existing);
    }

    clearTimeout(conn.authTimer);
    const cls = ctx.gameData.characterClass(row.classId);
    const maxSpeed = cls.baseStats.movement_speed ?? 6;
    const now = Date.now();
    const containerIds = await loadContainerIds(ctx, session.account.id, row.id);
    if (conn.ws.readyState !== conn.ws.OPEN) return;
    conn.player = { accountId: session.account.id, characterId: row.id, zone, containerIds };
    conn.log = conn.log.child({ accountId: session.account.id, characterId: row.id });
    byCharacter.set(row.id, conn);

    const profile = await getCombatProfile(ctx.db, ctx, row.id);
    if (conn.ws.readyState !== conn.ws.OPEN) {
      byCharacter.delete(row.id);
      return;
    }
    const lingering = inWorld.get(row.id);
    const reattached =
      lingering !== undefined && lingering.zone === zone && zone.getPlayer(row.id) !== undefined;
    if (reattached) {
      lingering.lingerUntil = null;
      zone.resyncPlayer(row.id, now);
    } else {
      zone.addPlayer(
        { characterId: row.id, name: row.name, maxSpeed, combat: combatantFrom(profile) },
        { x: row.posX, y: row.posY, z: row.posZ },
        row.rotationY,
        now,
      );
      inWorld.set(row.id, {
        accountId: session.account.id,
        characterId: row.id,
        name: row.name,
        zone,
        lingerUntil: null,
      });
    }
    const placed = zone.getPlayer(row.id)!;
    const entityId = placed.entityId;
    send(
      conn,
      {
        t: 'auth.ok',
        d: {
          connectionId: conn.id,
          entityId,
          character: { ...characterFromRow(row), position: placed.position },
          zoneId: zone.zone.id,
          tickHz: deps.tickHz,
          serverTime: now,
        },
      },
      msg.seq,
    );
    await sendFullState(ctx, syncTarget(conn));
    send(conn, {
      t: 'character.progress',
      d: {
        level: profile.level,
        xp: profile.xp,
        xpToNext: profile.xpToNext,
        xpGained: 0,
        levelsGained: 0,
      },
    });
    if (!reattached) {
      broadcastZone(zone, {
        t: 'presence.update',
        d: { event: 'joined', characterId: row.id, name: row.name, zoneId: zone.zone.id },
      });
    }
    flush();
    conn.log.info({ reattached }, 'player joined');
  }

  async function handleGameMessage(
    conn: Connection,
    player: NonNullable<Connection['player']>,
    msg: ClientMessage,
    now: number,
  ) {
    switch (msg.t) {
      case 'move.input':
        player.zone.handleMove(player.characterId, msg.d.position, msg.d.rotationY, now);
        return;
      case 'interact.pickup': {
        const reservation = player.zone.reservePickup(player.characterId, msg.d.entityId);
        try {
          const items = await claimWorldPickup(ctx, {
            accountId: player.accountId,
            characterId: player.characterId,
            templateId: reservation.templateId,
            quantity: reservation.quantity,
            spawnPointId: reservation.spawnPointId,
            spawnInstanceId: reservation.spawnInstanceId,
            requestId: `${conn.id}:${msg.seq}`,
          });
          player.zone.commitPickup(reservation.entityId, Date.now());
          pickups.inc({ result: 'ok' });
          send(
            conn,
            { t: 'inventory.updated', d: { reason: 'pickup', items, removed: [] } },
            msg.seq,
          );
          conn.log.info(
            { templateId: reservation.templateId, items: items.map((i) => i.instance.id) },
            'pickup persisted',
          );
        } catch (err) {
          if (err instanceof DomainError && err.code === ErrorCode.ALREADY_CLAIMED)
            player.zone.commitPickup(reservation.entityId, Date.now());
          else player.zone.releasePickup(reservation.entityId);
          pickups.inc({ result: err instanceof DomainError ? err.code : 'error' });
          throw err;
        }
        flush();
        return;
      }
      case 'chat.send':
        player.zone.chat(player.characterId, msg.d.channel, msg.d.text, now);
        return;
      case 'target.set':
        player.zone.setTarget(player.characterId, msg.d.entityId);
        flush();
        return;
      case 'combat.attack':
        if (msg.d.start) player.zone.startAttack(player.characterId);
        else player.zone.stopAttack(player.characterId);
        flush();
        return;
      case 'combat.respawn':
        player.zone.respawn(player.characterId, now);
        flush();
        return;
      case 'ping':
        send(conn, { t: 'pong', d: { clientTime: msg.d.clientTime, serverTime: now } }, msg.seq);
        return;
      case 'auth.hello':
        return;
    }
  }

  async function onClose(conn: Connection) {
    if (!connections.delete(conn)) return;
    clearTimeout(conn.authTimer);
    wsConnections.set(connections.size);
    const player = conn.player;
    if (!player) return;
    if (byCharacter.get(player.characterId) === conn) byCharacter.delete(player.characterId);
    const entry = inWorld.get(player.characterId);
    if (!entry || byCharacter.has(player.characterId)) return; // already re-attached elsewhere
    if (shuttingDown || lingerMs <= 0) await leaveWorld(entry);
    else entry.lingerUntil = Date.now() + lingerMs;
    conn.log.info({ lingerMs: shuttingDown ? 0 : lingerMs }, 'connection closed');
  }

  /** Removes a character from its zone for good: persists position + health, announces departure. */
  async function leaveWorld(entry: InWorld) {
    if (inWorld.get(entry.characterId) !== entry) return;
    inWorld.delete(entry.characterId);
    const last = entry.zone.removePlayer(entry.characterId);
    broadcastZone(entry.zone, {
      t: 'presence.update',
      d: {
        event: 'left',
        characterId: entry.characterId,
        name: entry.name,
        zoneId: entry.zone.zone.id,
      },
    });
    flush();
    if (last) {
      await saveCharacterPosition(
        ctx.db,
        entry.characterId,
        entry.zone.zone.id,
        last.position,
        last.rotationY,
      )
        .then(() => saveCharacterHealth(ctx.db, entry.characterId, last.health))
        .catch((err: unknown) =>
          logger.error({ err, characterId: entry.characterId }, 'failed to save character state'),
        );
    }
    logger.info({ characterId: entry.characterId }, 'player left');
  }

  function combatantFrom(profile: CombatProfile) {
    return {
      level: profile.level,
      stats: profile.stats,
      maxHealth: profile.maxHealth,
      health: profile.health,
      weapon: profile.weapon,
    };
  }

  /** Re-reads the character's combat profile (gear/level changed) and applies it to the simulation. */
  async function refreshCombat(characterId: string) {
    const entry = inWorld.get(characterId);
    if (!entry) return;
    const profile = await getCombatProfile(ctx.db, ctx, characterId);
    if (inWorld.get(characterId) !== entry) return;
    const { health: _ignored, ...rest } = combatantFrom(profile);
    entry.zone.updateCombatProfile(characterId, rest, Date.now());
    flush();
  }

  /** Persists one kill reward (exactly once, enforced by the DB) and notifies the player. */
  async function processKill(p: PendingKill) {
    const { kill } = p;
    try {
      const reward = await awardKill(ctx, {
        killId: kill.killId,
        characterId: kill.characterId,
        enemyId: kill.enemyId,
        zoneId: kill.zoneId,
      });
      rewards.inc({ result: 'ok' });
      const conn = byCharacter.get(kill.characterId);
      if (conn) {
        send(conn, {
          t: 'character.progress',
          d: {
            level: reward.level,
            xp: reward.xp,
            xpToNext: reward.xpToNext,
            xpGained: reward.xpGained,
            levelsGained: reward.levelsGained,
          },
        });
        send(conn, {
          t: 'combat.loot',
          d: {
            killId: kill.killId,
            enemyName: kill.enemyName,
            items: reward.items,
            gold: reward.gold,
            lostItems: reward.lostItems,
          },
        });
      }
      if (reward.levelsGained > 0) await refreshCombat(kill.characterId);
      logger.info(
        {
          killId: kill.killId,
          characterId: kill.characterId,
          xp: reward.xpGained,
          items: reward.items.length,
          gold: reward.gold,
        },
        'kill rewarded',
      );
    } catch (err) {
      if (err instanceof DomainError && err.code === ErrorCode.ALREADY_CLAIMED) {
        rewards.inc({ result: 'duplicate' });
        return;
      }
      rewards.inc({ result: 'error' });
      if (p.attempts < 5) {
        p.attempts++;
        p.nextAttemptAt = Date.now() + 500 * 2 ** p.attempts;
        pendingKills.push(p);
        logger.warn(
          { err, killId: kill.killId, attempt: p.attempts },
          'kill reward failed; will retry',
        );
      } else {
        logger.error({ err, kill }, 'kill reward failed permanently');
      }
    }
  }

  /** Called every tick: collects new kills and starts due reward jobs (bounded queue, no per-kill timers). */
  function pumpKills(now: number) {
    for (const zone of zones.values())
      for (const kill of zone.drainKills())
        pendingKills.push({ kill, attempts: 0, nextAttemptAt: now });
    for (let i = pendingKills.length - 1; i >= 0; i--) {
      const p = pendingKills[i]!;
      if (p.nextAttemptAt > now) continue;
      pendingKills.splice(i, 1);
      killsInFlight++;
      void processKill(p).finally(() => killsInFlight--);
    }
  }

  function expireLingering(now: number) {
    for (const entry of inWorld.values()) {
      if (entry.lingerUntil !== null && entry.lingerUntil <= now) void leaveWorld(entry);
    }
  }

  function broadcastZone(zone: ZoneSimulation, msg: OutMessage) {
    for (const conn of byCharacter.values()) if (conn.player?.zone === zone) send(conn, msg);
  }

  /** Delivers every queued simulation message to its recipient. */
  function flush() {
    for (const zone of zones.values()) {
      for (const [characterId, msgs] of zone.drainOutbox()) {
        const conn = byCharacter.get(characterId);
        if (conn) for (const m of msgs) send(conn, m);
      }
    }
  }

  function syncTarget(conn: Connection): SyncTarget {
    const p = conn.player!;
    return {
      accountId: p.accountId,
      characterId: p.characterId,
      containerIds: p.containerIds,
      send: (m) => send(conn, m),
    };
  }

  const sync = new AccountSync(
    ctx,
    (accountId) =>
      [...byCharacter.values()].filter((c) => c.player?.accountId === accountId).map(syncTarget),
    (err) => logger.error({ err }, 'change-feed fan-out failed'),
  );
  // Gear changes (from any process) change combat output: refresh the simulation's profile.
  sync.onCharacterItemsChanged = (characterId) => {
    void refreshCombat(characterId).catch((err: unknown) =>
      logger.error({ err, characterId }, 'combat refresh failed'),
    );
  };
  const changeFeed = deps.changeFeedUrl
    ? new ChangeFeedListener({
        url: deps.changeFeedUrl,
        onEvent: (e) => sync.push(e),
        onResync: () => {
          // NOTIFY is not durable: after (re)connecting, rebuild every client's view from the DB.
          for (const conn of byCharacter.values()) {
            if (conn.player)
              void sendFullState(ctx, syncTarget(conn)).catch((err: unknown) =>
                conn.log.error({ err }, 'resync failed'),
              );
          }
          logger.info({ connections: byCharacter.size }, 'change feed connected; clients resynced');
        },
        onError: (err) => logger.warn({ err }, 'change feed error'),
      })
    : undefined;

  let tickTimer: NodeJS.Timeout | undefined;
  let heartbeatTimer: NodeJS.Timeout | undefined;
  let saveTimer: NodeJS.Timeout | undefined;

  async function savePositions() {
    for (const entry of inWorld.values()) {
      const p = entry.zone.getPlayer(entry.characterId);
      if (!p) continue;
      await saveCharacterPosition(
        ctx.db,
        entry.characterId,
        entry.zone.zone.id,
        p.position,
        p.rotationY,
      );
      await saveCharacterHealth(ctx.db, entry.characterId, p.health);
    }
  }

  return {
    http,
    zones,
    sync,
    /** Number of authenticated connections (tests/health). */
    playerCount: () => byCharacter.size,
    /** Characters present in zone simulations (connected or lingering). */
    inWorldCount: () => inWorld.size,
    /** Resolves when all queued kill rewards have been processed (tests). */
    async rewardsIdle(): Promise<void> {
      while (pendingKills.length > 0 || killsInFlight > 0)
        await new Promise((r) => setTimeout(r, 20));
    },
    async start(host: string, port: number): Promise<void> {
      await changeFeed?.start();
      heartbeatTimer = setInterval(() => {
        for (const conn of connections) {
          if (!conn.alive) {
            conn.log.info('heartbeat missed; terminating');
            conn.ws.terminate();
            continue;
          }
          conn.alive = false;
          conn.ws.ping();
        }
      }, deps.heartbeatMs ?? 30_000);
      tickTimer = setInterval(
        () => {
          const t0 = performance.now();
          const now = Date.now();
          for (const zone of zones.values()) zone.step(now);
          pumpKills(now);
          expireLingering(now);
          flush();
          tickDuration.set(Math.round((performance.now() - t0) * 100) / 100);
        },
        Math.round(1000 / deps.tickHz),
      );
      saveTimer = setInterval(() => {
        savePositions().catch((err: unknown) => logger.error({ err }, 'position save failed'));
      }, deps.positionSaveIntervalMs ?? 15_000);
      return new Promise((resolve) => http.listen(port, host, () => resolve()));
    },
    async stop(): Promise<void> {
      shuttingDown = true;
      clearInterval(tickTimer);
      clearInterval(saveTimer);
      clearInterval(heartbeatTimer);
      await changeFeed?.stop();
      for (const conn of [...connections]) {
        conn.ws.close(1001, 'server shutting down');
        await onClose(conn);
      }
      for (const entry of [...inWorld.values()]) await leaveWorld(entry);
      pumpKills(Date.now());
      while (killsInFlight > 0) await new Promise((r) => setTimeout(r, 20));
      wss.close();
      await new Promise<void>((resolve) => http.close(() => resolve()));
    },
  };
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}
