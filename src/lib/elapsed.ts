export type ElapsedInput = {
  startedAt: number | null;
  stoppedAt: number | null;
  now: number;
  pausedAccumMs: number;
  pauseStartedAt: number | null;
};

/** Wall clock minus time spent paused. An open pause freezes the result. */
export function elapsedMs(input: ElapsedInput): number {
  const { startedAt, stoppedAt, now, pausedAccumMs, pauseStartedAt } = input;
  if (startedAt == null) return 0;
  const end = stoppedAt ?? now;
  const openPause = pauseStartedAt == null ? 0 : Math.max(0, end - pauseStartedAt);
  return Math.max(0, end - startedAt - pausedAccumMs - openPause);
}
