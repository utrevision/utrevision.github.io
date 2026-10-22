/** Matches `durationMs <= 604800000` in firestore.rules (7 days). */
export const MAX_ATTEMPT_DURATION_MS = 604_800_000;

export function attemptDisplayName(name: string | null | undefined): string {
  const trimmed = (name ?? '').trim().replace(/\s+/g, ' ');
  if (!trimmed) return '未命名';
  return trimmed.slice(0, 80);
}

/** Snap to the nearest half point inside `0 … total`, which is what the rules allow. */
export function normalizeAttemptScore(score: number, total: number): number {
  if (!Number.isFinite(score) || !(total > 0)) return 0;
  const halves = Math.round(score * 2) / 2;
  if (halves < 0) return 0;
  if (halves > total) return total;
  return halves;
}

/**
 * Value for `attempts.hitRate` that the deployed rules will accept.
 *
 * Those rules require `hitRate == score / total`. When both sides are integers,
 * Firestore divides with truncating integer division (`40 / 65 == 0`) and
 * rejects the fractional JavaScript ratio. Comparing that int to a float can
 * also fail the whole rule as an evaluation error. Integer scores therefore
 * store the truncated quotient (0, or 1 when the score is perfect).
 * A half-point score is a float, so the same rule uses real division and the
 * ratio matches.
 */
export function attemptHitRate(score: number, total: number): number {
  if (!(total > 0) || !Number.isFinite(score)) return 0;
  if (Number.isInteger(score) && Number.isInteger(total)) {
    const quotient = Math.trunc(score / total);
    return quotient < 0 ? 0 : quotient;
  }
  const ratio = score / total;
  if (!Number.isFinite(ratio) || ratio < 0) return 0;
  return ratio > 1 ? 1 : ratio;
}

export function attemptDurationMs(durationMs: number): number {
  if (!Number.isFinite(durationMs)) return 0;
  return Math.min(MAX_ATTEMPT_DURATION_MS, Math.max(0, Math.round(durationMs)));
}
