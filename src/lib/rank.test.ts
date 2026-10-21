import { describe, expect, it } from 'vitest';
import { compareAttempts, isBetterAttempt, planBestAttemptWrite, selectBestByUser } from './rank.ts';

describe('leaderboard order', () => {
  it('ranks by score desc, then hit rate desc, then duration asc', () => {
    const rows = [
      { score: 10, hitRate: 0.5, durationMs: 1000 },
      { score: 20, hitRate: 0.2, durationMs: 9000 },
      { score: 10, hitRate: 0.5, durationMs: 500 },
      { score: 10, hitRate: 0.8, durationMs: 8000 },
    ];
    const ranked = rows.slice().sort(compareAttempts);
    expect(ranked).toEqual([
      { score: 20, hitRate: 0.2, durationMs: 9000 },
      { score: 10, hitRate: 0.8, durationMs: 8000 },
      { score: 10, hitRate: 0.5, durationMs: 500 },
      { score: 10, hitRate: 0.5, durationMs: 1000 },
    ]);
  });
});

describe('one best attempt per user', () => {
  it('replaces a lower score, and a tie only when the new attempt is faster', () => {
    expect(isBetterAttempt({ score: 41, durationMs: 9_000 }, { score: 40, durationMs: 1_000 })).toBe(true);
    expect(isBetterAttempt({ score: 40, durationMs: 4_000 }, { score: 40, durationMs: 5_000 })).toBe(true);
    expect(isBetterAttempt({ score: 39, durationMs: 1_000 }, { score: 40, durationMs: 9_000 })).toBe(false);
    expect(isBetterAttempt({ score: 40, durationMs: 5_000 }, { score: 40, durationMs: 4_000 })).toBe(false);
    expect(isBetterAttempt({ score: 40, durationMs: 4_000 }, { score: 40, durationMs: 4_000 })).toBe(false);
  });

  it('keeps one row per user: the higher score, then the shorter time', () => {
    const rows = [
      { id: 'slow', uid: 'a', score: 40, durationMs: 8_000 },
      { id: 'other', uid: 'b', score: 10, durationMs: 1_000 },
      { id: 'best', uid: 'a', score: 40, durationMs: 3_000 },
      { id: 'high', uid: 'a', score: 50, durationMs: 9_000 },
    ];
    expect(selectBestByUser(rows).map((row) => row.id).sort()).toEqual(['high', 'other']);
  });

  it('plans a create, an overwrite, or a kept record, and drops duplicate documents', () => {
    expect(planBestAttemptWrite([], { score: 10, durationMs: 1_000 })).toEqual({
      recorded: true,
      updateId: null,
      deleteIds: [],
    });

    const existing = [
      { id: 'old-best', score: 40, durationMs: 5_000 },
      { id: 'dup', score: 30, durationMs: 1_000 },
    ];
    expect(planBestAttemptWrite(existing, { score: 41, durationMs: 9_000 })).toEqual({
      recorded: true,
      updateId: 'old-best',
      deleteIds: ['dup'],
    });
    expect(planBestAttemptWrite(existing, { score: 40, durationMs: 4_000 })).toEqual({
      recorded: true,
      updateId: 'old-best',
      deleteIds: ['dup'],
    });
    expect(planBestAttemptWrite(existing, { score: 40, durationMs: 5_000 })).toEqual({
      recorded: false,
      updateId: null,
      deleteIds: ['dup'],
    });
    expect(planBestAttemptWrite(existing, { score: 20, durationMs: 1_000 })).toEqual({
      recorded: false,
      updateId: null,
      deleteIds: ['dup'],
    });
  });
});
