import { describe, expect, it } from 'vitest';
import { elapsedMs } from './elapsed.ts';

const start = 1_000_000;

describe('elapsedMs', () => {
  it('is zero before the attempt starts', () => {
    expect(
      elapsedMs({
        startedAt: null,
        stoppedAt: null,
        now: start + 5_000,
        pausedAccumMs: 0,
        pauseStartedAt: null,
      }),
    ).toBe(0);
  });

  it('counts only running time', () => {
    expect(
      elapsedMs({
        startedAt: start,
        stoppedAt: null,
        now: start + 10_000,
        pausedAccumMs: 0,
        pauseStartedAt: null,
      }),
    ).toBe(10_000);
  });

  it('freezes while a pause is open even if the clock moves', () => {
    const pausedAt = start + 4_000;
    expect(
      elapsedMs({
        startedAt: start,
        stoppedAt: null,
        now: pausedAt + 9_000,
        pausedAccumMs: 0,
        pauseStartedAt: pausedAt,
      }),
    ).toBe(4_000);
  });

  it('drops finished pauses and keeps later running time', () => {
    expect(
      elapsedMs({
        startedAt: start,
        stoppedAt: null,
        now: start + 12_000,
        pausedAccumMs: 6_000,
        pauseStartedAt: null,
      }),
    ).toBe(6_000);
  });

  it('stops at the finish time', () => {
    expect(
      elapsedMs({
        startedAt: start,
        stoppedAt: start + 8_000,
        now: start + 20_000,
        pausedAccumMs: 1_000,
        pauseStartedAt: null,
      }),
    ).toBe(7_000);
  });
});
