import { expect, it, vi } from 'vitest';
import { nextTickDeadline, startTickLoop } from './tick-loop';
it('absorbs repeated late wakeups instead of accumulating interval drift', () => {
  let deadline = 50;
  for (let i = 1; i <= 100; i++) {
    expect(deadline).toBe(i * 50);
    const next = nextTickDeadline(deadline, deadline + 12, 50);
    expect(next.skipped).toBe(0);
    deadline = next.deadline;
  }
});
it('counts missed slots without unbounded catch-up work', () => {
  expect(nextTickDeadline(50, 260, 50)).toEqual({ deadline: 300, skipped: 4 });
  expect(nextTickDeadline(50, 100, 50)).toEqual({ deadline: 150, skipped: 1 });
});
it('stops scheduling even when stopped inside a tick', () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
  try {
    const tick = vi.fn(() => loop.stop());
    const loop = startTickLoop(tick, 50);
    vi.advanceTimersByTime(500);
    expect(tick).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});
