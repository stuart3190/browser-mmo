import type { GameData } from '@mmo/game-data';
import type { QuestView } from '@mmo/schemas';

/** Presentation of server-approved offers only. No local unlocking or remote acceptance. */
export function questGiverPlace(gd: GameData, npcId: string | null) {
  if (!npcId) return null;
  for (const chunk of gd.raw.chunks) {
    const spawn = chunk.spawnPoints.find((s) => s.kind === 'npc' && s.refId === npcId);
    if (spawn) return { zoneId: chunk.zoneId, position: spawn.position };
  }
  return null;
}

export function availableQuestOffers(
  gd: GameData,
  quests: readonly QuestView[],
  zoneId: string,
  me: { x: number; z: number },
) {
  const latest = (id: string) =>
    Math.max(
      0,
      ...gd.quest(id).prerequisites.map((pre) => {
        const date = quests.find((q) => q.questId === pre)?.completedAt;
        const time = date ? Date.parse(date) : 0;
        return Number.isFinite(time) ? time : 0;
      }),
    );
  const distance = (q: QuestView) => {
    const place = questGiverPlace(gd, q.giverNpcId);
    return place?.zoneId === zoneId
      ? Math.hypot(place.position.x - me.x, place.position.z - me.z)
      : Infinity;
  };
  return quests
    .filter(
      (q) =>
        q.state === 'available' && gd.quests.has(q.questId) && !gd.quest(q.questId).placeholder,
    )
    .sort(
      (a, b) =>
        latest(b.questId) - latest(a.questId) ||
        distance(a) - distance(b) ||
        a.name.localeCompare(b.name),
    );
}
