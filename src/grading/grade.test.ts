import OpenCC from 'opencc-js/cn2t';
import { describe, expect, it } from 'vitest';
import gradingRl from './grading-rl.json' with { type: 'json' };
import { getQuiz, quizzes } from '../data/quizzes.ts';
import { gradeItem } from './grade.ts';
import { normalizeAnswer, toSimplified } from './normalize.ts';
import type { Quiz, QuizItem, Score } from '../types.ts';

const toTraditional = OpenCC.Converter({ from: 'cn', to: 'tw' });

type Label = {
  quiz: string;
  stem: string;
  target: string;
  score1: string[];
  score05: string[];
  score0_examples: string[];
};

function variants(text: string): string[] {
  const simplified = toSimplified(text);
  const traditional = toTraditional(simplified);
  const spacedTraditional = [...text].join('\u3000');
  const spacedSimplified = [...simplified].join(' ');
  return [...new Set([text, simplified, traditional, spacedTraditional, spacedSimplified])];
}

function quizzesFor(label: Label): Quiz[] {
  return label.quiz.split('/').map((id) => {
    const quiz = getQuiz(id);
    if (!quiz) throw new Error(`unknown quiz ${id}`);
    return quiz;
  });
}

function findItem(quiz: Quiz, label: Label): QuizItem {
  const item = quiz.items.find(
    (candidate) => candidate.stem === label.stem && candidate.target === label.target,
  );
  if (!item) {
    throw new Error(`${quiz.id} missing ${label.stem} / ${label.target}`);
  }
  return item;
}

describe('grading rules from wenyan-quiz-grading-rl', () => {
  for (const label of gradingRl.labels as Label[]) {
    for (const quiz of quizzesFor(label)) {
      const item = findItem(quiz, label);
      const groups: Array<[string, Score]> = [
        ...label.score1.map((answer) => [answer, 1] as [string, Score]),
        ...label.score05.map((answer) => [answer, 0.5] as [string, Score]),
        ...label.score0_examples.map((answer) => [answer, 0] as [string, Score]),
      ];

      for (const [answer, expected] of groups) {
        for (const variant of variants(answer)) {
          it(`${quiz.id}｜${label.stem}｜${label.target}｜${JSON.stringify(variant)} → ${expected}`, () => {
            expect(gradeItem(item, variant)).toBe(expected);
          });
        }
      }
    }
  }
});

describe('normalize', () => {
  it('treats full-width and half-width letters and slashes as the same', () => {
    expect(normalizeAnswer('Ａ／Ｂ')).toBe(normalizeAnswer('A/B'));
    expect(normalizeAnswer('（）＝')).toBe(normalizeAnswer('()='));
  });

  it('strips spaces and matches mixed traditional and simplified', () => {
    expect(normalizeAnswer('担　憂')).toBe(normalizeAnswer('擔憂'));
    expect(normalizeAnswer('担心')).toBe(normalizeAnswer('擔心'));
    expect(normalizeAnswer('祸 患')).toBe(normalizeAnswer('禍患'));
  });

  it('matches the parenthetical gloss after width normalization', () => {
    const quiz = getQuiz('8passages');
    const item = quiz?.items.find((candidate) => candidate.stem === '而未始知西山之怪特');
    expect(item).toBeTruthy();
    if (!item) return;
    expect(gradeItem(item, '曾经(未始=未曾)')).toBe(1);
    expect(gradeItem(item, '曾')).toBe(1);
  });
});

describe('no guessed half credit', () => {
  it('scores an unlisted near-miss as 0', () => {
    const item = getQuiz('lianpo')?.items.find((candidate) => candidate.stem === '而束君歸趙矣');
    expect(item).toBeTruthy();
    if (!item) return;
    expect(gradeItem(item, '綁住')).toBe(0);
    expect(gradeItem(item, '束')).toBe(0);
    expect(gradeItem(item, '')).toBe(0);
    expect(gradeItem(item, '   ')).toBe(0);
    expect(gradeItem(item, '蘋果')).toBe(0);
  });

  it('keeps accept05 disjoint from full-credit answers', () => {
    for (const quiz of quizzes) {
      for (const item of quiz.items) {
        const full = new Set(
          [...item.answers, ...(item.accept1 ?? [])].map((answer) => normalizeAnswer(answer)),
        );
        for (const half of item.accept05 ?? []) {
          expect(full.has(normalizeAnswer(half)), `${quiz.id} ${item.stem} ${half}`).toBe(false);
        }
      }
    }
  });
});

describe('question banks', () => {
  it('has 66 lianpo items and 100 eight-passage items', () => {
    expect(getQuiz('lianpo')?.items).toHaveLength(66);
    expect(getQuiz('8passages')?.items).toHaveLength(100);
    expect(getQuiz('lianpo')?.title).toBe('《廉頗藺相如列傳》溫習小測（甲部）');
    expect(getQuiz('8passages')?.title).toBe('指定文言八篇溫習小測（甲部）');
  });
});
