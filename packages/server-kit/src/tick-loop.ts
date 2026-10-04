/** Absolute monotonic deadlines avoid accumulating timer wake-up delay.
 * Missed slots are counted, never replayed as fake/catch-up simulation steps.
 */
export function nextTickDeadline(deadline: number, now: number, period: number) {
  const next = deadline + period;
  const skipped = next <= now ? Math.floor((now - next) / period) + 1 : 0;
  return { deadline: next + skipped * period, skipped };
}
export function startTickLoop(
  tick: () => void,
  periodMs: number,
  onSkipped: (count: number) => void = () => undefined,
) {
  if (!Number.isFinite(periodMs) || periodMs <= 0) throw new Error('Invalid tick period');
  let deadline = performance.now() + periodMs;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout>;
  const run = () => {
    if (stopped) return;
    // Timers may round a delay down; do not execute a simulation step early.
    if (performance.now() < deadline) {
      timer = setTimeout(run, Math.max(1, Math.ceil(deadline - performance.now())));
      return;
    }
    tick();
    if (stopped) return;
    const next = nextTickDeadline(deadline, performance.now(), periodMs);
    deadline = next.deadline;
    if (next.skipped) onSkipped(next.skipped);
    timer = setTimeout(run, Math.max(1, Math.ceil(deadline - performance.now())));
  };
  timer = setTimeout(run, periodMs);
  return {
    stop() {
      stopped = true;
      clearTimeout(timer);
    },
  };
}
