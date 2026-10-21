import { describe, expect, it } from 'vitest';
import { withCanonicalTotal } from './canonicalAttempt.ts';
import type { AttemptRecord } from '../types.ts';

function row(partial: Partial<AttemptRecord> & Pick<AttemptRecord, 'quizId' | 'score' | 'total'>): AttemptRecord {
  return {
    id: 'a',
    uid: 'u',
    displayName: '測試',
    hitRate: partial.score / partial.total,
    durationMs: 1000,
    finishedAt: null,
    ...partial,
  };
}

describe('withCanonicalTotal', () => {
  it('shows lianpo out of 65 when an older attempt stored 66', () => {
    const next = withCanonicalTotal(row({ quizId: 'lianpo', score: 40, total: 66, hitRate: 40 / 66 }));
    expect(next.total).toBe(65);
    expect(next.hitRate).toBeCloseTo(40 / 65);
    expect(next.score).toBe(40);
  });

  it('keeps the eight-passage total at 100', () => {
    const next = withCanonicalTotal(row({ quizId: '8passages', score: 80, total: 100 }));
    expect(next.total).toBe(100);
    expect(next.hitRate).toBeCloseTo(0.8);
  });
});
