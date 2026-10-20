import { normalizeAnswer } from './normalize.ts';
import type { QuizItem, Score } from '../types.ts';

function uniqueOriginals(answers: readonly string[]): string[] {
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const answer of answers) {
    const key = normalizeAnswer(answer);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    kept.push(answer);
  }
  return kept;
}

/** Score 1 glosses: answers[] plus teacher-listed accept1[]. */
export function fullCreditAnswers(item: QuizItem): string[] {
  return uniqueOriginals([...item.answers, ...(item.accept1 ?? [])]);
}

/** Score 0.5 glosses. Never inferred; only accept05[], and never if they also score 1. */
export function halfCreditAnswers(item: QuizItem): string[] {
  const full = new Set(fullCreditAnswers(item).map((answer) => normalizeAnswer(answer)));
  return uniqueOriginals(item.accept05 ?? []).filter(
    (answer) => !full.has(normalizeAnswer(answer)),
  );
}

/**
 * 1 if the gloss matches answers[] or accept1[].
 * 0.5 only if it matches teacher-written accept05[].
 * Otherwise 0. Wrong meaning is 0 because it is not listed.
 * Unlisted answers stay 0 here; resolveGrade may ask the model for a
 * synonym worth 1, and still cannot invent 0.5.
 */
export function gradeItem(item: QuizItem, raw: string): Score {
  const student = normalizeAnswer(raw);
  if (!student) return 0;
  if (fullCreditAnswers(item).some((answer) => normalizeAnswer(answer) === student)) {
    return 1;
  }
  if (halfCreditAnswers(item).some((answer) => normalizeAnswer(answer) === student)) {
    return 0.5;
  }
  return 0;
}
