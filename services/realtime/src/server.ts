import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { WebSocketServer } from 'ws';
import type { WebSocket } from 'ws';
import { sql } from 'drizzle-orm';
import type { DomainContext, SessionService } from '@mmo/domain';
import {
  characterFromRow,
  claimWorldPickup,
  getCharacterItems,
  requireOwnedCharacter,
  saveCharacterPosition,
} from '@mmo/domain';
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
import type { OutMessage } from '@mmo/world';
import { TokenBucket } from './rate-limit';

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
  player?: { accountId: string; characterId: string; zone: ZoneSimulation };
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
  const zones = new Map(deps.zoneIds.map((id) => [id, new ZoneSimulation(ctx.gameData, id)]));
  const byCharacter = new Map<string, Connection>();
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
    conn.player = { accountId: session.account.id, characterId: row.id, zone };
    conn.log = conn.log.child({ accountId: session.account.id, characterId: row.id });
    byCharacter.set(row.id, conn);

    const entityId = zone.addPlayer(
      { characterId: row.id, name: row.name, maxSpeed },
      { x: row.posX, y: row.posY, z: row.posZ },
      row.rotationY,
      now,
    );
    const placed = zone.getPlayer(row.id)!;
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
    send(conn, {
      t: 'inventory.snapshot',
      d: { items: await getCharacterItems(ctx.db, ctx, session.account.id, row.id) },
    });
    broadcastZone(zone, {
      t: 'presence.update',
      d: { event: 'joined', characterId: row.id, name: row.name, zoneId: zone.zone.id },
    });
    flush();
    conn.log.info('player joined');
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
          send(conn, { t: 'inventory.updated', d: { reason: 'pickup', items } }, msg.seq);
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
    const last = player.zone.removePlayer(player.characterId);
    const row = await ctx.db.query.characters.findFirst({
      where: (c, { eq }) => eq(c.id, player.characterId),
    });
    broadcastZone(player.zone, {
      t: 'presence.update',
      d: {
        event: 'left',
        characterId: player.characterId,
        name: row?.name ?? '',
        zoneId: player.zone.zone.id,
      },
    });
    if (last) {
      await saveCharacterPosition(
        ctx.db,
        player.characterId,
        player.zone.zone.id,
        last.position,
        last.rotationY,
      ).catch((err: unknown) => conn.log.error({ err }, 'failed to save position'));
    }
    conn.log.info('player left');
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

  let tickTimer: NodeJS.Timeout | undefined;
  let saveTimer: NodeJS.Timeout | undefined;

  async function savePositions() {
    for (const conn of byCharacter.values()) {
      const p = conn.player && conn.player.zone.getPlayer(conn.player.characterId);
      if (conn.player && p)
        await saveCharacterPosition(
          ctx.db,
          conn.player.characterId,
          conn.player.zone.zone.id,
          p.position,
          p.rotationY,
        );
    }
  }

  return {
    http,
    zones,
    start(host: string, port: number): Promise<void> {
      tickTimer = setInterval(
        () => {
          const t0 = performance.now();
          const now = Date.now();
          for (const zone of zones.values()) zone.step(now);
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
      clearInterval(tickTimer);
      clearInterval(saveTimer);
      for (const conn of [...connections]) {
        conn.ws.close(1001, 'server shutting down');
        await onClose(conn);
      }
      wss.close();
      await new Promise<void>((resolve) => http.close(() => resolve()));
    },
  };
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}
