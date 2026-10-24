import { expect, it } from 'vitest';
import { questRepeatReadyAt, questRepeatWait } from './quest-repeat';
it('shows 24 hours from completion, not the next calendar midnight', () => {
  const completed = '2026-10-25T23:58:00.000Z';
  const ready = questRepeatReadyAt(completed)!;
  expect(new Date(ready).toISOString()).toBe('2026-10-26T23:58:00.000Z');
  expect(questRepeatWait(ready, Date.parse('2026-10-26T00:00:00Z'))).toBe(
    'Available again in 23h 58m',
  );
  expect(questRepeatWait(ready, ready - 1)).toBe('Available again in 1m');
  expect(questRepeatWait(ready, ready)).toContain('check availability');
});
it('omits timing without a valid completion and respects authored cooldowns', () => {
  expect(questRepeatReadyAt(null)).toBeNull();
  expect(questRepeatReadyAt('invalid')).toBeNull();
  expect(questRepeatReadyAt('2026-10-25T12:00:00Z', 60000)).toBe(
    Date.parse('2026-10-25T12:01:00Z'),
  );
});
