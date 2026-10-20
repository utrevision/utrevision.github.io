import { describe, expect, it } from 'vitest';
import { compareAttempts } from './rank.ts';

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
