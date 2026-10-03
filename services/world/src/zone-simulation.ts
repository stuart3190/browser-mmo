import type { GameData, Rng, WeaponProfile } from '@mmo/game-data';
import {
  applyDamage,
  canPlayerRespawn,
  chunkCoordFor,
  chunkKey,
  chunksInRadius,
  defaultRng,
  distance2D,
  isAttackReady,
  isInRange,
  isInsideZone,
  nextSwingAt,
  regenAmount,
  resolveAttack,
} from '@mmo/game-data';
import type { ServerMessage } from '@mmo/networking';
import type {
  CombatRules,
  EnemyDefinition,
  SpawnPoint,
  StatBlock,
  Vec3,
  WorldEntity,
  WorldZone,
} from '@mmo/schemas';
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

/** Server-derived combat inputs for a player (from @mmo/domain getCombatProfile). */
export interface CombatantProfile {
  level: number;
  stats: StatBlock;
  maxHealth: number;
  /** Current health on (re)entry; 0 = dead. */
  health: number;
  weapon: WeaponProfile;
}

export interface PlayerInfo {
  characterId: string;
  name: string;
  /** Max movement speed in m/s, from server-side stats. */
  maxSpeed: number;
  combat: CombatantProfile;
}

/** An enemy death that must be rewarded (processed by the host, exactly once via the DB). */
export interface KillEvent {
  killId: string;
  enemyId: string;
  enemyName: string;
  enemyEntityId: string;
  /** Character credited with the kill (first to damage it: "tagging"). */
  characterId: string;
  zoneId: string;
}

type CombatReason = Extract<OutMessage, { t: 'combat.state' }>['d']['reason'];

interface PlayerState extends PlayerInfo {
  entityId: string;
  position: Vec3;
  rotationY: number;
  lastMoveAtMs: number;
  /** Entity IDs this player currently knows about (its AOI view). */
  known: Set<string>;
  // --- combat ---
  level: number;
  stats: StatBlock;
  weapon: WeaponProfile;
  health: number;
  maxHealth: number;
  /** Fractional regen carried between ticks. */
  regenCarry: number;
  dead: boolean;
  diedAtMs: number;
  targetId: string | null;
  attacking: boolean;
  /** Server clock: earliest time of the next swing. Never moved earlier by client requests. */
  nextAttackAtMs: number;
  lastCombatAtMs: number;
  inCombat: boolean;
  lastOutOfRangeNoticeMs: number;
}

type EnemyMode = 'idle' | 'engaged' | 'returning' | 'dead';

interface EnemyState {
  entityId: string;
  def: EnemyDefinition & { combat: NonNullable<EnemyDefinition['combat']> };
  spawn: SpawnPoint;
  mode: EnemyMode;
  health: number;
  maxHealth: number;
  targetCharacterId: string | null;
  taggedBy: string | null;
  nextAttackAtMs: number;
  diedAtMs: number;
  corpseRemoved: boolean;
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
  /** Server RNG for combat rolls (inject a seeded one in tests). */
  rng?: Rng;
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
  private readonly rng: Rng;
  private readonly rules: CombatRules;
  private readonly enemies = new Map<string, EnemyState>(); // by entityId
  private readonly kills: KillEvent[] = [];
  private lastStepMs: number | null = null;

  constructor(
    private readonly gameData: GameData,
    zoneId: string,
    opts: ZoneSimulationOptions = {},
  ) {
    this.zone = gameData.zone(zoneId);
    this.interestRadius = opts.interestRadiusChunks ?? 2;
    this.speedTolerance = opts.speedTolerance ?? 1.5;
    this.interactTolerance = opts.interactTolerance ?? 1.0;
    this.rng = opts.rng ?? defaultRng;
    this.rules = gameData.raw.combatRules;
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
      level: info.combat.level,
      health: Math.min(info.combat.health, info.combat.maxHealth),
      maxHealth: info.combat.maxHealth,
      dead: info.combat.health <= 0,
      hostile: false,
    };
    this.entities.set(entity.id, entity);
    const dead = info.combat.health <= 0;
    const state: PlayerState = {
      ...info,
      entityId: entity.id,
      position: pos,
      rotationY,
      lastMoveAtMs: nowMs,
      known: new Set(),
      level: info.combat.level,
      stats: info.combat.stats,
      weapon: info.combat.weapon,
      health: Math.max(0, Math.min(info.combat.health, info.combat.maxHealth)),
      maxHealth: info.combat.maxHealth,
      regenCarry: 0,
      dead,
      diedAtMs: dead ? nowMs : 0,
      targetId: null,
      attacking: false,
      nextAttackAtMs: 0,
      lastCombatAtMs: 0,
      inCombat: false,
      lastOutOfRangeNoticeMs: 0,
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
    this.sendVitals(state, nowMs);
    this.sendCombatState(state, 'target_cleared');
    return entity.id;
  }

  /**
   * Re-sends everything a (re)attached client needs: AOI snapshot, own vitals, combat state.
   * Used when a connection drops and the character re-attaches while still in the world.
   */
  resyncPlayer(characterId: string, nowMs: number): void {
    const p = this.players.get(characterId);
    if (!p) return;
    const visible = this.entitiesVisibleFrom(p.position);
    p.known = new Set(visible.map((e) => e.id));
    this.push(characterId, {
      t: 'zone.snapshot',
      d: { zoneId: this.zone.id, tick: this.tickCount, entities: visible },
    });
    this.sendVitals(p, nowMs);
    this.sendCombatState(p, p.targetId ? 'target_set' : 'target_cleared');
  }

  removePlayer(
    characterId: string,
  ): { position: Vec3; rotationY: number; health: number } | undefined {
    const p = this.players.get(characterId);
    if (!p) return undefined;
    this.players.delete(characterId);
    for (const e of this.enemies.values())
      if (e.targetCharacterId === characterId) this.disengage(e);
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
    return { position: p.position, rotationY: p.rotationY, health: Math.round(p.health) };
  }

  getPlayer(characterId: string):
    | Readonly<{
        entityId: string;
        position: Vec3;
        rotationY: number;
        health: number;
        maxHealth: number;
        dead: boolean;
        targetId: string | null;
        attacking: boolean;
        nextAttackAtMs: number;
        weapon: WeaponProfile;
      }>
    | undefined {
    return this.players.get(characterId);
  }

  /** Read-only enemy state (tests, admin/debug). */
  getEnemy(
    entityId: string,
  ):
    | Readonly<{
        mode: EnemyMode;
        health: number;
        maxHealth: number;
        targetCharacterId: string | null;
        taggedBy: string | null;
        defId: string;
      }>
    | undefined {
    const e = this.enemies.get(entityId);
    return (
      e && {
        mode: e.mode,
        health: e.health,
        maxHealth: e.maxHealth,
        targetCharacterId: e.targetCharacterId,
        taggedBy: e.taggedBy,
        defId: e.def.id,
      }
    );
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
    if (p.dead) {
      this.push(characterId, {
        t: 'move.correction',
        d: { position: p.position, rotationY: p.rotationY, reason: 'dead' },
      });
      return false;
    }
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
    if (p.dead) throw new DomainError(ErrorCode.YOU_ARE_DEAD, 'You are dead');
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
  // Combat intents (validated here; outcomes are produced only by step())
  // -------------------------------------------------------------------------

  /** Select a visible entity as target, or clear with null. Changing target stops auto-attack. */
  setTarget(characterId: string, entityId: string | null): void {
    const p = this.requirePlayer(characterId);
    if (entityId === null) {
      p.targetId = null;
      p.attacking = false;
      this.sendCombatState(p, 'target_cleared');
      return;
    }
    if (!this.entities.has(entityId) || !p.known.has(entityId))
      throw new DomainError(ErrorCode.INVALID_TARGET, 'No such target');
    if (p.targetId !== entityId) p.attacking = false;
    p.targetId = entityId;
    this.sendCombatState(p, 'target_set');
  }

  /**
   * Start auto-attacking the current target. Rejected unless the attacker is alive and the target
   * is a living hostile enemy within melee range. Idempotent: it never resets the swing timer.
   */
  startAttack(characterId: string): void {
    const p = this.requirePlayer(characterId);
    if (p.dead) throw new DomainError(ErrorCode.YOU_ARE_DEAD, 'You are dead');
    if (!p.targetId) throw new DomainError(ErrorCode.NO_TARGET, 'You have no target');
    const enemy = this.enemies.get(p.targetId);
    if (!enemy) throw new DomainError(ErrorCode.INVALID_TARGET, 'You cannot attack that');
    if (enemy.mode === 'dead') throw new DomainError(ErrorCode.TARGET_DEAD, 'Your target is dead');
    const e = this.entities.get(enemy.entityId)!;
    if (
      !isInRange(
        distance2D(p.position, e.position),
        this.rules.playerMeleeRange,
        this.rules.rangeTolerance,
      )
    ) {
      throw new DomainError(ErrorCode.OUT_OF_RANGE, 'Out of range');
    }
    if (!this.hasLineOfSight(p.position, e.position))
      throw new DomainError(ErrorCode.OUT_OF_RANGE, 'Target not in line of sight');
    if (p.attacking) return;
    p.attacking = true;
    this.sendCombatState(p, 'started');
  }

  stopAttack(characterId: string): void {
    const p = this.requirePlayer(characterId);
    if (!p.attacking) return;
    p.attacking = false;
    this.sendCombatState(p, 'stopped');
  }

  /** Respawn a dead player at the zone's respawn point once the server-side delay has passed. */
  respawn(characterId: string, nowMs: number): void {
    const p = this.requirePlayer(characterId);
    if (!p.dead) throw new DomainError(ErrorCode.NOT_DEAD, 'You are not dead');
    if (!canPlayerRespawn(this.rules, p.diedAtMs, nowMs))
      throw new DomainError(ErrorCode.RESPAWN_NOT_READY, 'You cannot respawn yet');
    const point = this.respawnPointFor(p);
    p.dead = false;
    p.health = Math.max(1, Math.round(p.maxHealth * this.rules.playerRespawnHealthFraction));
    p.position = { ...point };
    p.lastMoveAtMs = nowMs;
    p.lastCombatAtMs = 0;
    const entity = this.entities.get(p.entityId)!;
    entity.position = p.position;
    this.syncEntityHealth(p.entityId, p.health, p.maxHealth, false);
    this.movedThisTick.add(p.entityId);
    this.push(characterId, {
      t: 'move.correction',
      d: { position: p.position, rotationY: p.rotationY, reason: 'respawned' },
    });
    this.sendVitals(p, nowMs);
    this.sendCombatState(p, 'respawned');
  }

  /**
   * Applies a refreshed combat profile (gear change, level-up). Keeps current health, clamped to
   * the new maximum; a level-up heals the difference in max health.
   */
  updateCombatProfile(
    characterId: string,
    profile: Omit<CombatantProfile, 'health'>,
    nowMs: number,
  ): void {
    const p = this.players.get(characterId);
    if (!p) return;
    const gained = Math.max(0, profile.maxHealth - p.maxHealth);
    p.level = profile.level;
    p.stats = profile.stats;
    p.weapon = profile.weapon;
    p.maxHealth = profile.maxHealth;
    if (!p.dead)
      p.health = Math.min(
        p.maxHealth,
        p.health + (profile.level > (this.entities.get(p.entityId)?.level ?? 0) ? gained : 0),
      );
    p.health = Math.min(p.health, p.maxHealth);
    const entity = this.entities.get(p.entityId)!;
    entity.level = profile.level;
    this.syncEntityHealth(p.entityId, Math.round(p.health), p.maxHealth, p.dead);
    this.sendVitals(p, nowMs);
  }

  /** Current health for persistence. */
  getHealth(characterId: string): number | undefined {
    const p = this.players.get(characterId);
    return p ? Math.round(p.health) : undefined;
  }

  /** Takes pending kill rewards (the host persists them exactly once via the DB). */
  drainKills(): KillEvent[] {
    return this.kills.splice(0, this.kills.length);
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
    const dtMs =
      this.lastStepMs === null ? 0 : Math.min(1000, Math.max(0, nowMs - this.lastStepMs));
    this.lastStepMs = nowMs;
    for (let i = this.respawnQueue.length - 1; i >= 0; i--) {
      const r = this.respawnQueue[i]!;
      if (r.atMs <= nowMs) {
        this.respawnQueue.splice(i, 1);
        this.spawnFromPoint(r.spawn);
      }
    }

    this.stepPlayersCombat(nowMs);
    this.stepEnemies(nowMs, dtMs);
    this.stepRegenAndCombatFlags(nowMs, dtMs);

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
    } else if (spawn.kind === 'enemy') {
      const def = this.gameData.enemy(spawn.refId);
      if (!def.combat) return;
      const entity: WorldEntity = {
        id: this.newEntityId(),
        kind: 'enemy',
        name: def.name,
        position: { ...spawn.position },
        rotationY: spawn.rotationY,
        refId: def.id,
        characterId: null,
        level: def.level,
        health: def.maxHealth,
        maxHealth: def.maxHealth,
        dead: false,
        hostile: true,
      };
      this.enemies.set(entity.id, {
        entityId: entity.id,
        def: def as EnemyState['def'],
        spawn,
        mode: 'idle',
        health: def.maxHealth,
        maxHealth: def.maxHealth,
        targetCharacterId: null,
        taggedBy: null,
        nextAttackAtMs: 0,
        diedAtMs: 0,
        corpseRemoved: false,
      });
      this.addEntity(entity);
    }
    // 'resource_node' spawns are defined in data but not simulated yet.
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

  // ---- combat internals ----------------------------------------------------

  private requirePlayer(characterId: string): PlayerState {
    const p = this.players.get(characterId);
    if (!p) throw new DomainError(ErrorCode.UNAUTHENTICATED, 'Not in zone');
    return p;
  }

  /** Extension point: no collision geometry exists yet, so everything is in line of sight. */
  private hasLineOfSight(_from: Vec3, _to: Vec3): boolean {
    return true;
  }

  /** Extension point for graveyards/checkpoints: today the zone's default spawn. */
  private respawnPointFor(_p: PlayerState): Vec3 {
    return this.zone.defaultSpawn;
  }

  private toKnowers(entityId: string, msg: OutMessage): void {
    for (const p of this.players.values()) if (p.known.has(entityId)) this.push(p.characterId, msg);
  }

  private syncEntityHealth(
    entityId: string,
    health: number,
    maxHealth: number,
    dead: boolean,
  ): void {
    const e = this.entities.get(entityId);
    if (!e) return;
    const changed = e.health !== health || e.maxHealth !== maxHealth || e.dead !== dead;
    e.health = health;
    e.maxHealth = maxHealth;
    e.dead = dead;
    if (changed)
      this.toKnowers(entityId, { t: 'entity.health', d: { entityId, health, maxHealth, dead } });
  }

  private sendVitals(p: PlayerState, _nowMs: number): void {
    this.push(p.characterId, {
      t: 'player.vitals',
      d: {
        health: Math.round(p.health),
        maxHealth: p.maxHealth,
        dead: p.dead,
        inCombat: p.inCombat,
        respawnAvailableAt: p.dead ? p.diedAtMs + this.rules.playerRespawnDelayMs : null,
      },
    });
  }

  private sendCombatState(p: PlayerState, reason: CombatReason): void {
    this.push(p.characterId, {
      t: 'combat.state',
      d: { targetId: p.targetId, attacking: p.attacking, reason },
    });
  }

  private stopAttackingTarget(targetId: string, reason: CombatReason): void {
    for (const p of this.players.values()) {
      if (p.targetId === targetId && p.attacking) {
        p.attacking = false;
        this.sendCombatState(p, reason);
      }
    }
  }

  private face(entityId: string, from: Vec3, to: Vec3): void {
    const e = this.entities.get(entityId);
    if (!e) return;
    const r = Math.atan2(to.x - from.x, to.z - from.z);
    if (Math.abs(r - e.rotationY) > 0.01) {
      e.rotationY = r;
      this.movedThisTick.add(entityId);
    }
  }

  private stepPlayersCombat(nowMs: number): void {
    for (const p of this.players.values()) {
      if (p.dead || !p.attacking || !p.targetId) continue;
      const enemy = this.enemies.get(p.targetId);
      const entity = enemy && this.entities.get(enemy.entityId);
      if (!enemy || !entity) {
        p.attacking = false;
        this.sendCombatState(p, 'target_lost');
        continue;
      }
      if (enemy.mode === 'dead') {
        p.attacking = false;
        this.sendCombatState(p, 'target_dead');
        continue;
      }
      const inRange =
        isInRange(
          distance2D(p.position, entity.position),
          this.rules.playerMeleeRange,
          this.rules.rangeTolerance,
        ) && this.hasLineOfSight(p.position, entity.position);
      if (!inRange) {
        if (nowMs - p.lastOutOfRangeNoticeMs >= 1000) {
          p.lastOutOfRangeNoticeMs = nowMs;
          this.sendCombatState(p, 'out_of_range');
        }
        continue;
      }
      if (!isAttackReady(p.nextAttackAtMs, nowMs)) continue;
      p.nextAttackAtMs = nextSwingAt(p.nextAttackAtMs, nowMs, p.weapon.attackSpeedMs);
      p.lastCombatAtMs = nowMs;
      const result = resolveAttack(
        this.rules,
        { level: p.level, stats: p.stats, weapon: p.weapon },
        { level: enemy.def.level, armor: enemy.def.combat.armor },
        this.rng,
      );
      // Aggro + tag: the first character to damage an enemy owns the kill.
      enemy.taggedBy ??= p.characterId;
      if (enemy.mode !== 'engaged' || !enemy.targetCharacterId) {
        enemy.mode = 'engaged';
        enemy.targetCharacterId = p.characterId;
      }
      const { health, killed } = applyDamage(enemy.health, result.damage);
      enemy.health = health;
      entity.health = health;
      this.toKnowers(enemy.entityId, {
        t: 'combat.damage',
        d: {
          sourceId: p.entityId,
          targetId: enemy.entityId,
          outcome: result.outcome,
          amount: result.damage,
          targetHealth: health,
          targetMaxHealth: enemy.maxHealth,
        },
      });
      if (killed) this.enemyDies(enemy, p, nowMs);
    }
  }

  private enemyDies(enemy: EnemyState, killer: PlayerState, nowMs: number): void {
    enemy.mode = 'dead';
    enemy.diedAtMs = nowMs;
    enemy.targetCharacterId = null;
    const entity = this.entities.get(enemy.entityId)!;
    entity.dead = true;
    entity.health = 0;
    this.toKnowers(enemy.entityId, {
      t: 'combat.death',
      d: { entityId: enemy.entityId, kind: 'enemy', killerId: killer.entityId },
    });
    this.stopAttackingTarget(enemy.entityId, 'target_dead');
    const credited = enemy.taggedBy ?? killer.characterId;
    this.kills.push({
      killId: uuidv7(),
      enemyId: enemy.def.id,
      enemyName: enemy.def.name,
      enemyEntityId: enemy.entityId,
      characterId: credited,
      zoneId: this.zone.id,
    });
    if (enemy.spawn.respawnMs !== null)
      this.respawnQueue.push({
        atMs: nowMs + Math.max(enemy.spawn.respawnMs, enemy.def.combat.corpseMs),
        spawn: enemy.spawn,
      });
  }

  private playerDies(p: PlayerState, killerEntityId: string | null, nowMs: number): void {
    p.dead = true;
    p.health = 0;
    p.diedAtMs = nowMs;
    p.attacking = false;
    p.regenCarry = 0;
    this.syncEntityHealth(p.entityId, 0, p.maxHealth, true);
    this.toKnowers(p.entityId, {
      t: 'combat.death',
      d: { entityId: p.entityId, kind: 'player', killerId: killerEntityId },
    });
    for (const e of this.enemies.values())
      if (e.targetCharacterId === p.characterId) this.disengage(e);
    this.sendCombatState(p, 'you_died');
    this.sendVitals(p, nowMs);
  }

  /** Enemy gives up: walk home, then reset to full health ("evade"). */
  private disengage(e: EnemyState): void {
    if (e.mode === 'dead') return;
    e.mode = 'returning';
    e.targetCharacterId = null;
  }

  private moveToward(
    entityId: string,
    to: Vec3,
    speed: number,
    dtMs: number,
    stopAt: number,
  ): number {
    const e = this.entities.get(entityId)!;
    const dist = distance2D(e.position, to);
    const step = (speed * dtMs) / 1000;
    if (dist > stopAt && step > 0) {
      const t = Math.min(1, step / dist, (dist - stopAt) / dist);
      e.position = {
        x: e.position.x + (to.x - e.position.x) * t,
        y: 0,
        z: e.position.z + (to.z - e.position.z) * t,
      };
      e.rotationY = Math.atan2(to.x - e.position.x, to.z - e.position.z);
      this.movedThisTick.add(entityId);
    }
    return distance2D(e.position, to);
  }

  private stepEnemies(nowMs: number, dtMs: number): void {
    for (const enemy of this.enemies.values()) {
      const c = enemy.def.combat;
      const entity = this.entities.get(enemy.entityId);
      if (enemy.mode === 'dead') {
        if (!enemy.corpseRemoved && nowMs - enemy.diedAtMs >= c.corpseMs) {
          enemy.corpseRemoved = true;
          this.despawnEntity(enemy.entityId, 'died');
        }
        continue;
      }
      if (!entity) continue;
      if (enemy.mode === 'idle') {
        if (c.aggroRange <= 0) continue;
        let best: PlayerState | undefined;
        let bestD = Infinity;
        for (const p of this.players.values()) {
          if (p.dead) continue;
          const d = distance2D(p.position, entity.position);
          if (d <= c.aggroRange && d < bestD) {
            best = p;
            bestD = d;
          }
        }
        if (best) {
          enemy.mode = 'engaged';
          enemy.targetCharacterId = best.characterId;
        }
        continue;
      }
      if (enemy.mode === 'returning') {
        const left = this.moveToward(
          enemy.entityId,
          enemy.spawn.position,
          c.moveSpeed * 1.5,
          dtMs,
          0.1,
        );
        if (left <= 0.15) {
          enemy.mode = 'idle';
          enemy.taggedBy = null;
          enemy.health = enemy.maxHealth;
          this.syncEntityHealth(enemy.entityId, enemy.health, enemy.maxHealth, false);
        }
        continue;
      }
      // engaged
      const target = enemy.targetCharacterId
        ? this.players.get(enemy.targetCharacterId)
        : undefined;
      if (
        !target ||
        target.dead ||
        distance2D(entity.position, enemy.spawn.position) > c.leashRange
      ) {
        this.disengage(enemy);
        continue;
      }
      const dist = this.moveToward(
        enemy.entityId,
        target.position,
        c.moveSpeed,
        dtMs,
        c.attackRange * 0.8,
      );
      if (!isInRange(dist, c.attackRange, this.rules.rangeTolerance)) continue;
      this.face(enemy.entityId, entity.position, target.position);
      if (!isAttackReady(enemy.nextAttackAtMs, nowMs)) continue;
      enemy.nextAttackAtMs = nextSwingAt(enemy.nextAttackAtMs, nowMs, c.attackSpeedMs);
      const result = resolveAttack(
        this.rules,
        {
          level: enemy.def.level,
          stats: {},
          weapon: { min: c.damage.min, max: c.damage.max, attackSpeedMs: c.attackSpeedMs },
        },
        { level: target.level, armor: target.stats.armor ?? 0 },
        this.rng,
      );
      target.lastCombatAtMs = nowMs;
      const { health, killed } = applyDamage(Math.round(target.health), result.damage);
      target.health = health;
      const te = this.entities.get(target.entityId)!;
      te.health = health;
      this.toKnowers(target.entityId, {
        t: 'combat.damage',
        d: {
          sourceId: enemy.entityId,
          targetId: target.entityId,
          outcome: result.outcome,
          amount: result.damage,
          targetHealth: health,
          targetMaxHealth: target.maxHealth,
        },
      });
      if (killed) this.playerDies(target, enemy.entityId, nowMs);
    }
  }

  private stepRegenAndCombatFlags(nowMs: number, dtMs: number): void {
    for (const p of this.players.values()) {
      const inCombat =
        !p.dead && nowMs - p.lastCombatAtMs < this.rules.combatTimeoutMs && p.lastCombatAtMs > 0;
      let vitalsChanged = inCombat !== p.inCombat;
      p.inCombat = inCombat;
      if (
        !p.dead &&
        p.health < p.maxHealth &&
        nowMs - p.lastCombatAtMs >= this.rules.regenDelayMs
      ) {
        p.regenCarry += regenAmount(this.rules, p.maxHealth, dtMs);
        const whole = Math.floor(p.regenCarry);
        if (whole >= 1) {
          p.regenCarry -= whole;
          p.health = Math.min(p.maxHealth, Math.round(p.health) + whole);
          this.syncEntityHealth(p.entityId, p.health, p.maxHealth, false);
          vitalsChanged = true;
        }
      }
      if (vitalsChanged) this.sendVitals(p, nowMs);
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
