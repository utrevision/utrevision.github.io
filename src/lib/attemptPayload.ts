/** Matches `durationMs <= 604800000` in firestore.rules (7 days). */
export const MAX_ATTEMPT_DURATION_MS = 604_800_000;

export function attemptDisplayName(name: string | null | undefined): string {
  const trimmed = (name ?? '').trim().replace(/\s+/g, ' ');
  if (!trimmed) return '未命名';
  return trimmed.slice(0, 80);
}

/** Snap to a whole mark inside `0 … total`. Scores are never half points. */
export function normalizeAttemptScore(score: number, total: number): number {
  if (!Number.isFinite(score) || !(total > 0)) return 0;
  const whole = Math.round(score);
  if (whole < 0) return 0;
  if (whole > total) return total;
  return whole;
}

/**
 * Value for `attempts.hitRate` that the deployed rules will accept.
 *
 * Those rules require `hitRate == score / total`. When both sides are integers,
 * Firestore divides with truncating integer division (`40 / 65 == 0`) and
 * rejects the fractional JavaScript ratio. Comparing that int to a float can
 * also fail the whole rule as an evaluation error. Scores are whole marks, so
 * this stores the truncated quotient (0, or 1 when the score is perfect).
 */
export function attemptHitRate(score: number, total: number): number {
  if (!(total > 0) || !Number.isFinite(score)) return 0;
  const whole = Math.round(score);
  if (!Number.isFinite(whole)) return 0;
  const quotient = Math.trunc(whole / total);
  if (quotient < 0) return 0;
  return quotient > 1 ? 1 : quotient;
}

export function attemptDurationMs(durationMs: number): number {
  if (!Number.isFinite(durationMs)) return 0;
  return Math.min(MAX_ATTEMPT_DURATION_MS, Math.max(0, Math.round(durationMs)));
}
