import lianpoLong from './lianpo-longq-2.json' with { type: 'json' };
import eightLong from './eight-longq-1.json' with { type: 'json' };
import type { LongQuiz } from '../grading/longq.ts';

export const longQuizzes: readonly LongQuiz[] = [lianpoLong as LongQuiz, eightLong as LongQuiz];

export function getLongQuiz(id: string | undefined): LongQuiz | undefined {
  if (!id) return undefined;
  return longQuizzes.find((quiz) => quiz.id === id);
}
