import { describe, expect, it } from 'vitest';
import { aiGradeLogInput } from './aiGradeLog.ts';
import type { AiGradeRequest } from './resolveGrade.ts';

const request: AiGradeRequest = {
  stem: '而束君歸趙矣',
  target: '束',
  fullCredit: ['束縛'],
  halfCredit: ['約束'],
  student: '綁住',
};

describe('ai grade log', () => {
  it('stores a model verdict only when Gemini returned a reason', () => {
    expect(
      aiGradeLogInput(request, { score: 1, reason: '近義動詞' }, { uid: 'student', quizId: 'lianpo' }),
    ).toEqual({
      uid: 'student',
      quizId: 'lianpo',
      stem: '而束君歸趙矣',
      target: '束',
      student: '綁住',
      score: 1,
      reason: '近義動詞',
    });
    expect(
      aiGradeLogInput(request, { score: 0, reason: '詞義不同' }, { uid: 'student', quizId: '8passages' }),
    ).toMatchObject({ score: 0, reason: '詞義不同', quizId: '8passages' });
  });

  it('skips blank reasons, literal-only scores, and rows that cannot name the owner or quiz', () => {
    expect(aiGradeLogInput(request, { score: 1 }, { uid: 'student', quizId: 'lianpo' })).toBeNull();
    expect(aiGradeLogInput(request, { score: 0, reason: '   ' }, { uid: 'student', quizId: 'lianpo' })).toBeNull();
    expect(aiGradeLogInput(request, { score: 1, reason: '同義' }, { quizId: 'lianpo' })).toBeNull();
    expect(aiGradeLogInput(request, { score: 1, reason: '同義' }, { uid: 'student' })).toBeNull();
    expect(
      aiGradeLogInput({ ...request, student: '  ' }, { score: 1, reason: '同義' }, { uid: 'student', quizId: 'lianpo' }),
    ).toBeNull();
  });
});