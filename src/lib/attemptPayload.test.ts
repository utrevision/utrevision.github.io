import { describe, expect, it } from 'vitest';
import { attemptDurationMs, attemptHitRate, normalizeAttemptScore } from './attemptPayload.ts';

describe('attempt payload for Firestore rules', () => {
  it('stores the truncating quotient for an integer score', () => {
    expect(attemptHitRate(40, 65)).toBe(0);
    expect(attemptHitRate(0, 65)).toBe(0);
    expect(attemptHitRate(64, 65)).toBe(0);
    expect(attemptHitRate(65, 65)).toBe(1);
    expect(attemptHitRate(100, 100)).toBe(1);
    expect(attemptHitRate(1, 100)).toBe(0);
  });

  it('stores the real ratio when the score has a half point', () => {
    expect(attemptHitRate(40.5, 65)).toBe(40.5 / 65);
    expect(attemptHitRate(0.5, 100)).toBe(0.5 / 100);
    expect(attemptHitRate(99.5, 100)).toBe(99.5 / 100);
  });

  it('snaps dust to a half point before the rules see the score', () => {
    expect(normalizeAttemptScore(40.0000000002, 65)).toBe(40);
    expect(normalizeAttemptScore(10.499999999999998, 65)).toBe(10.5);
    expect(normalizeAttemptScore(40.5, 65)).toBe(40.5);
    expect(normalizeAttemptScore(-1, 65)).toBe(0);
    expect(normalizeAttemptScore(80, 65)).toBe(65);
  });

  it('keeps duration inside the seven-day integer window', () => {
    expect(attemptDurationMs(1500.6)).toBe(1501);
    expect(attemptDurationMs(-20)).toBe(0);
    expect(attemptDurationMs(Number.POSITIVE_INFINITY)).toBe(0);
    expect(attemptDurationMs(9_999_999_999)).toBe(604_800_000);
  });
});
