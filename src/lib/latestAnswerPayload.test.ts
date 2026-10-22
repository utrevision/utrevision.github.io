import { describe, expect, it } from 'vitest';
import { longQuizzes } from '../data/longQuizzes.ts';
import { getQuiz } from '../data/quizzes.ts';
import { fieldKey, longGradedFieldKeys, type LongItem, type LongQuiz } from '../grading/longq.ts';
import type { QuizId } from '../types.ts';
import {
  GLOSS_ANSWER_CHARS,
  glossAnswerKey,
  glossAnswerMap,
  longPaperAnswers,
  planLatestAnswerWrite,
} from './latestAnswerPayload.ts';

function openKeys(paper: LongQuiz): string[] {
  const keys: string[] = [];
  for (const item of paper.items) {
    if (item.type === 'kara_table') {
      for (const row of item.rows) {
        for (const cell of row.cells) {
          if (!cell.given) keys.push(fieldKey(item.id, row.person, cell.key));
        }
      }
    } else {
      keys.push(item.id);
    }
  }
  return keys;
}

function givenKeys(paper: LongQuiz): string[] {
  const keys: string[] = [];
  for (const item of paper.items) {
    if (item.type !== 'kara_table') continue;
    for (const row of item.rows) {
      for (const cell of row.cells) {
        if (cell.given) keys.push(fieldKey(item.id, row.person, cell.key));
      }
    }
  }
  return keys;
}

function capFor(item: LongItem, key: string): number {
  if (item.type === 'kara_table') {
    for (const row of item.rows) {
      for (const cell of row.cells) {
        if (cell.given) continue;
        if (fieldKey(item.id, row.person, cell.key) !== key) continue;
        return cell.points && cell.points.length > 0 ? 400 : 40;
      }
    }
    return 40;
  }
  switch (item.type) {
    case 'gloss':
      return GLOSS_ANSWER_CHARS;
    case 'mc':
      return 8;
    case 'recite':
      return 80;
    case 'short_fill':
      return 20;
    case 'sentence_translate':
    case 'long_points':
      return 1500;
    default:
      return 1500;
  }
}

describe('latest answer payload', () => {
  it('overwrites with the student text even when the score is worse', () => {
    const write = planLatestAnswerWrite({
      uid: 'ab_cd',
      displayName: '  陳  大文  ',
      quizId: 'lianpo',
      score: 1,
      total: 65,
      durationMs: 1500.4,
      answers: { '束｜而束君歸趙矣': '  綁住  ' },
    });
    expect(write).toEqual({
      id: 'ab_cd_lianpo',
      data: {
        uid: 'ab_cd',
        displayName: '陳 大文',
        quizId: 'lianpo',
        score: 1,
        total: 65,
        durationMs: 1500,
        answers: { '束｜而束君歸趙矣': '  綁住  ' },
      },
    });
    expect(write.data).not.toHaveProperty('hitRate');
  });

  it('keeps a gloss answer under its input cap and leaves the answer key out', () => {
    const map = glossAnswerMap([
      { item: { stem: '而束君歸趙矣', target: '束' }, raw: `  ${'綁'.repeat(50)}` },
    ]);
    expect(glossAnswerKey({ stem: '而束君歸趙矣', target: '束' })).toBe('束｜而束君歸趙矣');
    expect(map['束｜而束君歸趙矣']).toHaveLength(GLOSS_ANSWER_CHARS);
    expect(map['束｜而束君歸趙矣']?.startsWith('  綁')).toBe(true);
    expect(JSON.stringify(map)).not.toContain('束縛');
  });

  it('rejects a duplicate gloss identity, a bad uid, and a total that is not the quiz total', () => {
    expect(() =>
      glossAnswerMap([
        { item: { stem: '句', target: '字' }, raw: '甲' },
        { item: { stem: '句', target: '字' }, raw: '乙' },
      ]),
    ).toThrow('答案資料不完整');
    expect(() =>
      planLatestAnswerWrite({
        uid: 'a/b',
        displayName: '甲',
        quizId: 'lianpo',
        score: 0,
        total: 65,
        durationMs: 1,
        answers: {},
      }),
    ).toThrow('答案資料不完整');
    expect(() =>
      planLatestAnswerWrite({
        uid: 'student',
        displayName: null,
        quizId: '8passages',
        score: 1,
        total: 65,
        durationMs: 1,
        answers: {},
      }),
    ).toThrow('答案資料不完整');
  });

  it('names a blank student 未命名 and snaps the score and duration into the rules window', () => {
    const write = planLatestAnswerWrite({
      uid: 'student',
      displayName: '   ',
      quizId: '8passages',
      score: 10.2,
      total: 100,
      durationMs: 9_999_999_999,
      answers: { '字｜句': '答' },
    });
    expect(write.data.displayName).toBe('未命名');
    expect(write.data.score).toBe(10);
    expect(write.data.durationMs).toBe(604_800_000);
    expect(write.id).toBe('student_8passages');
  });

  it('stores every live gloss item once, capped, under the rules budget', () => {
    for (const id of ['lianpo', '8passages'] as const satisfies readonly QuizId[]) {
      const quiz = getQuiz(id);
      expect(quiz).toBeTruthy();
      const map = glossAnswerMap(quiz!.items.map((item) => ({ item, raw: '答'.repeat(80) })));
      expect(Object.keys(map)).toHaveLength(quiz!.items.length);
      expect(Object.values(map).every((value) => value.length === GLOSS_ANSWER_CHARS)).toBe(true);
      expect(Object.keys(map).join('')).not.toMatch(/[.~*/[\]`]/);
      expect(() =>
        planLatestAnswerWrite({
          uid: 'student',
          displayName: '學生',
          quizId: id,
          score: 0,
          total: quiz!.items.length,
          durationMs: 1000,
          answers: map,
        }),
      ).not.toThrow();
    }
  });

  it('stores every graded long-paper field, including blanks, and drops anything else', () => {
    expect(longQuizzes.map((paper) => paper.id)).toEqual([
      'lianpo-longq-1',
      'lianpo-longq-2',
      'lianpo-longq-3',
      'eight-longq-1',
    ]);
    for (const paper of longQuizzes) {
      const blank = longPaperAnswers(paper, { stray: '不應寫入' });
      expect(Object.keys(blank)).toEqual(openKeys(paper));
      expect(Object.keys(blank)).toEqual(paper.items.flatMap((item) => longGradedFieldKeys(item)));
      expect(Object.values(blank).every((value) => value === '')).toBe(true);
      for (const key of givenKeys(paper)) expect(blank).not.toHaveProperty(key);

      const stuffed: Record<string, string> = {};
      for (const key of openKeys(paper)) stuffed[key] = '答'.repeat(2000);
      const full = longPaperAnswers(paper, stuffed);
      for (const item of paper.items) {
        for (const key of longGradedFieldKeys(item)) {
          expect(full[key]).toHaveLength(capFor(item, key));
        }
      }
      expect(full).not.toHaveProperty('stray');
      expect(() =>
        planLatestAnswerWrite({
          uid: 'student',
          displayName: '學生',
          quizId: paper.id,
          score: 0,
          total: 30,
          durationMs: 1000,
          answers: full,
        }),
      ).not.toThrow();
    }
  });

  it('swaps Firestore-hostile characters in a field key', () => {
    const write = planLatestAnswerWrite({
      uid: 'student',
      displayName: '甲',
      quizId: 'lianpo-longq-1',
      score: 0,
      total: 30,
      durationMs: 1,
      answers: { 'q.1': '甲' },
    });
    expect(write.data.answers).toEqual({ 'q．1': '甲' });
  });
});
