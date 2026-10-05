import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { Scene } from '@babylonjs/core/scene';
import { getGameData } from '@mmo/game-data';
import { formatCurrency } from '@mmo/ui';
import { RealtimeClient } from '@mmo/networking';
import type { PlayerCharacter } from '@mmo/schemas';
import type { ApiClient } from '../api';
import { config } from '../config';
import { GameState } from '../state/game-state';
import { ItemActions } from '../state/item-actions';
import { CombatActions } from '../state/combat-actions';
import { QuestActions } from '../state/quest-actions';
import type { EntityInfo } from '../state/game-state';
// Side-effect import: enables scene picking (tree-shaken out of deep imports otherwise).
import '@babylonjs/core/Culling/ray';
import type { WorldEntity } from '@mmo/schemas';
import { mountGameUi } from '../ui/GameUI';
import { EntityViews, projectToScreen } from './entity-view';
import { Effects } from './effects';
import { FloatingText } from './floating-text';
import { AnalogInput } from './analog-input';
import { PlayerController } from './player-controller';
import { createEngine } from './renderer';
import { WorldView } from './world-view';
import { travelAt } from '@mmo/game-data';

const INTERACT_RANGE = 3;

/**
 * Wires the 3D scene, the realtime connection and the React UI.
 *  - connect + auth.hello      -> auth.ok, inventory/stats/wallet snapshots, zone.snapshot
 *  - WASD                      -> move.input (server validates; may send move.correction)
 *  - E near a pickup           -> interact.pickup -> DB -> inventory.updated
 *  - UI item actions           -> HTTP API -> DB -> change feed -> inventory.updated + character.stats
 *  - dropped socket            -> automatic reconnect; every auth.ok rebuilds the view from snapshots
 */
export async function startGame(args: {
  canvas: HTMLCanvasElement;
  ui: HTMLElement;
  api: ApiClient;
  token: string;
  character: PlayerCharacter;
}) {
  const gameData = getGameData();
  const { engine, kind } = await createEngine(args.canvas);
  const scene = new Scene(engine);
  const light = new HemisphericLight('sun', new Vector3(0.3, 1, 0.2), scene);
  light.groundColor = new Color3(0.3, 0.3, 0.35);

  const state = new GameState(args.character);
  state.renderer = kind;
  const actions = new ItemActions(args.api, state, gameData);
  const net = new RealtimeClient(config.realtimeUrl);
  const combat = new CombatActions(net, state);
  const questActions = new QuestActions(net, state);
  const analog = new AnalogInput();
  const floating = new FloatingText();
  const effects = new Effects(scene);
  let zoneId: string | null = null;
  /** E key / touch "Interact" button: pick up a nearby item or talk to a nearby NPC. */
  const interact = () => {
    if (!entities || !player || state.vitals?.dead) return;
    if (zoneId && travelAt(gameData.raw.worldCatalog, zoneId, player.position).length) {
      state.update((s) => s.open.add('world'));
      return;
    }
    const pickup =
      entities.nearest('resource_node', player.position, INTERACT_RANGE) ??
      entities.nearest('pickup', player.position, INTERACT_RANGE);
    if (pickup) {
      net.send('interact.pickup', { entityId: pickup.id });
      return;
    }
    // NPCs: the server validates entity + range and answers with npc.dialogue
    const npc = entities.nearest('npc', player.position, INTERACT_RANGE + 1);
    if (npc) questActions.talk(npc.id);
  };
  /** Tab / touch "Next target" button: cycle to the nearest other living enemy. */
  const targetNearest = () => {
    if (!entities || !player) return;
    const enemy =
      entities.nearest('enemy', player.position, 40, (x) => !x.dead && x.id !== state.target.id) ??
      entities.nearest('enemy', player.position, 40, (x) => !x.dead);
    if (enemy) combat.target(enemy.id);
  };
  mountGameUi(args.ui, {
    state,
    actions,
    combat,
    quests: questActions,
    party: {
      invite: (characterId) => net.send('party.invite', { characterId }),
      respond: (invitationId, accept) => net.send('party.respond', { invitationId, accept }),
      leave: () => {
        if (state.party.partyId) net.send('party.leave', { partyId: state.party.partyId });
      },
      disband: () => {
        if (state.party.partyId) net.send('party.disband', { partyId: state.party.partyId });
      },
    },
    gameData,
    controls: {
      analog,
      travel: (travelId) => net.send('world.travel', { travelId }),
      interact,
      targetNearest,
      zoneId: () => zoneId,
      position: () =>
        player
          ? { x: player.position.x, z: player.position.z, rotationY: player.mesh.rotation.y }
          : null,
      markers: () => entities?.markers() ?? [],
    },
  });
  exposeDebug(
    state,
    net,
    (id) => entities?.screenPosition(id, scene) ?? null,
    () => player,
    () => entities?.markers() ?? [],
    () => ({
      loadedChunks: worldView.loadedChunkCount,
      meshes: scene.meshes.length,
      materials: scene.materials.length,
      textures: scene.textures.length,
      activeMeshes: scene.getActiveMeshes().length,
      entities: entities?.markers().length ?? 0,
    }),
  );

  const info = (e: WorldEntity): EntityInfo => ({
    id: e.id,
    kind: e.kind,
    characterId: e.characterId,
    name: e.name,
    level: e.level,
    health: e.health,
    maxHealth: e.maxHealth,
    dead: e.dead,
    hostile: e.hostile,
    attackCue: e.attackCue,
    refId: e.refId,
  });
  const patchEntity = (id: string, patch: Partial<EntityInfo>) => {
    const cur = state.world.get(id);
    if (cur) state.world.set(id, { ...cur, ...patch });
    if (patch.dead !== undefined) entities?.setDead(id, patch.dead);
    state.emit();
  };
  const combatLine = (text: string, kind: 'info' | 'error' = 'info') => {
    state.combatLine = { text, kind };
    state.addLog(text, kind);
  };

  net.onStatus((status, info) => {
    state.update((s) => {
      s.connection = status;
      s.reconnects = net.reconnects;
    });
    if (status === 'reconnecting')
      state.addLog(`Connection lost (${info.code ?? '?'}); retrying…`, 'error');
    if (status === 'closed' && info.code !== undefined && info.code !== 1000)
      state.addLog(`Disconnected: ${info.reason || info.code}`, 'error');
  });
  net.on('error', (m) => {
    state.addLog(`${m.d.code}: ${m.d.message}`, 'error');
    if (m.ack !== undefined) state.toast(m.d.message, 'error');
  });

  const worldView = new WorldView(scene, gameData);
  let entities: EntityViews | undefined;
  let player: PlayerController | undefined;
  let firstJoin: ((v: void) => void) | undefined;
  const joined = new Promise<void>((r) => (firstJoin = r));

  net.on('auth.ok', (m) => {
    const changedZone = zoneId !== m.d.zoneId;
    zoneId = m.d.zoneId;
    if (changedZone) worldView.loadZone(m.d.zoneId);
    state.update((s) => {
      s.character = m.d.character;
      s.zoneName = gameData.zone(m.d.zoneId).name;
      s.myEntityId = m.d.entityId;
      s.serverOffsetMs = m.d.serverTime - Date.now();
      s.world.clear();
      s.target = { id: null, attacking: false };
      s.dialogue = null;
    });
    if (!entities) {
      entities = new EntityViews(scene, m.d.entityId);
      const speed = gameData.characterClass(m.d.character.classId).baseStats.movement_speed ?? 6;
      player = new PlayerController(
        scene,
        args.canvas,
        m.d.character.position,
        speed,
        (position, rotationY) => net.send('move.input', { position, rotationY }),
        gameData.collisionWorld(m.d.zoneId),
        analog,
      );
      firstJoin?.();
    } else {
      // Reconnected: the server sends fresh snapshots; drop everything we knew about the world.
      entities.reset(m.d.entityId);
      player?.correct(m.d.character.position, 0);
      state.addLog(changedZone ? `Arrived in ${gameData.zone(m.d.zoneId).name}` : 'Reconnected');
    }
    const z = gameData.zone(m.d.zoneId),
      b = z.bounds,
      size = z.chunkSize;
    player?.changeZone(gameData.collisionWorld(m.d.zoneId), {
      minX: b.minCx * size,
      minZ: b.minCz * size,
      maxX: (b.maxCx + 1) * size,
      maxZ: (b.maxCz + 1) * size,
    });
    worldView.update(m.d.character.position);
  });
  net.on('zone.snapshot', (m) => {
    for (const e of m.d.entities) {
      entities?.upsert(e);
      state.world.set(e.id, info(e));
    }
    state.emit();
  });
  net.on('entity.spawn', (m) => {
    entities?.upsert(m.d.entity);
    state.world.set(m.d.entity.id, info(m.d.entity));
    state.emit();
  });
  net.on('entity.despawn', (m) => {
    entities?.remove(m.d.entityId);
    state.world.delete(m.d.entityId);
    state.emit();
  });
  // ---- combat (server results only) ----
  net.on('combat.state', (m) => {
    state.update((s) => (s.target = { id: m.d.targetId, attacking: m.d.attacking }));
    entities?.setTarget(m.d.targetId);
    if (m.d.reason === 'out_of_range') combatLine('Target out of range', 'error');
    if (m.d.reason === 'target_dead') combatLine('Target is dead');
  });
  net.on('combat.damage', (m) => {
    if (m.d.sourceId === state.myEntityId) {
      const at = entities?.meshPosition(m.d.targetId);
      if (at) player?.face(at);
      player?.actor.attack();
    } else entities?.attack(m.d.sourceId);
    if (m.d.outcome !== 'miss') entities?.flash(m.d.targetId);
    if (m.d.targetId === state.myEntityId)
      state.update((s) => {
        if (s.vitals)
          s.vitals = { ...s.vitals, health: m.d.targetHealth, maxHealth: m.d.targetMaxHealth };
      });
    patchEntity(m.d.targetId, { health: m.d.targetHealth, maxHealth: m.d.targetMaxHealth });
    if (m.d.sourceId === state.myEntityId || m.d.targetId === state.myEntityId) {
      const onMe = m.d.targetId === state.myEntityId;
      const at = onMe
        ? player && projectToScreen(scene, player.position.add(new Vector3(0, 1.2, 0)))
        : entities?.screenPosition(m.d.targetId, scene);
      if (at)
        floating.spawn(
          at,
          m.d.outcome === 'miss' ? 'Miss' : String(m.d.amount),
          m.d.outcome === 'miss'
            ? 'miss'
            : onMe
              ? 'taken'
              : m.d.outcome === 'crit'
                ? 'crit'
                : 'dealt',
        );
      if (m.d.outcome !== 'miss' && !onMe) entities?.flash(m.d.targetId);
    }
    const ability = m.d.abilityId ? gameData.abilities.get(m.d.abilityId) : undefined;
    if (ability?.visual === 'projectile' && entities) {
      const from =
        m.d.sourceId === state.myEntityId ? player?.position : entities.meshPosition(m.d.sourceId);
      const to = entities.meshPosition(m.d.targetId);
      if (from && to) effects.projectile(from, to, ability.icon.color);
    }
    if (state.world.get(m.d.sourceId)?.refId === 'enemy.greenvale.hollow_lantern' && entities) {
      const from = entities.meshPosition(m.d.sourceId);
      const to =
        m.d.targetId === state.myEntityId ? player?.position : entities.meshPosition(m.d.targetId);
      if (from && to) effects.projectile(from, to, '#ba80ef');
    }
    const src = state.nameOf(m.d.sourceId);
    const dst = state.nameOf(m.d.targetId);
    const mine = m.d.sourceId === state.myEntityId || m.d.targetId === state.myEntityId;
    if (!mine) return;
    const verb =
      m.d.sourceId === state.myEntityId
        ? m.d.outcome === 'crit'
          ? 'critically hit'
          : 'hit'
        : m.d.outcome === 'crit'
          ? 'critically hits'
          : 'hits';
    const by = ability ? `${src === 'You' ? 'Your' : `${src}'s`} ${ability.name}` : src;
    const v = ability
      ? verb.replace(/^hit$/, 'hits').replace(/^critically hit$/, 'critically hits')
      : verb;
    combatLine(
      m.d.outcome === 'miss'
        ? `${by} ${ability ? 'misses' : m.d.sourceId === state.myEntityId ? 'miss' : 'misses'} ${dst === 'You' ? 'you' : dst}`
        : `${by} ${v} ${dst === 'You' ? 'you' : dst} for ${m.d.amount}`,
      m.d.targetId === state.myEntityId ? 'error' : 'info',
    );
  });
  net.on('ability.state', (m) => {
    const offset = Date.now() - m.d.serverTime; // server -> local clock for countdowns
    state.update((s) => {
      s.abilities = m.d.abilities.map((a) => ({
        abilityId: a.abilityId,
        unlocked: a.unlocked,
        readyAtLocal: a.readyAt > 0 ? a.readyAt + offset : 0,
      }));
      s.globalReadyAtLocal = m.d.globalReadyAt > 0 ? m.d.globalReadyAt + offset : 0;
    });
    for (const id of m.d.newlyUnlocked) {
      const name = gameData.abilities.get(id)?.name ?? id;
      state.toast(`New ability unlocked: ${name}`);
      state.addLog(`You learned ${name}`);
    }
  });
  net.on('entity.health', (m) =>
    patchEntity(m.d.entityId, { health: m.d.health, maxHealth: m.d.maxHealth, dead: m.d.dead }),
  );
  net.on('combat.death', (m) => {
    patchEntity(m.d.entityId, { dead: true, health: 0 });
    if (m.d.entityId === state.myEntityId) combatLine('You died', 'error');
    else if (m.d.killerId === state.myEntityId)
      combatLine(`You killed ${state.nameOf(m.d.entityId)}`);
  });
  net.on('player.vitals', (m) => {
    state.update((s) => (s.vitals = m.d));
    player?.setEnabled(!m.d.dead);
  });
  net.on('character.progress', (m) => {
    state.update((s) => {
      s.progress = { level: m.d.level, xp: m.d.xp, xpToNext: m.d.xpToNext };
      s.character = { ...s.character, level: m.d.level };
    });
    if (m.d.xpGained > 0) {
      state.addLog(`You gain ${m.d.xpGained} experience`);
      const at = player && projectToScreen(scene, player.position.add(new Vector3(0, 1.5, 0)));
      if (at) floating.spawn(at, `+${m.d.xpGained} XP`, 'xp');
    }
    if (m.d.levelsGained > 0) state.toast(`Level up! You are now level ${m.d.level}`);
  });
  net.on('combat.loot', (m) => {
    // One entry per visible stack: a drop merged into a stack the same kill just created is
    // reported as the final stack, not twice; merged-away rows are not shown.
    const stacks = new Map(m.d.items.map((i) => [i.instance.id, i]));
    const shown = [...stacks.values()].filter((i) => i.instance.location.kind !== 'destroyed');
    const parts = shown.map((i) =>
      i.instance.quantity > 1 ? `${i.template.name} ×${i.instance.quantity}` : i.template.name,
    );
    const gold = gameData.currencies.get('gold');
    if (m.d.gold > 0 && gold) parts.push(`${m.d.gold}c`);
    const from = m.d.recovered ? `${m.d.enemyName} (recovered)` : m.d.enemyName;
    if (parts.length) state.toast(`Loot from ${from}: ${parts.join(', ')}`);
    if (m.d.mailedItems.length)
      state.toast(
        `Bags full — ${m.d.mailedItems.length} item(s) sent to Recovered loot (open your bags)`,
        'info',
      );
    state.addLog(`Looted ${parts.join(', ') || 'nothing'}`);
  });
  // ---- NPCs and quests (server state only) ----
  net.on('npc.dialogue', (m) => state.update((s) => (s.dialogue = m.d)));
  net.on('quest.log', (m) => {
    state.update((s) => (s.quests = m.d.quests));
    for (const e of m.d.events) {
      const q = m.d.quests.find((x) => x.questId === e.questId);
      if (!q) continue;
      const o = e.objectiveId ? q.objectives.find((x) => x.id === e.objectiveId) : undefined;
      if (e.kind === 'accepted') state.toast(`Quest accepted: ${q.name}`);
      else if (e.kind === 'progress' && o) state.addLog(`${o.label}: ${o.current} / ${o.required}`);
      else if (e.kind === 'objective_complete' && o)
        state.toast(`${o.label}: ${o.current} / ${o.required} — complete`);
      else if (e.kind === 'ready') {
        const npc = q.turnInNpcId ? gameData.npcs.get(q.turnInNpcId)?.name : undefined;
        state.toast(`${q.name}: return to ${npc ?? 'the quest giver'}`);
      }
    }
  });
  net.on('quest.completed', (m) => {
    const parts = [`+${m.d.xpGained} XP`];
    const gold = gameData.currencies.get('gold');
    if (m.d.gold > 0 && gold) parts.push(formatCurrency(gold, m.d.gold));
    for (const i of m.d.items) parts.push(i.template.name);
    state.toast(`Quest complete: ${m.d.name} — ${parts.join(', ')}`);
    state.addLog(`Quest complete: ${m.d.name} (${parts.join(', ')})`);
    if (m.d.mailedItems.length)
      state.toast('Your bags are full — the reward was sent to Recovered loot', 'info');
  });
  net.on('world.moves', (m) =>
    m.d.moves.forEach(([id, x, y, z, r]) => entities?.move(id, x, y, z, r)),
  );
  net.on('move.correction', (m) => {
    player?.correct(m.d.position, m.d.rotationY);
    state.addLog(`Position corrected by server (${m.d.reason})`, 'error');
  });
  net.on('party.update', (m) =>
    state.update((s) => {
      s.party = m.d;
    }),
  );
  net.on('presence.update', (m) => state.addLog(`${m.d.name} ${m.d.event} the zone`));
  net.on('chat.message', (m) => state.addLog(`[${m.d.channel}] ${m.d.from.name}: ${m.d.text}`));
  const updateWeapon = () =>
    player?.actor.setArmed(
      state.items
        .all()
        .some((i) => i.instance.location.kind === 'equipped' && i.template.category === 'weapon'),
    );
  net.on('inventory.snapshot', (m) => {
    state.items.replaceAll(m.d.items);
    updateWeapon();
  });
  net.on('inventory.updated', (m) => {
    const before = new Set(state.items.all().map((i) => i.instance.id));
    state.items.apply(m.d.items, m.d.removed);
    updateWeapon();
    if (m.d.reason === 'gather') {
      const names = [
        ...new Set(
          m.d.items
            .filter((i) => i.instance.location.kind !== 'destroyed')
            .map((i) => i.template.name),
        ),
      ];
      state.toast(`Gathered ${names.join(', ')} — patch regrowing`);
    }
    for (const i of m.d.items)
      if (!before.has(i.instance.id)) state.addLog(`Received ${i.template.name}`);
  });
  net.on(
    'character.stats',
    (m) => m.d.characterId === state.character.id && state.setStats(m.d.stats),
  );
  net.on('wallet.updated', (m) => state.update((s) => (s.balances = m.d.balances)));

  await net.connect({ token: args.token, characterId: args.character.id, client: 'game_web' });
  await joined;

  // Tap/click targeting. Each pointer is tracked on its own: a short press that barely moved is a
  // tap, anything else is a camera drag. (Babylon's POINTERTAP is suppressed whenever it thinks a
  // multi-touch gesture is in progress, which would break "tap a wolf while dragging the camera".)
  const presses = new Map<number, { x: number; y: number; at: number }>();
  args.canvas.addEventListener('pointerdown', (e) =>
    presses.set(e.pointerId, { x: e.clientX, y: e.clientY, at: performance.now() }),
  );
  args.canvas.addEventListener('pointercancel', (e) => presses.delete(e.pointerId));
  args.canvas.addEventListener('pointerup', (e) => {
    const down = presses.get(e.pointerId);
    presses.delete(e.pointerId);
    if (!down || !entities || e.button > 0) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    if (moved > 12 || performance.now() - down.at > 500) return;
    const rect = args.canvas.getBoundingClientRect();
    const pick = scene.pick(e.clientX - rect.left, e.clientY - rect.top);
    const picked = pick?.pickedMesh ? entities.entityIdOfMesh(pick.pickedMesh) : null;
    if (picked && state.world.get(picked)?.kind === 'npc') questActions.talk(picked);
    else if (picked) combat.target(picked);
    else if (state.target.id && !state.target.attacking) combat.target(null);
  });

  window.addEventListener('keydown', (e) => {
    if (
      e.target instanceof HTMLElement &&
      (e.target.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName))
    )
      return;
    if (e.code === 'Tab') {
      e.preventDefault();
      targetNearest();
    } else if (e.code === 'KeyE') interact();
  });

  let lastPrompt: string | null = null;
  engine.runRenderLoop(() => {
    const dt = engine.getDeltaTime() / 1000;
    if (!player || !entities) return;
    player.update(dt);
    worldView.update(player.position);
    entities.update(dt);
    effects.update(dt);
    const pickup =
      entities.nearest('resource_node', player.position, INTERACT_RANGE) ??
      entities.nearest('pickup', player.position, INTERACT_RANGE);
    const npc = pickup ? undefined : entities.nearest('npc', player.position, INTERACT_RANGE + 1);
    const passage = zoneId && travelAt(gameData.raw.worldCatalog, zoneId, player.position).length;
    const prompt = passage
      ? 'Press E to choose a passage'
      : pickup
        ? `Press E to ${pickup.kind === 'resource_node' ? 'gather' : 'pick up'} ${pickup.name}`
        : npc
          ? `Press E to talk to ${npc.name}`
          : null;
    if (prompt !== lastPrompt) state.update((s) => (s.prompt = lastPrompt = prompt));
    scene.render();
  });
  window.addEventListener('resize', () => engine.resize());
  // Browser chrome can change dvh without a layout-window resize on mobile.
  const viewportResize = new ResizeObserver(() => engine.resize());
  viewportResize.observe(args.canvas);
  scene.onDisposeObservable.addOnce(() => viewportResize.disconnect());
  setInterval(() => net.send('ping', { clientTime: performance.now() }), 15_000);
}

/** Read-only debug view for automated browser checks (dev builds only). */
function exposeDebug(
  state: GameState,
  net: RealtimeClient,
  screenPos: (entityId: string) => { x: number; y: number } | null,
  player: () => PlayerController | undefined,
  markers: () => { id: string; x: number; z: number }[],
  sceneCounts: () => {
    meshes: number;
    materials: number;
    textures: number;
    activeMeshes: number;
    entities: number;
  },
) {
  if (!import.meta.env.DEV) return;
  (window as unknown as { __mmo: unknown }).__mmo = {
    get sceneCounts() {
      return sceneCounts();
    },
    get connected() {
      return state.connection === 'open';
    },
    get status() {
      return state.connection;
    },
    get reconnects() {
      return net.reconnects;
    },
    get characterId() {
      return state.character.id;
    },
    get stats() {
      return state.stats?.total ?? null;
    },
    get items() {
      return state.items.all().map((i) => ({
        id: i.instance.id,
        templateId: i.template.id,
        version: i.instance.version,
        quantity: i.instance.quantity,
        location: i.instance.location,
      }));
    },
    get inventoryCount() {
      return state.items.all().length;
    },
    dropConnection: () => net.simulateDrop(),
    get myEntityId() {
      return state.myEntityId;
    },
    get vitals() {
      return state.vitals;
    },
    get progress() {
      return state.progress;
    },
    get target() {
      return state.target;
    },
    /** Live enemies/corpses as the client sees them. */
    get enemies() {
      return [...state.world.values()].filter((e) => e.kind === 'enemy');
    },
    /** CSS-pixel screen position of an entity (for automated taps on the canvas). */
    screenPos: screenPos,
    /** Turns the orbit camera to face an entity (automation aid; camera input is tested separately). */
    lookAt(id: string) {
      const m = markers().find((x) => x.id === id);
      const p = player();
      if (!m || !p) return false;
      p.camera.alpha = Math.atan2(p.position.z - m.z, p.position.x - m.x);
      return true;
    },
    /** Ability unlock/cooldown state exactly as the server reported it (local-clock ready times). */
    get abilities() {
      return {
        list: state.abilities,
        globalReadyAt: state.globalReadyAtLocal,
        classId: state.character.classId,
      };
    },
    /** Entity id of the first replicated NPC (Elder Maren in Greenvale). */
    get npcId() {
      return [...state.world.values()].find((e) => e.kind === 'npc')?.id ?? null;
    },
    /** Quest log and open dialogue exactly as the server sent them. */
    get quests() {
      return state.quests;
    },
    get dialogue() {
      return state.dialogue;
    },
    /** World position of a replicated entity. */
    entityPos(id: string) {
      const m = markers().find((x) => x.id === id);
      return m ? { x: m.x, z: m.z } : null;
    },
    /** Locally predicted player position. */
    get position() {
      const p = player();
      return p ? { x: p.position.x, z: p.position.z } : null;
    },
    /** Orbit camera yaw (changes when the view is dragged). */
    get cameraAlpha() {
      return player()?.camera.alpha ?? null;
    },
  };
}
