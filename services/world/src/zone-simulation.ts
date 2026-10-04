import type { CollisionWorld, GameData, Rng, WeaponProfile } from '@mmo/game-data';
import {
  ENEMY_COLLISION_RADIUS,
  PLAYER_COLLISION_RADIUS,
  abilityAvailability,
  applyDamage,
  classAbilities,
  cooldownRemainingMs,
  newlyUnlockedAbilities,
  resolveAbility,
  startCooldown,
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
  SpawnGroup,
  SpawnPoint,
  StatBlock,
  Vec3,
  WorldEntity,
  WorldZone,
} from '@mmo/schemas';
import { DomainError, ErrorCode, uuidv7 } from '@mmo/shared';
import { Parties } from './parties';
import { NavGrid } from './navigation';

type XZ = { x: number; z: number };

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
  /** Persisted class (server data). Defaults to Warrior for tests that do not care. */
  classId?: string;
  /** Still-running cooldowns restored from persistence (epoch ms; '*' = global cooldown). */
  abilityCooldowns?: Record<string, number>;
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
  recipients?: string[];
  lootCharacterId?: string;
  zoneId: string;
  spawnPointId: string;
  groupId: string | null;
  diedAtMs: number;
  /** When this death's spawn slot becomes available again (persisted with the kill). */
  respawnAtMs: number;
}

/** A persisted, not-yet-elapsed respawn slot restored at startup (from durable kill events). */
export interface RestoredRespawn {
  spawnPointId: string;
  groupId: string | null;
  respawnAtMs: number;
}

type CombatReason = Extract<OutMessage, { t: 'combat.state' }>['d']['reason'];

interface PlayerState extends PlayerInfo {
  entityId: string;
  position: Vec3;
  rotationY: number;
  lastMoveAtMs: number;
  movementCredit: number;
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
  // --- abilities ---
  classId: string;
  /** abilityId -> server time the ability is ready again. */
  cooldowns: Map<string, number>;
  globalReadyAtMs: number;
}

/**
 * 'dying': health reached 0 but the death is not yet durable. The host persists the kill event
 * (write-ahead) and then calls confirmKill(); only then is the death announced and the respawn
 * scheduled. The host checkpoint also retains pending kills so recovery can finish a death
 * even if the separate kill-event write had not started.
 */
type EnemyMode = 'idle' | 'engaged' | 'returning' | 'dying' | 'dead';

interface EnemyState {
  entityId: string;
  def: EnemyDefinition & { combat: NonNullable<EnemyDefinition['combat']> };
  spawn: SpawnPoint;
  mode: EnemyMode;
  health: number;
  maxHealth: number;
  targetCharacterId: string | null;
  taggedBy: string | null;
  tagCohort?: ReturnType<Parties['cohort']>;
  nextAttackAtMs: number;
  diedAtMs: number;
  corpseRemoved: boolean;
  killId: string | null;
  respawnAtMs: number;
  // steering
  path: XZ[] | null;
  pathGoal: XZ;
  repathAtMs: number;
  bestDist: number;
  lastProgressAtMs: number;
  wanderTarget: XZ | null;
  nextWanderAtMs: number;
}

interface GroupState {
  def: SpawnGroup;
  points: SpawnPoint[];
  /** Enemy entity IDs counted against maxAlive (alive or dying). */
  alive: Set<string>;
  /** Respawn times of confirmed deaths (slot is unavailable until then). */
  pending: number[];
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
  /** Extra metres allowed for interaction range checks. */
  interactTolerance?: number;
  /** Server RNG for combat rolls (inject a seeded one in tests). */
  rng?: Rng;
  /** Simulation start time (initial spawns, wander timers). */
  nowMs?: number;
  /** Respawn slots still pending from durable kill events (restart recovery). */
  restoredRespawns?: RestoredRespawn[];
}

export class ZoneSimulation {
  readonly parties: Parties;
  private partyViews = new Map<string, string>();
  private nextPartyUpdate = 0;
  setConnected(id: string, online: boolean, now: number): void {
    this.parties.connected(id, online, now);
    this.syncParties();
  }
  syncParties(forceId?: string): void {
    for (const id of this.players.keys()) {
      const d = this.parties.view(id),
        json = JSON.stringify(d);
      if (
        id === forceId ||
        (this.partyViews.get(id) !== json &&
          (d.partyId || d.invitation || d.pendingInvite || this.partyViews.has(id)))
      ) {
        this.push(id, { t: 'party.update', d });
        this.partyViews.set(id, json);
      }
    }
  }

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
  private readonly npcSpawns = new Map<string, SpawnPoint>();
  private readonly interactTolerance: number;
  private readonly rng: Rng;
  private readonly rules: CombatRules;
  private readonly enemies = new Map<string, EnemyState>(); // by entityId
  private readonly kills: KillEvent[] = [];
  private lastStepMs: number | null = null;
  readonly collision: CollisionWorld;
  private navGrid: NavGrid | undefined;
  private readonly groups = new Map<string, GroupState>();

  constructor(
    private readonly gameData: GameData,
    zoneId: string,
    opts: ZoneSimulationOptions = {},
  ) {
    this.zone = gameData.zone(zoneId);
    this.parties = new Parties((id) => this.players.get(id), zoneId);
    this.interestRadius = opts.interestRadiusChunks ?? 2;
    this.interactTolerance = opts.interactTolerance ?? 1.0;
    this.rng = opts.rng ?? defaultRng;
    this.rules = gameData.raw.combatRules;
    this.collision = gameData.collisionWorld(zoneId);
    const now = opts.nowMs ?? Date.now();
    this.lastStepMs = null;
    const restored = opts.restoredRespawns ?? [];
    for (const g of this.zone.spawnGroups)
      this.groups.set(g.id, { def: g, points: [], alive: new Set(), pending: [] });
    for (const chunk of gameData.chunksForZone(zoneId)) {
      for (const spawn of chunk.spawnPoints) {
        const group = spawn.groupId ? this.groups.get(spawn.groupId) : undefined;
        if (group) {
          group.points.push(spawn);
          continue;
        }
        const r = restored.find((x) => x.spawnPointId === spawn.id && x.respawnAtMs > now);
        if (r) this.respawnQueue.push({ atMs: r.respawnAtMs, spawn });
        else this.spawnFromPoint(spawn, now);
      }
    }
    for (const r of restored)
      if (r.groupId && r.respawnAtMs > now) this.groups.get(r.groupId)?.pending.push(r.respawnAtMs);
    this.stepGroups(now);
  }

  /** Versioned recovery image. Static geometry/nav are rebuilt from game data. */
  checkpoint(): string {
    return JSON.stringify(
      {
        version: 2,
        parties: this.parties.checkpoint(),
        tickCount: this.tickCount,
        nextEntity: this.nextEntity,
        entities: this.entities,
        players: this.players,
        pickups: this.pickups,
        respawnQueue: this.respawnQueue,
        npcSpawns: this.npcSpawns,
        enemies: this.enemies,
        kills: this.kills,
        groups: this.groups,
      },
      (_key, value: unknown) => {
        if (value instanceof Map) return { $map: [...value] };
        if (value instanceof Set) return { $set: [...value] };
        if (value === Infinity) return { $infinity: true };
        return value;
      },
    );
  }

  restoreCheckpoint(raw: string): string[] {
    const state = JSON.parse(raw, (_key, value: unknown) => {
      if (value && typeof value === 'object') {
        if ('$map' in value) return new Map(value.$map as [unknown, unknown][]);
        if ('$set' in value) return new Set(value.$set as unknown[]);
        if ('$infinity' in value) return Infinity;
      }
      return value;
    }) as {
      version: number;
      parties?: ReturnType<Parties['checkpoint']>;
      tickCount: number;
      nextEntity: number;
      entities: Map<string, WorldEntity>;
      players: Map<string, PlayerState>;
      pickups: Map<string, PickupState>;
      respawnQueue: { atMs: number; spawn: SpawnPoint }[];
      npcSpawns: Map<string, SpawnPoint>;
      enemies: Map<string, EnemyState>;
      kills: KillEvent[];
      groups: Map<string, GroupState>;
    };
    if ((state.version !== 1 && state.version !== 2) || !(state.players instanceof Map))
      throw new Error('Unsupported zone checkpoint; explicit migration required');
    this.parties.restore(state.parties, Date.now());
    this.partyViews.clear();
    this.tickCount = state.tickCount;
    this.nextEntity = state.nextEntity;
    const restore = <T>(to: Map<string, T>, from: Map<string, T>) => {
      to.clear();
      for (const [id, value] of from) to.set(id, value);
    };
    restore(this.entities, state.entities);
    restore(this.players, state.players);
    restore(this.pickups, state.pickups);
    restore(this.npcSpawns, state.npcSpawns);
    // Additive static NPC content migration. Existing entity IDs and every live combat state stay intact.
    for (const chunk of this.gameData.chunksForZone(this.zone.id))
      for (const spawn of chunk.spawnPoints)
        if (spawn.kind === 'npc' && ![...this.npcSpawns.values()].some((s) => s.id === spawn.id))
          this.spawnFromPoint(spawn);
    restore(this.enemies, state.enemies);
    restore(this.groups, state.groups);
    this.respawnQueue.splice(0, this.respawnQueue.length, ...state.respawnQueue);
    this.kills.splice(0, this.kills.length, ...state.kills);
    // Narrow additive ungrouped enemy migration; never resurrect a live/corpse/pending spawn.
    for (const chunk of this.gameData.chunksForZone(this.zone.id))
      for (const spawn of chunk.spawnPoints)
        if (
          spawn.kind === 'enemy' &&
          !spawn.groupId &&
          ![...this.enemies.values()].some((e) => e.spawn.id === spawn.id) &&
          !this.respawnQueue.some((r) => r.spawn.id === spawn.id)
        )
          this.spawnFromPoint(spawn, Date.now());
    for (const pickup of this.pickups.values()) pickup.reservedBy = null;
    for (const p of this.players.values()) {
      p.known.clear();
      p.lastMoveAtMs = Date.now();
      p.movementCredit = 0;
    }
    this.outbox.clear();
    this.movedThisTick.clear();
    this.lastStepMs = null;
    return [...this.players.keys()];
  }

  /** Navigation grid for this zone (built on first use; static geometry). */
  private get nav(): NavGrid {
    if (!this.navGrid) {
      const b = this.zone.bounds;
      const s = this.zone.chunkSize;
      this.navGrid = new NavGrid(
        this.collision,
        { minX: b.minCx * s, minZ: b.minCz * s, maxX: (b.maxCx + 1) * s, maxZ: (b.maxCz + 1) * s },
        ENEMY_COLLISION_RADIUS,
      );
    }
    return this.navGrid;
  }

  get tick(): number {
    return this.tickCount;
  }

  // -------------------------------------------------------------------------
  // Players
  // -------------------------------------------------------------------------

  addPlayer(info: PlayerInfo, position: Vec3, rotationY: number, nowMs: number): string {
    if (this.players.has(info.characterId)) throw new Error('player already in zone');
    const raw = isInsideZone(this.zone, position) ? position : { ...this.zone.defaultSpawn };
    const free = this.collision.nearestFree(raw, PLAYER_COLLISION_RADIUS);
    const pos = { x: free.x, y: 0, z: free.z };
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
      movementCredit: 0.75,
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
      classId: info.combat.classId ?? 'class.warrior',
      cooldowns: new Map(
        Object.entries(info.combat.abilityCooldowns ?? {}).filter(
          ([id, t]) => id !== '*' && t > nowMs,
        ),
      ),
      globalReadyAtMs: Math.max(0, info.combat.abilityCooldowns?.['*'] ?? 0),
    };
    this.players.set(info.characterId, state);
    this.parties.connected(info.characterId, true, nowMs);

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
    this.sendAbilityState(state, nowMs);
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
    this.sendAbilityState(p, nowMs);
  }

  persistentState(characterId: string) {
    const p = this.players.get(characterId);
    return p
      ? {
          position: { ...p.position },
          rotationY: p.rotationY,
          health: Math.round(p.health),
          abilityCooldowns: { ...Object.fromEntries(p.cooldowns), '*': p.globalReadyAtMs },
        }
      : undefined;
  }

  removePlayer(characterId: string):
    | {
        position: Vec3;
        rotationY: number;
        health: number;
        abilityCooldowns: Record<string, number>;
      }
    | undefined {
    const p = this.players.get(characterId);
    if (!p) return undefined;
    this.parties.connected(characterId, false, Date.now());
    this.partyViews.delete(characterId);
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
    return {
      position: p.position,
      rotationY: p.rotationY,
      health: Math.round(p.health),
      abilityCooldowns: { ...Object.fromEntries(p.cooldowns), '*': p.globalReadyAtMs },
    };
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
        stats: StatBlock;
        level: number;
        classId: string;
      }>
    | undefined {
    return this.players.get(characterId);
  }

  /** Read-only enemy state (tests, admin/debug). */
  getEnemy(entityId: string):
    | Readonly<{
        mode: EnemyMode;
        health: number;
        maxHealth: number;
        targetCharacterId: string | null;
        taggedBy: string | null;
        tagCohort?: ReturnType<Parties['cohort']>;
        defId: string;
        spawnPointId: string;
        groupId: string | null;
        killId: string | null;
        position: Vec3;
      }>
    | undefined {
    const e = this.enemies.get(entityId);
    const ent = this.entities.get(entityId);
    return (
      e && {
        mode: e.mode,
        health: e.health,
        maxHealth: e.maxHealth,
        targetCharacterId: e.targetCharacterId,
        taggedBy: e.taggedBy,
        defId: e.def.id,
        spawnPointId: e.spawn.id,
        groupId: e.spawn.groupId,
        killId: e.killId,
        position: ent ? { ...ent.position } : { ...e.spawn.position },
      }
    );
  }

  /** All enemy entity IDs currently simulated (alive, dying or corpse). */
  enemyIds(): string[] {
    return [...this.enemies.keys()];
  }

  /** Live (not dying/dead) enemies per spawn group, for population checks. */
  groupPopulation(
    groupId: string,
  ): { alive: number; pending: number; maxAlive: number } | undefined {
    const g = this.groups.get(groupId);
    return g && { alive: g.alive.size, pending: g.pending.length, maxAlive: g.def.maxAlive };
  }

  /**
   * The host persisted this kill (write-ahead). Finalise the death: announce it, stop attackers,
   * start the corpse timer and occupy the respawn slot until `respawnAtMs`. Idempotent.
   */
  confirmKill(killId: string, nowMs: number): boolean {
    const enemy = [...this.enemies.values()].find((e) => e.killId === killId && e.mode === 'dying');
    if (!enemy) return false;
    enemy.mode = 'dead';
    enemy.diedAtMs = nowMs;
    const entity = this.entities.get(enemy.entityId);
    if (entity) {
      entity.dead = true;
      entity.health = 0;
    }
    this.toKnowers(enemy.entityId, {
      t: 'combat.death',
      d: {
        entityId: enemy.entityId,
        kind: 'enemy',
        killerId: this.players.get(enemy.taggedBy ?? '')?.entityId ?? null,
      },
    });
    this.stopAttackingTarget(enemy.entityId, 'target_dead');
    const group = enemy.spawn.groupId ? this.groups.get(enemy.spawn.groupId) : undefined;
    if (group) {
      group.alive.delete(enemy.entityId);
      group.pending.push(enemy.respawnAtMs);
    } else {
      this.respawnQueue.push({ atMs: enemy.respawnAtMs, spawn: enemy.spawn });
    }
    return true;
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
    // A single bounded credit absorbs packet jitter. Sending more packets cannot mint distance.
    const elapsedS = Math.max(0, (nowMs - p.lastMoveAtMs) / 1000);
    p.movementCredit = Math.min(p.maxSpeed * 0.5 + 0.75, p.movementCredit + elapsedS * p.maxSpeed);
    p.lastMoveAtMs = Math.max(p.lastMoveAtMs, nowMs);
    const allowed = p.movementCredit + 1e-8;
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
    // Authoritative collision: the client predicts with the same CollisionWorld (radius 0.45);
    // the server is slightly lenient on overlap but never allows crossing an obstacle.
    if (
      this.collision.overlaps(position, PLAYER_COLLISION_RADIUS * 0.7) ||
      this.collision.sweepBlocked(p.position, position, 0)
    ) {
      this.push(characterId, {
        t: 'move.correction',
        d: { position: p.position, rotationY: p.rotationY, reason: 'blocked' },
      });
      return false;
    }
    p.movementCredit = Math.max(0, p.movementCredit - dist);
    p.position = { x: position.x, y: 0, z: position.z }; // flat placeholder ground: server owns Y
    p.rotationY = rotationY;
    p.lastMoveAtMs = Math.max(p.lastMoveAtMs, nowMs);
    const entity = this.entities.get(p.entityId)!;
    entity.position = p.position;
    entity.rotationY = rotationY;
    this.movedThisTick.add(p.entityId);
    return true;
  }

  // -------------------------------------------------------------------------
  // Pickups (two-phase: reserve in memory -> persist in DB -> commit or release)
  // -------------------------------------------------------------------------

  /**
   * Validates a request to interact with an NPC: the entity exists in THIS zone and is an NPC, the
   * player is alive and within the spawn's interact radius (+ tolerance). Returns the NPC
   * definition id; the client can never name an NPC it is not standing next to.
   */
  npcInteraction(characterId: string, entityId: string): { entityId: string; npcId: string } {
    const p = this.players.get(characterId);
    if (!p) throw new DomainError(ErrorCode.UNAUTHENTICATED, 'Not in zone');
    if (p.dead) throw new DomainError(ErrorCode.YOU_ARE_DEAD, 'You are dead');
    const spawn = this.npcSpawns.get(entityId);
    if (!spawn) throw new DomainError(ErrorCode.INVALID_TARGET, 'There is nobody to talk to');
    if (distance2D(p.position, spawn.position) > spawn.interactRadius + this.interactTolerance)
      throw new DomainError(ErrorCode.OUT_OF_RANGE, 'Too far away');
    return { entityId, npcId: spawn.refId };
  }

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
    if (enemy.mode === 'dead' || enemy.mode === 'dying')
      throw new DomainError(ErrorCode.TARGET_DEAD, 'Your target is dead');
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
    p.lastMoveAtMs = Math.max(p.lastMoveAtMs, nowMs);
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
    const unlocked = newlyUnlockedAbilities(this.gameData, p.classId, p.level, profile.level);
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
    if (unlocked.length > 0)
      this.sendAbilityState(
        p,
        nowMs,
        unlocked.map((a) => a.id),
      );
  }

  /**
   * Uses an ability on the player's current (server-side) target. Everything is validated here:
   * class ownership, level unlock, alive, cooldown and global cooldown on the SERVER clock,
   * hostile living target, range (+ tolerance) and line of sight. The outcome is rolled here.
   * Auto-attack abilities toggle the swing loop. Throws a DomainError on rejection.
   */
  useAbility(
    characterId: string,
    abilityId: string,
    nowMs: number,
  ): { outcome: 'hit' | 'crit' | 'miss' | 'toggled'; damage: number } {
    const p = this.requirePlayer(characterId);
    const ok = abilityAvailability(this.gameData, abilityId, p.classId, p.level);
    if (!ok.ok) {
      const [code, message] =
        ok.reason === 'UNKNOWN'
          ? [ErrorCode.ABILITY_UNKNOWN, 'Unknown ability']
          : ok.reason === 'LOCKED'
            ? [ErrorCode.ABILITY_LOCKED, 'You have not learned that ability yet']
            : [ErrorCode.ABILITY_NOT_AVAILABLE, 'Your class cannot use that ability'];
      throw new DomainError(code, message);
    }
    const ability = this.gameData.abilities.get(abilityId)!;
    if (p.dead) throw new DomainError(ErrorCode.YOU_ARE_DEAD, 'You are dead');
    if (ability.autoAttack) {
      if (p.attacking) this.stopAttack(characterId);
      else this.startAttack(characterId);
      return { outcome: 'toggled', damage: 0 };
    }
    const remaining = cooldownRemainingMs(
      p.cooldowns.get(abilityId) ?? 0,
      p.globalReadyAtMs,
      nowMs,
    );
    if (remaining > 0)
      throw new DomainError(ErrorCode.ON_COOLDOWN, `${ability.name} is not ready`, {
        remainingMs: remaining,
      });
    if (!p.targetId) throw new DomainError(ErrorCode.NO_TARGET, 'You have no target');
    const enemy = this.enemies.get(p.targetId);
    const entity = enemy && this.entities.get(enemy.entityId);
    if (!enemy || !entity)
      throw new DomainError(ErrorCode.INVALID_TARGET, 'You cannot attack that');
    if (enemy.mode === 'dead' || enemy.mode === 'dying')
      throw new DomainError(ErrorCode.TARGET_DEAD, 'Your target is dead');
    if (
      !isInRange(
        distance2D(p.position, entity.position),
        ability.rangeMeters,
        this.rules.rangeTolerance,
      )
    )
      throw new DomainError(ErrorCode.OUT_OF_RANGE, 'Out of range');
    if (!this.hasLineOfSight(p.position, entity.position))
      throw new DomainError(ErrorCode.NO_LINE_OF_SIGHT, 'Target not in line of sight');

    const cd = startCooldown(this.rules, ability, nowMs);
    p.cooldowns.set(abilityId, cd.readyAtMs);
    p.globalReadyAtMs = cd.globalReadyAtMs;
    p.lastCombatAtMs = nowMs;
    const result = resolveAbility(
      this.rules,
      ability,
      { level: p.level, stats: p.stats, weapon: p.weapon },
      { level: enemy.def.level, armor: enemy.def.combat.armor },
      this.rng,
    );
    this.hitEnemy(p, enemy, entity, result.outcome, result.damage, nowMs, abilityId);
    this.sendAbilityState(p, nowMs);
    return result;
  }

  /** Current ability bar state for a player (unlocks + server-clock ready times). */
  private sendAbilityState(p: PlayerState, nowMs: number, newlyUnlocked: string[] = []): void {
    this.push(p.characterId, {
      t: 'ability.state',
      d: {
        abilities: classAbilities(this.gameData, p.classId).map((a) => ({
          abilityId: a.id,
          unlocked: abilityAvailability(this.gameData, a.id, p.classId, p.level).ok,
          readyAt: p.cooldowns.get(a.id) ?? 0,
        })),
        globalReadyAt: p.globalReadyAtMs,
        serverTime: nowMs,
        newlyUnlocked,
      },
    });
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
    if (nowMs >= this.nextPartyUpdate) {
      this.parties.expire(nowMs);
      this.syncParties();
      this.nextPartyUpdate = nowMs + 1000;
    }
    this.tickCount++;
    const dtMs =
      this.lastStepMs === null ? 0 : Math.min(1000, Math.max(0, nowMs - this.lastStepMs));
    this.lastStepMs = nowMs;
    for (let i = this.respawnQueue.length - 1; i >= 0; i--) {
      const r = this.respawnQueue[i]!;
      if (r.atMs <= nowMs) {
        this.respawnQueue.splice(i, 1);
        this.spawnFromPoint(r.spawn, nowMs);
      }
    }

    this.stepGroups(nowMs);
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

  private spawnFromPoint(
    spawn: SpawnPoint,
    nowMs: number = this.lastStepMs ?? Date.now(),
  ): string | null {
    if (spawn.kind === 'npc') {
      const def = this.gameData.npcs.get(spawn.refId)!;
      const id = this.newEntityId();
      this.npcSpawns.set(id, spawn);
      this.addEntity({
        id,
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
      if (!def.combat) return null;
      const at = this.collision.nearestFree(spawn.position, ENEMY_COLLISION_RADIUS);
      const entity: WorldEntity = {
        id: this.newEntityId(),
        kind: 'enemy',
        name: def.name,
        position: { x: at.x, y: 0, z: at.z },
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
        killId: null,
        respawnAtMs: 0,
        path: null,
        pathGoal: { x: 0, z: 0 },
        repathAtMs: 0,
        bestDist: Infinity,
        lastProgressAtMs: nowMs,
        wanderTarget: null,
        nextWanderAtMs: nowMs + 1000 + this.rng.next() * 5000,
      });
      this.addEntity(entity);
      return entity.id;
    }
    // 'resource_node' spawns are defined in data but not simulated yet.
    return null;
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

  /** Authoritative line of sight from the zone's collision world (sight-blocking colliders only). */
  private hasLineOfSight(from: Vec3, to: Vec3): boolean {
    return this.collision.hasLineOfSight(from, to);
  }

  /** Nearest respawn point (graveyard/waystone) to where the player died; zone default otherwise. */
  private respawnPointFor(p: PlayerState): Vec3 {
    const points = this.zone.respawnPoints.length
      ? this.zone.respawnPoints.map((r) => r.position)
      : [this.zone.defaultSpawn];
    const best = points.reduce((a, b) =>
      distance2D(a, p.position) <= distance2D(b, p.position) ? a : b,
    );
    const free = this.collision.nearestFree(best, PLAYER_COLLISION_RADIUS);
    return { x: free.x, y: 0, z: free.z };
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
      if (enemy.mode === 'dying') continue; // death is being made durable; confirmKill stops attackers
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
      this.hitEnemy(p, enemy, entity, result.outcome, result.damage, nowMs, null);
    }
  }

  /** Applies a player's swing or ability result to an enemy (tagging, aggro, damage, death). */
  private hitEnemy(
    p: PlayerState,
    enemy: EnemyState,
    entity: WorldEntity,
    outcome: 'hit' | 'crit' | 'miss',
    damage: number,
    nowMs: number,
    abilityId: string | null,
  ): void {
    // Aggro + tag: the first character to damage an enemy owns the kill.
    if (!enemy.taggedBy) {
      enemy.taggedBy = p.characterId;
      enemy.tagCohort = this.parties.cohort(p.characterId);
    }
    if (enemy.mode !== 'engaged' || !enemy.targetCharacterId)
      this.engage(enemy, p.characterId, nowMs);
    const { health, killed } = applyDamage(enemy.health, damage);
    enemy.health = health;
    entity.health = health;
    this.toKnowers(enemy.entityId, {
      t: 'combat.damage',
      d: {
        sourceId: p.entityId,
        targetId: enemy.entityId,
        outcome,
        amount: damage,
        targetHealth: health,
        targetMaxHealth: enemy.maxHealth,
        abilityId,
      },
    });
    if (killed) this.enemyDying(enemy, p, nowMs);
  }

  /** Health hit 0: freeze the enemy and queue a write-ahead kill event for the host to persist. */
  private enemyDying(enemy: EnemyState, killer: PlayerState, nowMs: number): void {
    if (this.entities.get(enemy.entityId)?.attackCue) this.cue(enemy, null);
    enemy.mode = 'dying';
    enemy.targetCharacterId = null;
    enemy.path = null;
    const killId = uuidv7();
    enemy.killId = killId;
    const group = enemy.spawn.groupId ? this.groups.get(enemy.spawn.groupId) : undefined;
    const delay = group
      ? group.def.respawnMs.min +
        Math.floor(this.rng.next() * (group.def.respawnMs.max - group.def.respawnMs.min + 1))
      : (enemy.spawn.respawnMs ?? 0);
    enemy.respawnAtMs = nowMs + Math.max(delay, enemy.def.combat.corpseMs);
    const tag = enemy.taggedBy ?? killer.characterId;
    const distribution = this.parties.rewards(
      tag,
      enemy.tagCohort,
      this.entities.get(enemy.entityId)!.position,
    );
    this.kills.push({
      ...distribution,
      killId,
      enemyId: enemy.def.id,
      enemyName: enemy.def.name,
      enemyEntityId: enemy.entityId,
      characterId: enemy.taggedBy ?? killer.characterId,
      zoneId: this.zone.id,
      spawnPointId: enemy.spawn.id,
      groupId: enemy.spawn.groupId,
      diedAtMs: nowMs,
      respawnAtMs: enemy.respawnAtMs,
    });
  }

  /**
   * Spawn-group population control (checked every tick, no timers): fill free capacity once a
   * slot's respawn time has passed, on a random free point with no player too close.
   */
  private stepGroups(nowMs: number): void {
    for (const g of this.groups.values()) {
      g.pending = g.pending.filter((t) => t > nowMs);
      let capacity = g.def.maxAlive - g.alive.size - g.pending.length;
      if (capacity <= 0) continue;
      const occupied = new Set([...g.alive].map((id) => this.enemies.get(id)?.spawn.id));
      const candidates = g.points.filter(
        (pt) =>
          !occupied.has(pt.id) &&
          [...this.players.values()].every(
            (p) => distance2D(p.position, pt.position) >= g.def.minPlayerDistance,
          ),
      );
      while (capacity > 0 && candidates.length > 0) {
        const pick = candidates.splice(Math.floor(this.rng.next() * candidates.length), 1)[0]!;
        const id = this.spawnFromPoint(pick, nowMs);
        if (id) g.alive.add(id);
        capacity--;
      }
    }
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
  private cue(enemy: EnemyState, endsAtMs: number | null): void {
    const entity = this.entities.get(enemy.entityId);
    if (!entity) return;
    entity.attackCue =
      endsAtMs === null
        ? null
        : { endsAtMs, range: enemy.def.combat.attackRange + this.rules.rangeTolerance };
    this.toKnowers(enemy.entityId, { t: 'entity.spawn', d: { entity: { ...entity } } });
  }

  private disengage(e: EnemyState, nowMs: number = this.lastStepMs ?? 0): void {
    if (e.mode === 'dead' || e.mode === 'dying') return;
    if (this.entities.get(e.entityId)?.attackCue) this.cue(e, null);
    e.mode = 'returning';
    e.targetCharacterId = null;
    e.path = null;
    e.bestDist = Infinity;
    e.lastProgressAtMs = nowMs;
  }

  /**
   * Moves an enemy toward `goal`: straight when the swept path is clear, otherwise along an A*
   * path (repathed at most every 750 ms or when the goal moves > 2 m). Every step goes through
   * collide-and-slide, so enemies never enter obstacles. Returns the remaining straight-line
   * distance, or -1 when the goal is unreachable.
   */
  private steer(
    enemy: EnemyState,
    goal: XZ,
    speed: number,
    dtMs: number,
    nowMs: number,
    stopAt: number,
  ): number {
    const entity = this.entities.get(enemy.entityId)!;
    const pos = entity.position;
    const dist = distance2D(pos, goal);
    if (dist <= stopAt) return dist;
    let waypoint: XZ = goal;
    const direct = !this.collision.sweepBlocked(pos, goal, ENEMY_COLLISION_RADIUS * 0.9);
    if (direct) {
      enemy.path = null;
    } else {
      if (!enemy.path || nowMs >= enemy.repathAtMs || distance2D(enemy.pathGoal, goal) > 2) {
        enemy.path = this.nav.findPath(pos, goal);
        enemy.pathGoal = { x: goal.x, z: goal.z };
        enemy.repathAtMs = nowMs + 750;
      }
      if (!enemy.path || enemy.path.length === 0) return -1;
      while (enemy.path.length > 1 && distance2D(pos, enemy.path[0]!) < 0.4) enemy.path.shift();
      waypoint = enemy.path[0]!;
    }
    const d = distance2D(pos, waypoint);
    const move = Math.min((speed * dtMs) / 1000, direct ? Math.max(0, dist - stopAt) : d);
    if (move <= 1e-4 || d <= 1e-6) return dist;
    const next = {
      x: pos.x + ((waypoint.x - pos.x) / d) * move,
      z: pos.z + ((waypoint.z - pos.z) / d) * move,
    };
    const slid = this.collision.slide(pos, next, ENEMY_COLLISION_RADIUS);
    if (slid.x !== pos.x || slid.z !== pos.z) {
      entity.position = { x: slid.x, y: 0, z: slid.z };
      entity.rotationY = Math.atan2(waypoint.x - pos.x, waypoint.z - pos.z);
      this.movedThisTick.add(enemy.entityId);
    }
    return distance2D(entity.position, goal);
  }

  /** Tracks progress toward a goal; returns true when the enemy has been stuck for `limitMs`. */
  private stuck(enemy: EnemyState, dist: number, nowMs: number, limitMs: number): boolean {
    if (dist < enemy.bestDist - 0.5) {
      enemy.bestDist = dist;
      enemy.lastProgressAtMs = nowMs;
    }
    return nowMs - enemy.lastProgressAtMs > limitMs;
  }

  private engage(enemy: EnemyState, characterId: string, nowMs: number): void {
    enemy.mode = 'engaged';
    enemy.targetCharacterId = characterId;
    enemy.bestDist = Infinity;
    enemy.lastProgressAtMs = nowMs;
    enemy.wanderTarget = null;
  }

  /** Back at (or snapped to) its spawn point: evade reset to full health. */
  private resetHome(enemy: EnemyState, entity: WorldEntity, snap: boolean, nowMs: number): void {
    if (snap) {
      const home = this.collision.nearestFree(enemy.spawn.position, ENEMY_COLLISION_RADIUS);
      entity.position = { x: home.x, y: 0, z: home.z };
      this.movedThisTick.add(enemy.entityId);
    }
    enemy.mode = 'idle';
    enemy.path = null;
    enemy.taggedBy = null;
    delete enemy.tagCohort;
    enemy.health = enemy.maxHealth;
    enemy.nextWanderAtMs = nowMs + 3000 + this.rng.next() * 5000;
    this.syncEntityHealth(enemy.entityId, enemy.health, enemy.maxHealth, false);
  }

  private stepEnemies(nowMs: number, dtMs: number): void {
    for (const enemy of this.enemies.values()) {
      const c = enemy.def.combat;
      const entity = this.entities.get(enemy.entityId);
      if (enemy.mode === 'dead') {
        if (!enemy.corpseRemoved && nowMs - enemy.diedAtMs >= c.corpseMs) {
          enemy.corpseRemoved = true;
          this.despawnEntity(enemy.entityId, 'died');
          this.enemies.delete(enemy.entityId);
        }
        continue;
      }
      if (enemy.mode === 'dying' || !entity) continue;

      if (enemy.mode === 'idle') {
        // Aggro: nearest living player within range that the enemy can actually see.
        if (c.aggroRange > 0) {
          let best: PlayerState | undefined;
          let bestD = Infinity;
          for (const p of this.players.values()) {
            if (p.dead) continue;
            const d = distance2D(p.position, entity.position);
            if (
              d <= c.aggroRange &&
              d < bestD &&
              this.hasLineOfSight(entity.position, p.position)
            ) {
              best = p;
              bestD = d;
            }
          }
          if (best) {
            this.engage(enemy, best.characterId, nowMs);
            continue;
          }
        }
        // Wander around the spawn point now and then (life, not a combat test room).
        if (enemy.spawn.wanderRadius > 0) {
          if (!enemy.wanderTarget && nowMs >= enemy.nextWanderAtMs) {
            const a = this.rng.next() * Math.PI * 2;
            const r = this.rng.next() * enemy.spawn.wanderRadius;
            const t = {
              x: enemy.spawn.position.x + Math.cos(a) * r,
              z: enemy.spawn.position.z + Math.sin(a) * r,
            };
            if (
              !this.collision.overlaps(t, ENEMY_COLLISION_RADIUS) &&
              !this.collision.sweepBlocked(entity.position, t, ENEMY_COLLISION_RADIUS)
            )
              enemy.wanderTarget = t;
            enemy.nextWanderAtMs = nowMs + 4000 + this.rng.next() * 6000;
          }
          if (enemy.wanderTarget) {
            const left = this.steer(
              enemy,
              enemy.wanderTarget,
              c.moveSpeed * 0.35,
              dtMs,
              nowMs,
              0.2,
            );
            if (left <= 0.3) enemy.wanderTarget = null;
          }
        }
        continue;
      }

      if (enemy.mode === 'returning') {
        const left = this.steer(enemy, enemy.spawn.position, c.moveSpeed * 1.5, dtMs, nowMs, 0.2);
        if (left >= 0 && left <= 0.5) this.resetHome(enemy, entity, false, nowMs);
        else if (left < 0 || this.stuck(enemy, left, nowMs, 6000))
          this.resetHome(enemy, entity, true, nowMs);
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
        this.disengage(enemy, nowMs);
        continue;
      }
      const dist = distance2D(entity.position, target.position);
      const canHit =
        isInRange(dist, c.attackRange, this.rules.rangeTolerance) &&
        this.hasLineOfSight(entity.position, target.position);
      // A committed wind-up holds position. At resolution recheck range/LOS; moving away dodges.
      // The cue is in the durable entity image, so reconnect/recovery cannot skip the warning.
      const cue = entity.attackCue;
      if (cue && nowMs < cue.endsAtMs) continue;
      if (cue) {
        this.cue(enemy, null);
        enemy.nextAttackAtMs = nowMs + c.attackSpeedMs;
        if (!canHit) continue;
      }
      if (!canHit) {
        const left = this.steer(
          enemy,
          target.position,
          c.moveSpeed,
          dtMs,
          nowMs,
          c.attackRange * 0.8,
        );
        if (left < 0 || this.stuck(enemy, left, nowMs, 5000)) this.disengage(enemy, nowMs);
        continue;
      }
      enemy.lastProgressAtMs = nowMs;
      this.face(enemy.entityId, entity.position, target.position);
      if (!cue) {
        if (!isAttackReady(enemy.nextAttackAtMs, nowMs)) continue;
        if (c.windupMs) {
          this.cue(enemy, nowMs + c.windupMs);
          continue;
        }
        enemy.nextAttackAtMs = nextSwingAt(enemy.nextAttackAtMs, nowMs, c.attackSpeedMs);
      }
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
      if (!killed) this.sendVitals(target, nowMs);
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
