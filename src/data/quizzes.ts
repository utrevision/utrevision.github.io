import lianpo from './lianpo.json' with { type: 'json' };
import passages from './8passages.json' with { type: 'json' };
import type { Quiz, QuizId, QuizItem } from '../types.ts';

/**
 * Firestore `attempts.total`.
 * Gloss banks store the item count. The long-answer paper stores its mark total.
 */
export const QUIZ_TOTALS: Record<QuizId, number> = {
  lianpo: 65,
  '8passages': 100,
  'lianpo-longq-2': 30,
  'eight-longq-1': 30,
};

function asQuiz(id: QuizId, title: string, items: QuizItem[]): Quiz {
  return { id, title, items };
}

export const quizzes: readonly Quiz[] = [
  asQuiz('lianpo', lianpo.title, lianpo.items),
  asQuiz('8passages', passages.title, passages.items),
];

export function isQuizId(id: string | undefined): id is QuizId {
  return id === 'lianpo' || id === '8passages' || id === 'lianpo-longq-2' || id === 'eight-longq-1';
}

export function getQuiz(id: string | undefined): Quiz | undefined {
  if (!isQuizId(id)) return undefined;
  return quizzes.find((quiz) => quiz.id === id);
}
