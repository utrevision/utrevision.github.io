import { QUIZ_TOTALS } from '../data/quizzes.ts';
import { fieldKey, longGradedFieldKeys, type LongItem, type LongQuiz } from '../grading/longq.ts';
import type { QuizId } from '../types.ts';
import { attemptDisplayName, attemptDurationMs, normalizeAttemptScore } from './attemptPayload.ts';

export const LATEST_ANSWERS = 'latestAnswers';

/**
 * Bounds mirrored in `firestore.rules`.
 * Rules can cap the map size and the joined text. They cannot loop, so each
 * string is capped here before the write.
 */
export const MAX_LATEST_ANSWER_ENTRIES = 120;
export const MAX_ANSWER_KEY_CHARS = 80;
export const MAX_ANSWER_VALUE_CHARS = 1500;
export const MAX_LATEST_ANSWERS_TEXT_CHARS = 12_000;
export const MAX_LATEST_ANSWER_KEYS_TEXT_CHARS = 4_000;

/** `QuizPage` gloss input `maxLength`. */
export const GLOSS_ANSWER_CHARS = 40;

const KEY_REPLACEMENTS: Record<string, string> = {
  '.': '．',
  '~': '～',
  '*': '＊',
  '/': '／',
  '[': '〔',
  ']': '〕',
  '`': '＇',
};

/**
 * Firestore map keys cannot be empty or `__.*__`. Dots and a few other
 * characters break field paths, so they are swapped for fullwidth lookalikes.
 * Live quiz keys do not contain those characters; the swap keeps a future
 * stem from dropping an answer.
 */
export function firestoreMapKey(key: string): string {
  let safe = '';
  for (const ch of key) safe += KEY_REPLACEMENTS[ch] ?? ch;
  safe = safe.trim();
  if (!safe || safe.length > MAX_ANSWER_KEY_CHARS || /^__.*__$/.test(safe)) {
    throw new Error('答案資料不完整');
  }
  return safe;
}

/**
 * Gloss banks have no item id. A regrade joins the current bank with this
 * function: `標的字｜題幹`. Both live banks are unique on that pair.
 */
export function glossAnswerKey(item: { stem: string; target: string }): string {
  const target = item.target.trim();
  const stem = item.stem.trim();
  if (!target || !stem) throw new Error('答案資料不完整');
  return firestoreMapKey(`${target}｜${stem}`);
}

export function glossAnswerMap(
  given: readonly { item: { stem: string; target: string }; raw: string }[],
): Record<string, string> {
  const answers: Record<string, string> = {};
  for (const entry of given) {
    const key = glossAnswerKey(entry.item);
    if (Object.hasOwn(answers, key)) throw new Error('答案資料不完整');
    answers[key] = boundAnswerValue(entry.raw, GLOSS_ANSWER_CHARS);
  }
  return answers;
}

function boundAnswerValue(value: string, max: number): string {
  if (value.length <= max) return value;
  return value.slice(0, max);
}

function itemValueCap(item: Exclude<LongItem, { type: 'kara_table' }>): number {
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
      return MAX_ANSWER_VALUE_CHARS;
    default: {
      const unexpected: never = item;
      throw new Error(`答案資料不完整:${String(unexpected)}`);
    }
  }
}

function karaValueCap(item: Extract<LongItem, { type: 'kara_table' }>, key: string): number {
  for (const row of item.rows) {
    for (const cell of row.cells) {
      if (cell.given) continue;
      if (fieldKey(item.id, row.person, cell.key) !== key) continue;
      return cell.points && cell.points.length > 0 ? 400 : 40;
    }
  }
  return 40;
}

/**
 * One string per field `gradeLongPaper` reads, including blanks.
 * Keys the page did not collect stay `''`. Extra keys are omitted.
 * Suggested answers and point rubrics are not copied; a regrade loads those
 * from the current paper.
 */
export function longPaperAnswers(
  paper: LongQuiz,
  submitted: Readonly<Record<string, string>>,
): Record<string, string> {
  const answers: Record<string, string> = {};
  for (const item of paper.items) {
    for (const key of longGradedFieldKeys(item)) {
      const safeKey = firestoreMapKey(key);
      if (Object.hasOwn(answers, safeKey)) throw new Error('答案資料不完整');
      const cap = item.type === 'kara_table' ? karaValueCap(item, key) : itemValueCap(item);
      answers[safeKey] = boundAnswerValue(submitted[key] ?? '', cap);
    }
  }
  return answers;
}

export type LatestAnswerWrite = {
  id: string;
  data: {
    uid: string;
    displayName: string;
    quizId: QuizId;
    score: number;
    total: number;
    durationMs: number;
    answers: Record<string, string>;
  };
};

function assertUid(uid: string): void {
  if (!uid || uid.length > 128 || uid.includes('/') || uid.includes(' ')) {
    throw new Error('答案資料不完整');
  }
}

function assertAnswerMap(answers: Readonly<Record<string, string>>): Record<string, string> {
  const bounded: Record<string, string> = {};
  for (const [key, value] of Object.entries(answers)) {
    if (typeof value !== 'string') throw new Error('答案資料不完整');
    const safeKey = firestoreMapKey(key);
    if (Object.hasOwn(bounded, safeKey)) throw new Error('答案資料不完整');
    bounded[safeKey] = boundAnswerValue(value, MAX_ANSWER_VALUE_CHARS);
  }
  const keys = Object.keys(bounded);
  if (keys.length > MAX_LATEST_ANSWER_ENTRIES) throw new Error('答案資料不完整');
  const keyChars = keys.reduce((sum, key) => sum + key.length, 0);
  const valueChars = keys.reduce((sum, key) => sum + (bounded[key]?.length ?? 0), 0);
  if (keyChars > MAX_LATEST_ANSWER_KEYS_TEXT_CHARS || valueChars > MAX_LATEST_ANSWERS_TEXT_CHARS) {
    throw new Error('答案資料不完整');
  }
  return bounded;
}

/**
 * Payload for the single `latestAnswers` document `{uid}_{quizId}`.
 * Always overwrites. This does not read or compare any previous attempt,
 * so a lower score still replaces the stored answers.
 */
export function planLatestAnswerWrite(input: {
  uid: string;
  displayName: string | null;
  quizId: QuizId;
  score: number;
  total: number;
  durationMs: number;
  answers: Readonly<Record<string, string>>;
}): LatestAnswerWrite {
  if (
    !Number.isFinite(input.score) ||
    !Number.isFinite(input.durationMs) ||
    input.total !== QUIZ_TOTALS[input.quizId]
  ) {
    throw new Error('答案資料不完整');
  }
  assertUid(input.uid);
  return {
    id: `${input.uid}_${input.quizId}`,
    data: {
      uid: input.uid,
      displayName: attemptDisplayName(input.displayName),
      quizId: input.quizId,
      score: normalizeAttemptScore(input.score, input.total),
      total: input.total,
      durationMs: attemptDurationMs(input.durationMs),
      answers: assertAnswerMap(input.answers),
    },
  };
}
