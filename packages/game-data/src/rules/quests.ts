import type { QuestDefinition, QuestState, QuestView } from '@mmo/schemas';

/**
 * Pure quest rules shared by the domain (authoritative) and tests. Nothing here touches I/O: the
 * caller supplies the persisted record and authoritative item counts.
 */

/** What the database stores per (character, quest). Only `active` and `completed` are persisted. */
export interface QuestRecord {
  questId: string;
  status: 'active' | 'completed';
  /** Kill-objective counters keyed by objective id (collect objectives are derived, not stored). */
  progress: Record<string, number>;
  acceptedAt: string | null;
  completedAt: string | null;
}

export type QuestAvailability =
  | { ok: true }
  | {
      ok: false;
      reason:
        'PLACEHOLDER' | 'LEVEL_TOO_LOW' | 'PREREQUISITE' | 'ALREADY_ACTIVE' | 'ALREADY_COMPLETED';
    };

/** Can this character accept the quest now? */
export function questAvailability(
  def: QuestDefinition,
  level: number,
  records: ReadonlyMap<string, QuestRecord>,
): QuestAvailability {
  if (def.placeholder || !def.giverNpcId) return { ok: false, reason: 'PLACEHOLDER' };
  const mine = records.get(def.id);
  if (mine?.status === 'active') return { ok: false, reason: 'ALREADY_ACTIVE' };
  if (mine?.status === 'completed' && !def.repeatable)
    return { ok: false, reason: 'ALREADY_COMPLETED' };
  if (level < def.minLevel) return { ok: false, reason: 'LEVEL_TOO_LOW' };
  for (const pre of def.prerequisites)
    if (records.get(pre)?.status !== 'completed') return { ok: false, reason: 'PREREQUISITE' };
  return { ok: true };
}

export interface ObjectiveProgress {
  id: string;
  kind: QuestDefinition['objectives'][number]['kind'];
  label: string;
  current: number;
  required: number;
  done: boolean;
}

/**
 * Objective progress. Kill objectives come from the persisted counters; collect objectives are
 * derived from the character's authoritative item count (bags + Recovered loot), so selling or
 * moving pelts away correctly lowers progress again.
 */
export function objectiveProgress(
  def: QuestDefinition,
  record: QuestRecord | undefined,
  itemCount: (templateId: string) => number,
): ObjectiveProgress[] {
  return def.objectives.map((o) => {
    const required = o.kind === 'kill' || o.kind === 'collect' ? o.count : 1;
    const raw =
      o.kind === 'kill'
        ? (record?.progress[o.id] ?? 0)
        : o.kind === 'collect'
          ? itemCount(o.itemTemplateId)
          : 0;
    const current = Math.max(0, Math.min(required, raw));
    return { id: o.id, kind: o.kind, label: o.label, current, required, done: current >= required };
  });
}

/** Player-facing state. `ready_to_turn_in` = active with every objective satisfied. */
export function questState(
  def: QuestDefinition,
  level: number,
  records: ReadonlyMap<string, QuestRecord>,
  itemCount: (templateId: string) => number,
): QuestState {
  const mine = records.get(def.id);
  if (mine?.status === 'completed') return 'completed';
  if (mine?.status === 'active')
    return objectiveProgress(def, mine, itemCount).every((o) => o.done)
      ? 'ready_to_turn_in'
      : 'active';
  return questAvailability(def, level, records).ok ? 'available' : 'unavailable';
}

export function questView(
  def: QuestDefinition,
  level: number,
  records: ReadonlyMap<string, QuestRecord>,
  itemCount: (templateId: string) => number,
): QuestView {
  const mine = records.get(def.id);
  return {
    questId: def.id,
    name: def.name,
    description: def.description,
    state: questState(def, level, records, itemCount),
    giverNpcId: def.giverNpcId,
    turnInNpcId: turnInNpcOf(def),
    objectives: objectiveProgress(def, mine, itemCount),
    rewards: {
      xp: def.rewards.xp,
      currency: def.rewards.currency,
      items: def.rewards.items,
    },
    acceptedAt: mine?.acceptedAt ?? null,
    completedAt: mine?.completedAt ?? null,
  };
}

export function turnInNpcOf(def: QuestDefinition): string | null {
  return def.turnInNpcId ?? def.giverNpcId;
}

/**
 * Applies one credited kill to an active quest's counters. Returns the new progress, or null when
 * nothing changed (wrong enemy, objective already complete). Counters never exceed the target.
 */
export function applyKill(
  def: QuestDefinition,
  progress: Readonly<Record<string, number>>,
  enemyId: string,
): Record<string, number> | null {
  let changed = false;
  const next = { ...progress };
  for (const o of def.objectives) {
    if (o.kind !== 'kill' || o.enemyId !== enemyId) continue;
    const cur = next[o.id] ?? 0;
    if (cur >= o.count) continue;
    next[o.id] = cur + 1;
    changed = true;
  }
  return changed ? next : null;
}

export type TurnInCheck =
  | { ok: true }
  | {
      ok: false;
      reason: 'NOT_ACTIVE' | 'ALREADY_COMPLETED' | 'WRONG_NPC' | 'OBJECTIVES_INCOMPLETE';
    };

/** Turn-in rule (range is checked by the realtime host, items again inside the transaction). */
export function turnInCheck(
  def: QuestDefinition,
  record: QuestRecord | undefined,
  npcId: string,
  itemCount: (templateId: string) => number,
): TurnInCheck {
  if (record?.status === 'completed') return { ok: false, reason: 'ALREADY_COMPLETED' };
  if (record?.status !== 'active') return { ok: false, reason: 'NOT_ACTIVE' };
  if (turnInNpcOf(def) !== npcId) return { ok: false, reason: 'WRONG_NPC' };
  if (!objectiveProgress(def, record, itemCount).every((o) => o.done))
    return { ok: false, reason: 'OBJECTIVES_INCOMPLETE' };
  return { ok: true };
}

/** The line an NPC says about a quest in a given state (null: nothing to say). */
export function questDialogue(def: QuestDefinition, state: QuestState): string | null {
  if (!def.dialogue) return null;
  switch (state) {
    case 'available':
      return def.dialogue.offer;
    case 'active':
      return def.dialogue.inProgress;
    case 'ready_to_turn_in':
      return def.dialogue.readyToTurnIn;
    case 'completed':
      return def.dialogue.completed;
    case 'unavailable':
      return null;
  }
}
