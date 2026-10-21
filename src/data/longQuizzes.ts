import lianpoLong1 from './lianpo-longq-1.json' with { type: 'json' };
import lianpoLong2 from './lianpo-longq-2.json' with { type: 'json' };
import lianpoLong3 from './lianpo-longq-3.json' with { type: 'json' };
import eightLong from './eight-longq-1.json' with { type: 'json' };
import type { LongQuiz } from '../grading/longq.ts';

export const longQuizzes: readonly LongQuiz[] = [
  lianpoLong1 as LongQuiz,
  lianpoLong2 as LongQuiz,
  lianpoLong3 as LongQuiz,
  eightLong as LongQuiz,
];

export function getLongQuiz(id: string | undefined): LongQuiz | undefined {
  if (!id) return undefined;
  return longQuizzes.find((quiz) => quiz.id === id);
}
