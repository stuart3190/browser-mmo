import { afterEach, expect, it, vi } from 'vitest';
import {
  getGameData,
  watchAftermath,
  questAvailability,
  checkCanEquip,
  applyExploration,
  applyKill,
} from './index';
import type { QuestRecord } from './rules/quests';
const gd = getGameData();
const done = (id: string): QuestRecord => ({
  questId: id,
  status: 'completed',
  progress: {},
  acceptedAt: null,
  completedAt: '2026-10-25T23:58:00.000Z',
});
afterEach(() => vi.useRealTimers());
it('closes the earned living-seal arc with a once-only reward usable by both classes', () => {
  const q = gd.quest(watchAftermath.epilogueId),
    records = new Map<string, QuestRecord>();
  expect(questAvailability(q, 6, records)).toMatchObject({ reason: 'PREREQUISITE' });
  records.set('quest.elderwood.living_seal', done('quest.elderwood.living_seal'));
  expect(questAvailability(q, 6, records)).toEqual({ ok: true });
  records.set(q.id, done(q.id));
  expect(questAvailability(q, 6, records)).toMatchObject({ reason: 'ALREADY_COMPLETED' });
  const template = gd.template(watchAftermath.compassId);
  expect(q.rewards.items).toEqual([{ itemTemplateId: template.id, quantity: 1 }]);
  for (const cls of ['class.warrior', 'class.mage'])
    expect(
      checkCanEquip({
        template,
        slot: gd.equipmentSlots.get('trinket_1')!,
        equipmentType: gd.equipmentTypes.get('trinket'),
        characterClass: gd.characterClass(cls),
        characterLevel: 5,
        mainHandSlotType: null,
        offHandOccupied: false,
      }),
    ).toEqual({ ok: true });
});
it.each(watchAftermath.patrolIds)(
  'requires fresh survey/hunt and a full day before repeating %s',
  (id) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-25T23:58:00Z'));
    const q = gd.quest(id),
      records = new Map([[watchAftermath.epilogueId, done(watchAftermath.epilogueId)]]);
    expect(questAvailability(q, 6, records)).toEqual({ ok: true });
    const survey = q.objectives.find((o) => o.kind === 'explore')!,
      kill = q.objectives.find((o) => o.kind === 'kill')!;
    const zone = gd.zone(survey.zoneId),
      pos = zone.landmarks.find((l) => l.id === survey.areaId)!.position;
    expect(applyExploration(q, {}, zone, pos, 0)).toBeNull();
    expect(applyExploration(q, {}, zone, pos, 100)).toEqual({ inspect: 1 });
    expect(applyKill(q, {}, 'enemy.greenvale.grey_wolf')).toBeNull();
    expect(applyKill(q, {}, kill.enemyId)).toEqual({ clear: 1 });
    records.set(q.id, done(q.id));
    vi.setSystemTime(new Date('2026-10-26T00:00:00Z'));
    expect(questAvailability(q, 6, records)).toMatchObject({ reason: 'ALREADY_COMPLETED' });
    vi.setSystemTime(new Date('2026-10-26T23:58:00Z'));
    expect(questAvailability(q, 6, records)).toEqual({ ok: true });
  },
);
