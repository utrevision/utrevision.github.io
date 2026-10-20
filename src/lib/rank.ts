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
