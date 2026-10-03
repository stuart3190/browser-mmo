import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { Scene } from '@babylonjs/core/scene';
import { getGameData } from '@mmo/game-data';
import { RealtimeClient } from '@mmo/networking';
import type { PlayerCharacter } from '@mmo/schemas';
import type { ApiClient } from '../api';
import { config } from '../config';
import { GameState } from '../state/game-state';
import { ItemActions } from '../state/item-actions';
import { mountGameUi } from '../ui/GameUI';
import { EntityViews } from './entity-view';
import { PlayerController } from './player-controller';
import { createEngine } from './renderer';
import { WorldView } from './world-view';

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
  mountGameUi(args.ui, { state, actions, gameData });

  const net = new RealtimeClient(config.realtimeUrl);
  exposeDebug(state, net);

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

  let entities: EntityViews | undefined;
  let player: PlayerController | undefined;
  let firstJoin: ((v: void) => void) | undefined;
  const joined = new Promise<void>((r) => (firstJoin = r));

  net.on('auth.ok', (m) => {
    state.update((s) => {
      s.character = m.d.character;
      s.zoneName = gameData.zone(m.d.zoneId).name;
    });
    if (!entities) {
      new WorldView(scene, gameData).loadZone(m.d.zoneId);
      entities = new EntityViews(scene, m.d.entityId);
      const speed = gameData.characterClass(m.d.character.classId).baseStats.movement_speed ?? 6;
      player = new PlayerController(
        scene,
        args.canvas,
        m.d.character.position,
        speed,
        (position, rotationY) => net.send('move.input', { position, rotationY }),
      );
      firstJoin?.();
    } else {
      // Reconnected: the server sends fresh snapshots; drop everything we knew about the world.
      entities.reset(m.d.entityId);
      player?.correct(m.d.character.position, 0);
      state.addLog('Reconnected');
    }
  });
  net.on('zone.snapshot', (m) => m.d.entities.forEach((e) => entities?.upsert(e)));
  net.on('entity.spawn', (m) => entities?.upsert(m.d.entity));
  net.on('entity.despawn', (m) => entities?.remove(m.d.entityId));
  net.on('world.moves', (m) =>
    m.d.moves.forEach(([id, x, y, z, r]) => entities?.move(id, x, y, z, r)),
  );
  net.on('move.correction', (m) => {
    player?.correct(m.d.position, m.d.rotationY);
    state.addLog(`Position corrected by server (${m.d.reason})`, 'error');
  });
  net.on('presence.update', (m) => state.addLog(`${m.d.name} ${m.d.event} the zone`));
  net.on('chat.message', (m) => state.addLog(`[${m.d.channel}] ${m.d.from.name}: ${m.d.text}`));
  net.on('inventory.snapshot', (m) => state.items.replaceAll(m.d.items));
  net.on('inventory.updated', (m) => {
    const before = new Set(state.items.all().map((i) => i.instance.id));
    state.items.apply(m.d.items, m.d.removed);
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

  window.addEventListener('keydown', (e) => {
    if (e.code !== 'KeyE' || !entities || !player) return;
    const pickup = entities.nearest('pickup', player.position, INTERACT_RANGE);
    if (pickup) {
      net.send('interact.pickup', { entityId: pickup.id });
      return;
    }
    const npc = entities.nearest('npc', player.position, INTERACT_RANGE + 1);
    const def = npc?.refId ? gameData.npcs.get(npc.refId) : undefined;
    if (def)
      state.addLog(
        `${def.name}: “${def.dialogue[Math.floor(Math.random() * def.dialogue.length)]}”`,
      );
  });

  let lastPrompt: string | null = null;
  engine.runRenderLoop(() => {
    const dt = engine.getDeltaTime() / 1000;
    if (!player || !entities) return;
    player.update(dt);
    entities.update(dt);
    const pickup = entities.nearest('pickup', player.position, INTERACT_RANGE);
    const npc = pickup ? undefined : entities.nearest('npc', player.position, INTERACT_RANGE + 1);
    const prompt = pickup
      ? `Press E to pick up ${pickup.name}`
      : npc
        ? `Press E to talk to ${npc.name}`
        : null;
    if (prompt !== lastPrompt) state.update((s) => (s.prompt = lastPrompt = prompt));
    scene.render();
  });
  window.addEventListener('resize', () => engine.resize());
  setInterval(() => net.send('ping', { clientTime: performance.now() }), 15_000);
}

/** Read-only debug view for automated browser checks (dev builds only). */
function exposeDebug(state: GameState, net: RealtimeClient) {
  if (!import.meta.env.DEV) return;
  (window as unknown as { __mmo: unknown }).__mmo = {
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
        location: i.instance.location,
      }));
    },
    get inventoryCount() {
      return state.items.all().length;
    },
    dropConnection: () => net.simulateDrop(),
  };
}
