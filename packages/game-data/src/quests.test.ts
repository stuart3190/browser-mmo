import { describe, expect, it } from 'vitest';
import { getGameData } from './index';
import {
  applyKill,
  objectiveProgress,
  questAvailability,
  questDialogue,
  questState,
  turnInCheck,
} from './rules/quests';
import type { QuestRecord } from './rules/quests';

const gd = getGameData();
const Q = gd.quest('quest.greenvale.wolves_at_the_edge');
const WOLF = 'enemy.greenvale.grey_wolf';
const PELT = 'material.hide.wolf_pelt';
const MAREN = 'npc.greenvale.elder_maren';
const none = () => 0;
const pelts = (n: number) => (id: string) => (id === PELT ? n : 0);
const active = (progress: Record<string, number> = {}): QuestRecord => ({
  questId: Q.id,
  status: 'active',
  progress,
  acceptedAt: '2026-10-04T00:00:00.000Z',
  completedAt: null,
});
const recs = (r?: QuestRecord) => new Map(r ? [[r.questId, r]] : []);

describe('quest content', () => {
  it('Wolves at the Edge is data-driven: giver, kill + collect objectives, rewards, dialogue', () => {
    expect(Q).toMatchObject({ giverNpcId: MAREN, repeatable: false, placeholder: false });
    expect(Q.objectives.map((o) => o.kind)).toEqual(['kill', 'collect']);
    expect(Q.rewards.items[0]!.itemTemplateId).toBe('accessory.cloak.wayfarer_cloak');
    expect(Q.dialogue).not.toBeNull();
  });
});

describe('availability', () => {
  it('is available once; never while active or after completion (non-repeatable)', () => {
    expect(questAvailability(Q, 1, recs())).toEqual({ ok: true });
    expect(questAvailability(Q, 1, recs(active()))).toEqual({
      ok: false,
      reason: 'ALREADY_ACTIVE',
    });
    expect(questAvailability(Q, 1, recs({ ...active(), status: 'completed' }))).toEqual({
      ok: false,
      reason: 'ALREADY_COMPLETED',
    });
  });
  it('respects level, prerequisites and placeholders', () => {
    expect(questAvailability({ ...Q, minLevel: 5 }, 4, recs())).toMatchObject({
      reason: 'LEVEL_TOO_LOW',
    });
    expect(questAvailability({ ...Q, prerequisites: ['quest.x'] }, 1, recs())).toMatchObject({
      reason: 'PREREQUISITE',
    });
    expect(
      questAvailability(
        { ...Q, prerequisites: ['quest.x'] },
        1,
        new Map([['quest.x', { ...active(), questId: 'quest.x', status: 'completed' as const }]]),
      ),
    ).toEqual({ ok: true });
    expect(
      questAvailability(gd.quest('quest.greenvale.letter_to_captain'), 1, recs()),
    ).toMatchObject({
      reason: 'PLACEHOLDER',
    });
  });
});

describe('progress and state transitions', () => {
  it('kills count only for the right enemy, once each, capped at the target', () => {
    let p: Record<string, number> = {};
    expect(applyKill(Q, p, 'enemy.other')).toBeNull();
    for (let i = 0; i < 5; i++) p = applyKill(Q, p, WOLF)!;
    expect(p.kill_wolves).toBe(5);
    expect(applyKill(Q, p, WOLF)).toBeNull(); // already complete: no change
  });

  it('collect progress is derived from authoritative item counts and capped', () => {
    expect(objectiveProgress(Q, active(), pelts(2))[1]).toMatchObject({
      current: 2,
      required: 3,
      done: false,
    });
    expect(objectiveProgress(Q, active(), pelts(9))[1]).toMatchObject({ current: 3, done: true });
  });

  it('unavailable/available -> active -> ready_to_turn_in -> completed', () => {
    expect(questState({ ...Q, minLevel: 9 }, 1, recs(), none)).toBe('unavailable');
    expect(questState(Q, 1, recs(), none)).toBe('available');
    expect(questState(Q, 1, recs(active({ kill_wolves: 5 })), pelts(2))).toBe('active');
    expect(questState(Q, 1, recs(active({ kill_wolves: 4 })), pelts(3))).toBe('active');
    expect(questState(Q, 1, recs(active({ kill_wolves: 5 })), pelts(3))).toBe('ready_to_turn_in');
    // losing the pelts takes it back to active
    expect(questState(Q, 1, recs(active({ kill_wolves: 5 })), pelts(0))).toBe('active');
    expect(questState(Q, 1, recs({ ...active(), status: 'completed' }), none)).toBe('completed');
  });

  it('dialogue follows the state', () => {
    expect(questDialogue(Q, 'available')).toBe(Q.dialogue!.offer);
    expect(questDialogue(Q, 'ready_to_turn_in')).toBe(Q.dialogue!.readyToTurnIn);
    expect(questDialogue(Q, 'unavailable')).toBeNull();
  });
});

describe('turn-in validation', () => {
  const done = active({ kill_wolves: 5 });
  it('rejects not accepted, wrong NPC, incomplete objectives and completed quests', () => {
    expect(turnInCheck(Q, undefined, MAREN, pelts(3))).toEqual({ ok: false, reason: 'NOT_ACTIVE' });
    expect(turnInCheck(Q, done, 'npc.other', pelts(3))).toEqual({ ok: false, reason: 'WRONG_NPC' });
    expect(turnInCheck(Q, done, MAREN, pelts(2))).toEqual({
      ok: false,
      reason: 'OBJECTIVES_INCOMPLETE',
    });
    expect(turnInCheck(Q, active({ kill_wolves: 4 }), MAREN, pelts(3))).toEqual({
      ok: false,
      reason: 'OBJECTIVES_INCOMPLETE',
    });
    expect(turnInCheck(Q, { ...done, status: 'completed' }, MAREN, pelts(3))).toEqual({
      ok: false,
      reason: 'ALREADY_COMPLETED',
    });
    expect(turnInCheck(Q, done, MAREN, pelts(3))).toEqual({ ok: true });
  });
});

describe('content validation', () => {
  it('rejects quests referencing unknown content or unsupported features', async () => {
    const { GameData, rawGameData } = await import('./index');
    const bad = structuredClone(rawGameData);
    const q = bad.quests.find((x) => x.id === Q.id)!;
    q.objectives.push({
      id: 'kill_wolves',
      kind: 'kill',
      enemyId: 'enemy.nope',
      count: 1,
      label: 'x',
    });
    q.repeatable = true;
    expect(() => GameData.load(bad)).toThrow(/duplicate objective|unknown enemy|repeatable/);
  });
});
