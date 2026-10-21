export type RankedAttempt = {
  score: number;
  hitRate: number;
  durationMs: number;
};

/** Higher total score, then higher hit rate, then shorter duration. */
export function compareAttempts(a: RankedAttempt, b: RankedAttempt): number {
  if (a.score !== b.score) return b.score - a.score;
  if (a.hitRate !== b.hitRate) return b.hitRate - a.hitRate;
  return a.durationMs - b.durationMs;
}

export type TimedScore = {
  score: number;
  durationMs: number;
};

/**
 * Whether `next` should replace `prev` on the leaderboard.
 * Higher score wins. The same score wins only when it took less time.
 */
export function isBetterAttempt(next: TimedScore, prev: TimedScore): boolean {
  if (next.score !== prev.score) return next.score > prev.score;
  return next.durationMs < prev.durationMs;
}

export function selectBestByUser<T extends TimedScore & { uid: string }>(rows: readonly T[]): T[] {
  const best = new Map<string, T>();
  for (const row of rows) {
    const current = best.get(row.uid);
    if (!current || isBetterAttempt(row, current)) best.set(row.uid, row);
  }
  return [...best.values()];
}

export type StoredAttemptRef = TimedScore & { id: string };

export type BestWritePlan = {
  recorded: boolean;
  updateId: string | null;
  deleteIds: string[];
};

/**
 * One stored attempt per user. A better attempt overwrites that document.
 * Extra documents for the same user are deleted either way.
 */
export function planBestAttemptWrite(existing: readonly StoredAttemptRef[], next: TimedScore): BestWritePlan {
  if (existing.length === 0) {
    return { recorded: true, updateId: null, deleteIds: [] };
  }

  let best = existing[0]!;
  for (const row of existing.slice(1)) {
    if (isBetterAttempt(row, best)) best = row;
  }
  const deleteIds = existing.filter((row) => row.id !== best.id).map((row) => row.id);
  if (isBetterAttempt(next, best)) {
    return { recorded: true, updateId: best.id, deleteIds };
  }
  return { recorded: false, updateId: null, deleteIds };
}
