import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { Scene } from '@babylonjs/core/scene';
import { getGameData } from '@mmo/game-data';
import { RealtimeClient } from '@mmo/networking';
import type { PlayerCharacter } from '@mmo/schemas';
import type { ApiClient } from '../api';
import { config } from '../config';
import { Hud } from '../hud/hud';
import { EntityViews } from './entity-view';
import { PlayerController } from './player-controller';
import { createEngine } from './renderer';
import { WorldView } from './world-view';

const INTERACT_RANGE = 3;

/**
 * Wires the 3D scene to the realtime connection. Flow for the technical proof:
 *  1. connect + auth.hello  -> auth.ok, zone.snapshot, inventory.snapshot
 *  2. WASD                  -> move.input (server validates; may send move.correction)
 *  3. E near a pickup       -> interact.pickup -> server validates range + claim -> DB -> inventory.updated
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
  const hud = new Hud(args.ui, gameData);
  const net = new RealtimeClient(config.realtimeUrl);

  // Expose minimal state for automated browser checks (dev builds only).
  const debug = { connected: false, entityId: '', inventoryCount: 0, lastError: '' };
  if (import.meta.env.DEV) (window as unknown as { __mmo: typeof debug }).__mmo = debug;

  const authOk = new Promise<{ entityId: string; character: PlayerCharacter; zoneId: string }>(
    (resolve) => {
      net.on('auth.ok', (m) => resolve(m.d));
    },
  );
  net.on('error', (m) => {
    debug.lastError = m.d.code;
    hud.addLog(`${m.d.code}: ${m.d.message}`, true);
  });
  net.onClose = (code, reason) => {
    debug.connected = false;
    hud.addLog(`Disconnected (${code} ${reason})`, true);
  };
  await net.connect({ token: args.token, characterId: args.character.id, client: 'game_web' });
  const joined = await authOk;
  debug.connected = true;
  debug.entityId = joined.entityId;

  new WorldView(scene, gameData).loadZone(joined.zoneId);
  const entities = new EntityViews(scene, joined.entityId);
  const speed = gameData.characterClass(joined.character.classId).baseStats.movement_speed ?? 6;
  const player = new PlayerController(
    scene,
    args.canvas,
    joined.character.position,
    speed,
    (position, rotationY) => net.send('move.input', { position, rotationY }),
  );

  net.on('zone.snapshot', (m) => m.d.entities.forEach((e) => entities.upsert(e)));
  net.on('entity.spawn', (m) => entities.upsert(m.d.entity));
  net.on('entity.despawn', (m) => entities.remove(m.d.entityId));
  net.on('world.moves', (m) =>
    m.d.moves.forEach(([id, x, y, z, r]) => entities.move(id, x, y, z, r)),
  );
  net.on('move.correction', (m) => {
    player.correct(m.d.position, m.d.rotationY);
    hud.addLog(`Position corrected by server (${m.d.reason})`, true);
  });
  net.on('presence.update', (m) => hud.addLog(`${m.d.name} ${m.d.event} the zone`));
  net.on('chat.message', (m) => hud.addLog(`[${m.d.channel}] ${m.d.from.name}: ${m.d.text}`));
  net.on('inventory.snapshot', (m) => {
    hud.setInventory(m.d.items);
    debug.inventoryCount = m.d.items.containers.reduce((n, c) => n + c.items.length, 0);
  });
  net.on('inventory.updated', (m) => {
    hud.applyUpdate(m.d.items);
    debug.inventoryCount += m.d.items.filter((i) => i.instance.version === 0).length;
    for (const i of m.d.items)
      hud.addLog(`Received ${i.template.name} (id ${i.instance.id.slice(0, 8)}…)`);
  });

  window.addEventListener('keydown', (e) => {
    if (e.code !== 'KeyE') return;
    const pickup = entities.nearest('pickup', player.position, INTERACT_RANGE);
    if (pickup) {
      net.send('interact.pickup', { entityId: pickup.id });
      return;
    }
    const npc = entities.nearest('npc', player.position, INTERACT_RANGE + 1);
    if (npc?.refId) {
      const def = gameData.npcs.get(npc.refId);
      if (def)
        hud.addLog(
          `${def.name}: “${def.dialogue[Math.floor(Math.random() * def.dialogue.length)]}”`,
        );
    }
  });

  hud.setStatus(
    `<strong>${args.character.name}</strong> · ${gameData.characterClass(args.character.classId).name} · ${gameData.zone(joined.zoneId).name}<br/>` +
      `Renderer: ${kind} · WASD move · drag to look · wheel zoom · E interact`,
  );

  engine.runRenderLoop(() => {
    const dt = engine.getDeltaTime() / 1000;
    player.update(dt);
    entities.update(dt);
    const pickup = entities.nearest('pickup', player.position, INTERACT_RANGE);
    const npc = pickup ? undefined : entities.nearest('npc', player.position, INTERACT_RANGE + 1);
    hud.setPrompt(
      pickup ? `Press E to pick up ${pickup.name}` : npc ? `Press E to talk to ${npc.name}` : null,
    );
    scene.render();
  });
  window.addEventListener('resize', () => engine.resize());
  setInterval(() => net.send('ping', { clientTime: performance.now() }), 15_000);
}
