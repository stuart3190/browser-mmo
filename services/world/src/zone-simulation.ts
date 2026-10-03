import type { GameData } from '@mmo/game-data';
import { chunkCoordFor, chunkKey, chunksInRadius, distance2D, isInsideZone } from '@mmo/game-data';
import type { ServerMessage } from '@mmo/networking';
import type { SpawnPoint, Vec3, WorldEntity, WorldZone } from '@mmo/schemas';
import { DomainError, ErrorCode, uuidv7 } from '@mmo/shared';

/**
 * ZoneSimulation
 * ==============
 * The authoritative in-memory state of ONE zone: player entities, NPCs and pickups.
 *
 * - Pure game logic: no sockets, no database. The host (realtime service) feeds it intents and
 *   flushes the per-player outbox it produces. This keeps it unit-testable and lets it move to a
 *   dedicated world process later without rewriting.
 * - Interest management is chunk based: a player receives entities within
 *   `interestRadiusChunks` chunks of its own chunk.
 */

/** A server message without the envelope version (added when encoded). Distributive over the union. */
export type OutMessage = ServerMessage extends infer M
  ? M extends unknown
    ? Omit<M, 'v'>
    : never
  : never;

export interface PlayerInfo {
  characterId: string;
  name: string;
  /** Max movement speed in m/s, from server-side stats. */
  maxSpeed: number;
}

interface PlayerState extends PlayerInfo {
  entityId: string;
  position: Vec3;
  rotationY: number;
  lastMoveAtMs: number;
  /** Entity IDs this player currently knows about (its AOI view). */
  known: Set<string>;
}

interface PickupState {
  entityId: string;
  spawn: SpawnPoint;
  /** Unique per spawn cycle; part of the DB dedupe key. */
  spawnInstanceId: string;
  /** Reserved while the DB claim is in flight, so two players cannot both start a claim. */
  reservedBy: string | null;
}

export interface PickupReservation {
  entityId: string;
  templateId: string;
  quantity: number;
  spawnPointId: string;
  spawnInstanceId: string;
}

export interface ZoneSimulationOptions {
  interestRadiusChunks?: number;
  /** Extra allowance on top of max speed for latency/jitter (multiplier). */
  speedTolerance?: number;
  /** Extra metres allowed for interaction range checks. */
  interactTolerance?: number;
}

export class ZoneSimulation {
  readonly zone: WorldZone;
  private tickCount = 0;
  private nextEntity = 1;
  private readonly entities = new Map<string, WorldEntity>();
  private readonly players = new Map<string, PlayerState>(); // by characterId
  private readonly pickups = new Map<string, PickupState>(); // by entityId
  private readonly respawnQueue: { atMs: number; spawn: SpawnPoint }[] = [];
  private readonly movedThisTick = new Set<string>();
  private readonly outbox = new Map<string, OutMessage[]>(); // by characterId
  private readonly interestRadius: number;
  private readonly speedTolerance: number;
  private readonly interactTolerance: number;

  constructor(
    private readonly gameData: GameData,
    zoneId: string,
    opts: ZoneSimulationOptions = {},
  ) {
    this.zone = gameData.zone(zoneId);
    this.interestRadius = opts.interestRadiusChunks ?? 2;
    this.speedTolerance = opts.speedTolerance ?? 1.5;
    this.interactTolerance = opts.interactTolerance ?? 1.0;
    for (const chunk of gameData.chunksForZone(zoneId)) {
      for (const spawn of chunk.spawnPoints) this.spawnFromPoint(spawn);
    }
  }

  get tick(): number {
    return this.tickCount;
  }

  // -------------------------------------------------------------------------
  // Players
  // -------------------------------------------------------------------------

  addPlayer(info: PlayerInfo, position: Vec3, rotationY: number, nowMs: number): string {
    if (this.players.has(info.characterId)) throw new Error('player already in zone');
    const pos = isInsideZone(this.zone, position) ? position : { ...this.zone.defaultSpawn };
    const entity: WorldEntity = {
      id: this.newEntityId(),
      kind: 'player',
      name: info.name,
      position: pos,
      rotationY,
      refId: null,
      characterId: info.characterId,
    };
    this.entities.set(entity.id, entity);
    const state: PlayerState = {
      ...info,
      entityId: entity.id,
      position: pos,
      rotationY,
      lastMoveAtMs: nowMs,
      known: new Set(),
    };
    this.players.set(info.characterId, state);

    // Full snapshot of the AOI for the newcomer...
    const visible = this.entitiesVisibleFrom(pos);
    visible.forEach((e) => state.known.add(e.id));
    this.push(info.characterId, {
      t: 'zone.snapshot',
      d: { zoneId: this.zone.id, tick: this.tickCount, entities: visible },
    });
    // ...and a spawn for everyone who can now see them.
    for (const other of this.players.values()) {
      if (other.characterId === info.characterId) continue;
      if (this.canSee(other.position, pos)) {
        other.known.add(entity.id);
        this.push(other.characterId, { t: 'entity.spawn', d: { entity } });
      }
    }
    return entity.id;
  }

  removePlayer(characterId: string): { position: Vec3; rotationY: number } | undefined {
    const p = this.players.get(characterId);
    if (!p) return undefined;
    this.players.delete(characterId);
    this.entities.delete(p.entityId);
    this.outbox.delete(characterId);
    for (const other of this.players.values()) {
      if (other.known.delete(p.entityId)) {
        this.push(other.characterId, {
          t: 'entity.despawn',
          d: { entityId: p.entityId, reason: 'left' },
        });
      }
    }
    return { position: p.position, rotationY: p.rotationY };
  }

  getPlayer(
    characterId: string,
  ): Readonly<{ entityId: string; position: Vec3; rotationY: number }> | undefined {
    return this.players.get(characterId);
  }

  playerCount(): number {
    return this.players.size;
  }

  /**
   * Movement intent. Accepts the client position only if it is inside the zone and reachable
   * from the last accepted position at the player's max speed (with tolerance). Otherwise sends a
   * correction back to the authoritative position.
   */
  handleMove(characterId: string, position: Vec3, rotationY: number, nowMs: number): boolean {
    const p = this.players.get(characterId);
    if (!p) return false;
    const elapsedS = Math.max(0.05, (nowMs - p.lastMoveAtMs) / 1000);
    const allowed = p.maxSpeed * this.speedTolerance * Math.min(elapsedS, 1.0) + 0.25;
    const dist = distance2D(p.position, position);
    const verticalOk = Math.abs(position.y - p.position.y) < 5;
    if (!isInsideZone(this.zone, position) || dist > allowed || !verticalOk) {
      this.push(characterId, {
        t: 'move.correction',
        d: {
          position: p.position,
          rotationY: p.rotationY,
          reason: !isInsideZone(this.zone, position) ? 'out_of_bounds' : 'too_fast',
        },
      });
      return false;
    }
    p.position = { x: position.x, y: 0, z: position.z }; // flat placeholder ground: server owns Y
    p.rotationY = rotationY;
    p.lastMoveAtMs = nowMs;
    const entity = this.entities.get(p.entityId)!;
    entity.position = p.position;
    entity.rotationY = rotationY;
    this.movedThisTick.add(p.entityId);
    return true;
  }

  // -------------------------------------------------------------------------
  // Pickups (two-phase: reserve in memory -> persist in DB -> commit or release)
  // -------------------------------------------------------------------------

  reservePickup(characterId: string, entityId: string): PickupReservation {
    const p = this.players.get(characterId);
    if (!p) throw new DomainError(ErrorCode.UNAUTHENTICATED, 'Not in zone');
    const pickup = this.pickups.get(entityId);
    if (!pickup) throw new DomainError(ErrorCode.NOT_FOUND, 'Nothing to pick up');
    if (pickup.reservedBy && pickup.reservedBy !== characterId)
      throw new DomainError(ErrorCode.ALREADY_CLAIMED, 'Someone else is picking that up');
    if (pickup.reservedBy === characterId)
      throw new DomainError(ErrorCode.CONFLICT, 'Pickup already in progress');
    if (
      distance2D(p.position, pickup.spawn.position) >
      pickup.spawn.interactRadius + this.interactTolerance
    ) {
      throw new DomainError(ErrorCode.OUT_OF_RANGE, 'Too far away');
    }
    pickup.reservedBy = characterId;
    return {
      entityId,
      templateId: pickup.spawn.refId,
      quantity: pickup.spawn.quantity,
      spawnPointId: pickup.spawn.id,
      spawnInstanceId: pickup.spawnInstanceId,
    };
  }

  /** The DB accepted the claim (or reports it was already claimed): remove the entity and schedule respawn. */
  commitPickup(entityId: string, nowMs: number): void {
    const pickup = this.pickups.get(entityId);
    if (!pickup) return;
    this.pickups.delete(entityId);
    this.despawnEntity(entityId, 'picked_up');
    if (pickup.spawn.respawnMs !== null)
      this.respawnQueue.push({ atMs: nowMs + pickup.spawn.respawnMs, spawn: pickup.spawn });
  }

  /** The DB claim failed for a transient reason (e.g. bag full): make it available again. */
  releasePickup(entityId: string): void {
    const pickup = this.pickups.get(entityId);
    if (pickup) pickup.reservedBy = null;
  }

  // -------------------------------------------------------------------------
  // Chat (zone-local channels only for now)
  // -------------------------------------------------------------------------

  chat(characterId: string, channel: 'say' | 'zone', text: string, nowMs: number): void {
    const p = this.players.get(characterId);
    if (!p) return;
    const msg: OutMessage = {
      t: 'chat.message',
      d: { channel, from: { characterId, name: p.name }, text, sentAt: nowMs },
    };
    for (const other of this.players.values()) {
      if (channel === 'zone' || distance2D(other.position, p.position) <= 40)
        this.push(other.characterId, msg);
    }
  }

  // -------------------------------------------------------------------------
  // Tick
  // -------------------------------------------------------------------------

  /** Advances the simulation: respawns, interest updates, batched movement broadcast. */
  step(nowMs: number): void {
    this.tickCount++;
    for (let i = this.respawnQueue.length - 1; i >= 0; i--) {
      const r = this.respawnQueue[i]!;
      if (r.atMs <= nowMs) {
        this.respawnQueue.splice(i, 1);
        this.spawnFromPoint(r.spawn);
      }
    }

    for (const p of this.players.values()) {
      // Interest management: spawn/despawn entities as the player's AOI changes.
      const visible = new Set(this.entitiesVisibleFrom(p.position).map((e) => e.id));
      for (const id of visible) {
        if (!p.known.has(id)) {
          p.known.add(id);
          this.push(p.characterId, { t: 'entity.spawn', d: { entity: this.entities.get(id)! } });
        }
      }
      for (const id of p.known) {
        if (!visible.has(id)) {
          p.known.delete(id);
          this.push(p.characterId, {
            t: 'entity.despawn',
            d: { entityId: id, reason: 'out_of_range' },
          });
        }
      }
      const moves: [string, number, number, number, number][] = [];
      for (const id of this.movedThisTick) {
        if (id === p.entityId || !p.known.has(id)) continue;
        const e = this.entities.get(id);
        if (e)
          moves.push([
            id,
            round(e.position.x),
            round(e.position.y),
            round(e.position.z),
            round(e.rotationY),
          ]);
      }
      if (moves.length > 0)
        this.push(p.characterId, { t: 'world.moves', d: { tick: this.tickCount, moves } });
    }
    this.movedThisTick.clear();
  }

  /** Takes and clears every queued message, grouped by recipient character. */
  drainOutbox(): Map<string, OutMessage[]> {
    const out = new Map(this.outbox);
    this.outbox.clear();
    return out;
  }

  /** Read-only view for debugging/admin. */
  listEntities(): WorldEntity[] {
    return [...this.entities.values()];
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private newEntityId(): string {
    return `e:${this.nextEntity++}`;
  }

  private push(characterId: string, msg: OutMessage): void {
    let q = this.outbox.get(characterId);
    if (!q) {
      q = [];
      this.outbox.set(characterId, q);
    }
    q.push(msg);
  }

  private spawnFromPoint(spawn: SpawnPoint): void {
    if (spawn.kind === 'npc') {
      const def = this.gameData.npcs.get(spawn.refId)!;
      this.addEntity({
        id: this.newEntityId(),
        kind: 'npc',
        name: def.name,
        position: spawn.position,
        rotationY: spawn.rotationY,
        refId: def.id,
        characterId: null,
      });
    } else if (spawn.kind === 'pickup') {
      const template = this.gameData.template(spawn.refId);
      const entity: WorldEntity = {
        id: this.newEntityId(),
        kind: 'pickup',
        name: spawn.quantity > 1 ? `${template.name} ×${spawn.quantity}` : template.name,
        position: spawn.position,
        rotationY: spawn.rotationY,
        refId: template.id,
        characterId: null,
      };
      this.pickups.set(entity.id, {
        entityId: entity.id,
        spawn,
        spawnInstanceId: uuidv7(),
        reservedBy: null,
      });
      this.addEntity(entity);
    }
    // 'enemy' and 'resource_node' spawns are defined in data but not simulated yet.
  }

  private addEntity(entity: WorldEntity): void {
    this.entities.set(entity.id, entity);
    for (const p of this.players.values()) {
      if (this.canSee(p.position, entity.position)) {
        p.known.add(entity.id);
        this.push(p.characterId, { t: 'entity.spawn', d: { entity } });
      }
    }
  }

  private despawnEntity(entityId: string, reason: 'picked_up' | 'died' | 'expired'): void {
    this.entities.delete(entityId);
    for (const p of this.players.values()) {
      if (p.known.delete(entityId))
        this.push(p.characterId, { t: 'entity.despawn', d: { entityId, reason } });
    }
  }

  private canSee(from: Vec3, target: Vec3): boolean {
    const a = chunkCoordFor(this.zone, from);
    const b = chunkCoordFor(this.zone, target);
    return (
      Math.abs(a.cx - b.cx) <= this.interestRadius && Math.abs(a.cz - b.cz) <= this.interestRadius
    );
  }

  private entitiesVisibleFrom(pos: Vec3): WorldEntity[] {
    const keys = new Set(
      chunksInRadius(this.zone, chunkCoordFor(this.zone, pos), this.interestRadius).map(chunkKey),
    );
    return [...this.entities.values()].filter((e) =>
      keys.has(chunkKey(chunkCoordFor(this.zone, e.position))),
    );
  }
}

const round = (n: number) => Math.round(n * 100) / 100;
