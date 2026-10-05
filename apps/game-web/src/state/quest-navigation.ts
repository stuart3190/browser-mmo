import type { GameData } from '@mmo/game-data';
import { worldDestination } from '@mmo/game-data';
import type { QuestView } from '@mmo/schemas';

export interface QuestDestination {
  questId: string;
  questName: string;
  label: string;
  stage: 'objective' | 'turn_in' | 'offer';
  zoneId: string | null;
  position: { x: number; z: number } | null;
}
interface Marker {
  refId?: string | null | undefined;
  x: number;
  z: number;
  dead: boolean;
}

/** Guidance only: derives locations from content and already replicated entities, never credit.
 * Unknown/nonspatial objectives retain text without inventing coordinates. Arrows are bearings,
 * not pathfinding instructions: the player still follows roads around obstacles.
 */
export function questDestination(
  gd: GameData,
  quests: readonly QuestView[],
  tracked: string | null,
  zoneId: string,
  me: { x: number; z: number },
  markers: readonly Marker[] = [],
): QuestDestination | null {
  const viable = quests.filter(
    (q) =>
      gd.quests.has(q.questId) && ['active', 'ready_to_turn_in', 'available'].includes(q.state),
  );
  const q =
    viable.find((q) => q.questId === tracked) ??
    viable.find((q) => q.state === 'ready_to_turn_in') ??
    viable.find((q) => q.state === 'active') ??
    // Follow the most recently completed chain before unrelated available offers.
    viable
      .filter((q) => q.state === 'available')
      .sort((a, b) => {
        const latest = (id: string) =>
          Math.max(
            0,
            ...gd.quest(id).prerequisites.map((pre) => {
              const c = quests.find((q) => q.questId === pre);
              return c?.completedAt ? Date.parse(c.completedAt) : 0;
            }),
          );
        return latest(b.questId) - latest(a.questId);
      })[0];
  if (!q) return null;
  const def = gd.quest(q.questId);
  const candidates: { zoneId: string; position: { x: number; z: number } }[] = [];
  let label: string;
  let stage: QuestDestination['stage'] = 'objective';
  let refs: string[] = [];
  if (q.state === 'ready_to_turn_in' || q.state === 'available') {
    stage = q.state === 'available' ? 'offer' : 'turn_in';
    const npcId = stage === 'offer' ? q.giverNpcId : q.turnInNpcId;
    label = `${stage === 'offer' ? 'Speak to' : 'Return to'} ${npcId ? (gd.npcs.get(npcId)?.name ?? 'quest giver') : 'quest giver'}`;
    if (npcId) refs = [npcId];
  } else {
    const objective = def.objectives.find((o) => !q.objectives.find((p) => p.id === o.id)?.done);
    if (!objective) return null;
    label = objective.label;
    if (objective.kind === 'talk') refs = [objective.npcId];
    if (objective.kind === 'kill') refs = [objective.enemyId];
    if (objective.kind === 'collect') {
      refs = [
        objective.itemTemplateId,
        ...[...gd.enemies.values()]
          .filter(
            (e) =>
              e.lootTableId &&
              gd.lootTables
                .get(e.lootTableId)
                ?.entries.some((i) => i.itemTemplateId === objective.itemTemplateId),
          )
          .map((e) => e.id),
      ];
      label = `${objective.label} · hunt / gather`;
    }
    if (objective.kind === 'explore') {
      const area = gd.zones.get(objective.zoneId)?.landmarks.find((l) => l.id === objective.areaId);
      if (area) candidates.push({ zoneId: objective.zoneId, position: area.position });
    }
  }
  // Prefer live known sources, then authored spawn areas (including a dead creature's respawn).
  const live = markers.filter((m) => !m.dead && m.refId && refs.includes(m.refId));
  for (const m of live) candidates.push({ zoneId, position: m });
  if (!live.length)
    for (const chunk of gd.raw.chunks)
      for (const sp of chunk.spawnPoints)
        if (refs.includes(sp.refId))
          candidates.push({ zoneId: chunk.zoneId, position: sp.position });
  candidates.sort((a, b) => {
    const distance = (c: typeof a) =>
      c.zoneId === zoneId ? Math.hypot(c.position.x - me.x, c.position.z - me.z) : Infinity;
    return distance(a) - distance(b);
  });
  let target = candidates[0];
  if (target && target.zoneId !== zoneId && gd.raw.worldCatalog) {
    const place = gd.raw.worldCatalog.locations.find((l) => l.zoneId === target!.zoneId);
    const route = place && worldDestination(gd.raw.worldCatalog, place.id, zoneId);
    if (route) {
      target = { zoneId: route.location.zoneId, position: route.location.position };
      label = `Travel via ${route.location.name} · ${label}`;
    }
  }
  return {
    questId: q.questId,
    questName: q.name,
    label,
    stage,
    zoneId: target?.zoneId ?? null,
    position: target?.position ?? null,
  };
}

export function questBearing(me: { x: number; z: number }, target: { x: number; z: number }) {
  const dx = target.x - me.x,
    dz = target.z - me.z;
  const radians = Math.atan2(dx, dz);
  return {
    distance: Math.round(Math.hypot(dx, dz)),
    radians,
    compass: ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][
      (Math.round(radians / (Math.PI / 4)) + 8) % 8
    ]!,
  };
}
