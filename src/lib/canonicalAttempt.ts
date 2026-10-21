import { canonicalQuizTotal } from '../data/quizzes.ts';
import type { AttemptRecord } from '../types.ts';

/** Leaderboard denominator. Lianpo is 65 even when an older document stored 66. */
export function withCanonicalTotal(row: AttemptRecord): AttemptRecord {
  const total = canonicalQuizTotal(row.quizId);
  return {
    ...row,
    total,
    hitRate: total > 0 ? row.score / total : 0,
  };
}
