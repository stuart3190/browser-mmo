import { expect, it } from 'vitest';
import { getGameData, questView, type QuestRecord } from '@mmo/game-data';
import { availableQuestOffers, questGiverPlace } from './quest-offers';
import { questDestination } from './quest-navigation';
const gd = getGameData();
const zone = 'zone.aurelian.amber_coast';
const me = { x: 272, z: 104 };
const prior: QuestRecord = {
  questId: 'quest.amber_coast.last_bell',
  status: 'completed',
  progress: {},
  acceptedAt: '2026-10-24T10:00:00Z',
  completedAt: '2026-10-24T11:00:00Z',
};
const records = new Map([[prior.questId, prior]]);
const views = [...gd.quests.values()].map((q) => questView(q, 5, records, () => 0));
it('offers only server-available authored quests and recommends the latest earned continuation', () => {
  const list = availableQuestOffers(gd, views, zone, me);
  expect(list[0]?.questId).toBe('quest.elderwood.third_watch');
  expect(list.every((q) => q.state === 'available' && !gd.quest(q.questId).placeholder)).toBe(true);
  expect(list.some((q) => q.questId === 'quest.elderwood.living_seal')).toBe(false);
  expect(questDestination(gd, views, null, zone, me)?.questId).toBe(list[0]?.questId);
  expect(questGiverPlace(gd, list[0]!.giverNpcId)).toMatchObject({ zoneId: zone, position: me });
});
it('never mutates authority or reveals locked offers, and prefers local work for equal story progress', () => {
  const untouched = structuredClone(views);
  const local = views.find((q) => q.questId === 'quest.elderwood.third_watch')!;
  const unrelated = views.find((q) => q.questId === 'quest.greenvale.wolves_at_the_edge')!;
  const noHistory = [local, unrelated];
  expect(availableQuestOffers(gd, noHistory, zone, me)[0]).toBe(local);
  const locked = { ...local, state: 'unavailable' as const };
  expect(availableQuestOffers(gd, [locked], zone, me)).toEqual([]);
  expect(
    availableQuestOffers(gd, [{ ...local, questId: 'quest.future.unknown' }], zone, me),
  ).toEqual([]);
  expect(views).toEqual(untouched);
  expect(questGiverPlace(gd, null)).toBeNull();
});
