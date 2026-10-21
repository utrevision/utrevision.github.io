import raw from './lianpo-longq-2.json' with { type: 'json' };
import type { LongQuiz } from '../grading/longq.ts';

const paper = raw as LongQuiz;

export const longQuizzes: readonly LongQuiz[] = [paper];

export function getLongQuiz(id: string | undefined): LongQuiz | undefined {
  if (!id) return undefined;
  return longQuizzes.find((quiz) => quiz.id === id);
}
