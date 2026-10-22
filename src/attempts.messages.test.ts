import { describe, expect, it } from 'vitest';
import { firestoreErrorMessage } from './attempts.ts';

describe('firestore error copy', () => {
  it('keeps leaderboard and answer failures distinct', () => {
    const denied = Object.assign(new Error('permission-denied'), { code: 'permission-denied' });
    expect(firestoreErrorMessage(denied)).toContain('排行榜');
    expect(firestoreErrorMessage(denied, 'answers')).toContain('今次答案');
    expect(firestoreErrorMessage(new Error('timeout'), 'answers')).toContain('儲存答案逾時');
    expect(firestoreErrorMessage(new Error('other'), 'answers')).toBe('今次答案暫時未能儲存，請再試一次。');
  });
});