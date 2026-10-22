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

/**
 * Teacher-listed near misses (accept05[]). They are not full credit.
 * Kept so the model can be told to score them 0, and so a literal hit
 * stays 0 without asking the model to upgrade it.
 */
export function halfCreditAnswers(item: QuizItem): string[] {
  const full = new Set(fullCreditAnswers(item).map((answer) => normalizeAnswer(answer)));
  return uniqueOriginals(item.accept05 ?? []).filter(
    (answer) => !full.has(normalizeAnswer(answer)),
  );
}

/** True when the answer is on accept05[] and not also a full-credit answer. */
export function matchesNonFullList(item: QuizItem, raw: string): boolean {
  const student = normalizeAnswer(raw);
  if (!student) return false;
  return halfCreditAnswers(item).some((answer) => normalizeAnswer(answer) === student);
}

/**
 * 1 if the gloss matches answers[] or accept1[].
 * Otherwise 0. accept05[] is not full credit.
 * Unlisted answers stay 0 here; resolveGrade may ask the model for a
 * synonym worth 1. The model cannot award a fraction.
 */
export function gradeItem(item: QuizItem, raw: string): Score {
  const student = normalizeAnswer(raw);
  if (!student) return 0;
  if (fullCreditAnswers(item).some((answer) => normalizeAnswer(answer) === student)) {
    return 1;
  }
  return 0;
}
