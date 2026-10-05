import { expect, it } from 'vitest';
import { getGameData, questView, type QuestRecord } from '@mmo/game-data';
import { questBearing, questDestination } from './quest-navigation';
const gd = getGameData(),
  z = 'zone.greenvale.meadows',
  me = { x: 0, z: 0 };
function log(
  id: string,
  progress: Record<string, number> = {},
  status: 'active' | 'completed' = 'active',
) {
  const record: QuestRecord = {
    questId: id,
    status,
    progress,
    acceptedAt: null,
    completedAt: status === 'completed' ? '2026-10-05T10:00:00Z' : null,
  };
  return questView(gd.quest(id), 3, new Map([[id, record]]), () => 0);
}
it('guides generic kill, personal collection, NPC talk, explore and turn-in without one-quest IDs in the resolver', () => {
  const wolf = log('quest.greenvale.wolves_at_the_edge');
  expect(questDestination(gd, [wolf], null, z, me)?.position).not.toBeNull();
  wolf.objectives[0]!.done = true;
  expect(questDestination(gd, [wolf], null, z, me)?.label).toContain('hunt / gather');
  const way = log('quest.greenvale.old_waystone');
  expect(questDestination(gd, [way], null, z, me)?.position).toMatchObject({ x: -8, z: -90 });
  const well = log('quest.greenvale.well_records');
  expect(questDestination(gd, [well], null, z, me)?.position).toEqual({ x: 8, y: 0, z: 12 });
  well.objectives[0]!.done = true;
  expect(questDestination(gd, [well], null, z, me)?.position).toMatchObject({ x: 8, z: 110 });
  well.state = 'ready_to_turn_in';
  expect(questDestination(gd, [well], null, z, me)).toMatchObject({
    stage: 'turn_in',
    label: 'Return to Elder Maren',
  });
  expect(questDestination(gd, [way, well], way.questId, z, me)?.questId).toBe(way.questId);
  expect(questBearing(me, { x: 10, z: 0 })).toMatchObject({ compass: 'E', distance: 10 });
});
it('automatically guides newly unlocked handoffs, uses live known enemies, handles no quests and other zones', () => {
  const completed = log('quest.greenvale.old_waystone', {}, 'completed');
  const next = log('quest.greenvale.hollow_trail');
  next.state = 'available';
  expect(questDestination(gd, [completed, next], completed.questId, z, me)).toMatchObject({
    stage: 'offer',
    label: 'Speak to Keeper Rill',
  });
  const wolf = log('quest.greenvale.wolves_at_the_edge');
  expect(
    questDestination(gd, [wolf], null, z, me, [
      { refId: 'enemy.greenvale.grey_wolf', x: 20, z: 30, dead: false },
    ])?.position,
  ).toMatchObject({ x: 20, z: 30 });
  expect(questDestination(gd, [], null, z, me)).toBeNull();
  expect(
    questDestination(gd, [{ ...wolf, questId: 'quest.future.unknown' }], null, z, me),
  ).toBeNull();
  expect(questDestination(gd, [wolf], null, 'zone.other', me)?.zoneId).toBe(z);
});
it('guides existing quest handoffs back through world travel without changing their objectives', () => {
  const q = log('quest.greenvale.well_records');
  q.state = 'ready_to_turn_in';
  const march = questDestination(gd, [q], null, 'zone.aurelian.greenvale_marches', me);
  expect(march).toMatchObject({
    zoneId: 'zone.aurelian.greenvale_marches',
    position: { x: 256, z: 376 },
    stage: 'turn_in',
  });
  expect(march?.label).toContain('Return to Elder Maren');
  expect(questDestination(gd, [q], null, 'zone.frostmere.brinebreak', me)?.position).toMatchObject({
    x: 256,
    z: 96,
  });
  expect(questDestination(gd, [q], null, z, me)?.label).toBe('Return to Elder Maren');
});
