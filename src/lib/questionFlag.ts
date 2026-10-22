import { isQuizId } from '../data/quizzes.ts';
import type { LongItem, LongRow } from '../grading/longq.ts';
import { formatScore, itemVerdict, verdictOf } from './format.ts';
import type { QuizId } from '../types.ts';

/** Inbox stored on the questionFlags audit doc. Override with VITE_FLAG_NOTIFY_EMAIL. It is not written into the flag email. */
export const DEFAULT_FLAG_NOTIFY_EMAIL = 'lkh81397@gmail.com';

/**
 * Limits mirrored in firestore.rules for questionFlags.
 * Changing a number here without the rules (or the other way around) fails the rules test.
 */
export const FLAG_LIMITS = {
  displayName: 80,
  quizTitle: 160,
  itemId: 200,
  qNo: 16,
  stem: 2000,
  target: 80,
  studentAnswer: 8000,
  suggestedAnswer: 8000,
  pointsNote: 8000,
  studentEmail: 254,
  notifyEmail: 120,
  max: 30,
} as const;

export const QUESTION_FLAG_FIELDS = [
  'uid',
  'displayName',
  'quizId',
  'quizTitle',
  'itemId',
  'qNo',
  'stem',
  'target',
  'studentAnswer',
  'suggestedAnswer',
  'pointsNote',
  'score',
  'max',
  'outcome',
  'studentEmail',
  'notifyEmail',
  'emailStatus',
  'finishedAt',
  'createdAt',
] as const;

export type FlagEmailStatus = 'sent' | 'failed' | 'skipped';

export type FlagOutcome = '對' | '半分' | '錯';

/** One settlement row, before quiz and student identity are attached. */
export type FlagQuestion = {
  itemId: string;
  qNo: string;
  stem: string;
  target: string;
  studentAnswer: string;
  suggestedAnswer: string;
  pointsNote: string;
  score: number;
  max: number;
  outcome: FlagOutcome;
};

export type QuestionFlagHandler = (question: FlagQuestion) => Promise<FlagEmailStatus>;

export type QuestionFlagInput = FlagQuestion & {
  quizId: QuizId;
  quizTitle: string;
  finishedAt: Date;
  uid: string;
  displayName: string | null;
  studentEmail?: string | null;
};

export type NormalizedQuestionFlag = FlagQuestion & {
  quizId: QuizId;
  quizTitle: string;
  finishedAt: Date;
  uid: string;
  displayName: string;
  studentEmail: string;
  notifyEmail: string;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FORMSPREE_ID = /^[A-Za-z0-9]{4,64}$/;

export function flagNotifyEmail(source = import.meta.env.VITE_FLAG_NOTIFY_EMAIL): string {
  const trimmed = (source ?? '').trim();
  if (trimmed.length > 0 && trimmed.length <= FLAG_LIMITS.notifyEmail && EMAIL_PATTERN.test(trimmed)) {
    return trimmed;
  }
  return DEFAULT_FLAG_NOTIFY_EMAIL;
}

/** Accepts a bare Formspree id or a https://formspree.io/f/<id> URL. */
export function formspreeFormId(source = import.meta.env.VITE_FLAG_FORMSPREE_ID): string {
  const trimmed = (source ?? '').trim();
  const fromUrl = trimmed.match(/formspree\.io\/f\/([A-Za-z0-9]{4,64})\/?(?:\?.*)?$/i);
  return fromUrl?.[1] ?? trimmed;
}

export function clipFlagText(value: string, max: number): string {
  const cleaned = value.replaceAll('\0', '').replaceAll('\r\n', '\n').trim();
  if (cleaned.length <= max) return cleaned;
  if (max <= 1) return cleaned.slice(0, max);
  return `${cleaned.slice(0, max - 1)}…`;
}

function flagDisplayName(name: string | null | undefined): string {
  const trimmed = (name ?? '').trim().replace(/\s+/g, ' ');
  if (!trimmed) return '未命名';
  return trimmed.slice(0, FLAG_LIMITS.displayName);
}

function cleanEmail(value: string | null | undefined, max: number): string {
  const trimmed = (value ?? '').trim();
  if (!trimmed || trimmed.length > max || !EMAIL_PATTERN.test(trimmed)) return '';
  return trimmed;
}

function snapHalf(value: number): number {
  if (!Number.isFinite(value)) throw new Error('回報未能記下，請再試一次。');
  const snapped = Math.round(value * 2) / 2;
  if (Math.abs(snapped - value) > 1e-6) throw new Error('回報未能記下，請再試一次。');
  return snapped;
}

export function normalizeQuestionFlag(input: QuestionFlagInput): NormalizedQuestionFlag {
  if (!isQuizId(input.quizId)) throw new Error('回報未能記下，請再試一次。');
  const uid = input.uid.trim();
  if (uid.length === 0 || uid.length > 128) throw new Error('請先登入，才能回報題目。');
  if (input.outcome !== '對' && input.outcome !== '半分' && input.outcome !== '錯') {
    throw new Error('回報未能記下，請再試一次。');
  }
  const max = snapHalf(input.max);
  const score = snapHalf(input.score);
  if (max <= 0 || max > FLAG_LIMITS.max || score < 0 || score > max) {
    throw new Error('回報未能記下，請再試一次。');
  }
  const finishedAt =
    input.finishedAt instanceof Date && !Number.isNaN(input.finishedAt.getTime()) ? input.finishedAt : new Date();
  const itemId = clipFlagText(input.itemId, FLAG_LIMITS.itemId) || 'item';
  const qNo = clipFlagText(input.qNo, FLAG_LIMITS.qNo) || '—';
  const stem = clipFlagText(input.stem, FLAG_LIMITS.stem) || '（無題幹）';
  const quizTitle = clipFlagText(input.quizTitle, FLAG_LIMITS.quizTitle) || input.quizId;
  return {
    quizId: input.quizId,
    quizTitle,
    itemId,
    qNo,
    stem,
    target: clipFlagText(input.target, FLAG_LIMITS.target),
    studentAnswer: clipFlagText(input.studentAnswer, FLAG_LIMITS.studentAnswer),
    suggestedAnswer: clipFlagText(input.suggestedAnswer, FLAG_LIMITS.suggestedAnswer),
    pointsNote: clipFlagText(input.pointsNote, FLAG_LIMITS.pointsNote),
    score,
    max,
    outcome: input.outcome,
    finishedAt,
    uid,
    displayName: flagDisplayName(input.displayName),
    studentEmail: cleanEmail(input.studentEmail, FLAG_LIMITS.studentEmail),
    notifyEmail: flagNotifyEmail(),
  };
}

export function questionFlagDocument(
  draft: NormalizedQuestionFlag,
  emailStatus: FlagEmailStatus,
  stamps: { finishedAt: unknown; createdAt: unknown },
): Record<(typeof QUESTION_FLAG_FIELDS)[number], unknown> {
  return {
    uid: draft.uid,
    displayName: draft.displayName,
    quizId: draft.quizId,
    quizTitle: draft.quizTitle,
    itemId: draft.itemId,
    qNo: draft.qNo,
    stem: draft.stem,
    target: draft.target,
    studentAnswer: draft.studentAnswer,
    suggestedAnswer: draft.suggestedAnswer,
    pointsNote: draft.pointsNote,
    score: draft.score,
    max: draft.max,
    outcome: draft.outcome,
    studentEmail: draft.studentEmail,
    notifyEmail: draft.notifyEmail,
    emailStatus,
    finishedAt: stamps.finishedAt,
    createdAt: stamps.createdAt,
  };
}

function joinParts(parts: readonly (string | undefined)[]): string {
  return parts
    .map((part) => part?.trim() ?? '')
    .filter((part) => part.length > 0)
    .join('\n');
}

export function longQuestionIdentity(
  item: LongItem | undefined,
  fallback: { title: string; itemId: string },
): { stem: string; target: string } {
  if (!item) return { stem: fallback.title || fallback.itemId, target: '' };
  switch (item.type) {
    case 'gloss':
      return { stem: item.stem, target: item.target };
    case 'mc':
      return { stem: joinParts([item.prompt, item.stem]), target: item.target ?? '' };
    case 'recite':
    case 'short_fill':
    case 'kara_table':
      return { stem: item.prompt, target: '' };
    case 'sentence_translate':
    case 'long_points':
      return { stem: joinParts([item.prompt, item.quote, item.source]), target: '' };
  }
}

export function formatPointsNote(
  points: readonly { desc: string; hit: boolean; awarded: number; max: number; evidence?: string }[],
  aiUnavailable: boolean,
): string {
  const lines = points.map((point) => {
    const evidence = point.evidence?.trim() ? ` 證據：${point.evidence.trim()}` : '';
    return `${point.hit ? '對' : '錯'} ${point.desc}（${formatScore(point.awarded)}／${formatScore(point.max)}）${evidence}`;
  });
  if (aiUnavailable) lines.push('這題有給分點未能完成智能評分。');
  return lines.join('\n');
}

export function glossFlagQuestion(
  row: { stem: string; target: string; raw: string; score: number; suggested: string },
  index: number,
): FlagQuestion {
  return {
    itemId: `gloss:${row.target}:${row.stem}`,
    qNo: String(index + 1),
    stem: row.stem,
    target: row.target,
    studentAnswer: row.raw,
    suggestedAnswer: row.suggested,
    pointsNote: '',
    score: row.score,
    max: 1,
    outcome: verdictOf(row.score),
  };
}

export function longFlagQuestion(row: LongRow, item: LongItem | undefined): FlagQuestion {
  const identity = longQuestionIdentity(item, row);
  return {
    itemId: row.itemId,
    qNo: row.qNo,
    stem: identity.stem || row.title || row.itemId,
    target: identity.target,
    studentAnswer: row.yours,
    suggestedAnswer: row.suggested,
    pointsNote: formatPointsNote(row.points, row.aiUnavailable),
    score: row.score,
    max: row.max,
    outcome: itemVerdict(row.score, row.max),
  };
}

function showText(value: string, empty: string): string {
  return value.trim() ? value : empty;
}

export function flagEmailSubject(draft: Pick<NormalizedQuestionFlag, 'quizTitle' | 'qNo'>): string {
  return `題目回報｜${draft.quizTitle}｜第${draft.qNo}題`;
}

/** Short teacher notice. The Firestore audit doc keeps the fields this omits. */
export function flagEmailMessage(draft: NormalizedQuestionFlag): string {
  const lines = [
    '文言溫習小測：有學生在結算頁回報題目，請檢視是否需要修訂。',
    '',
    `小測：${draft.quizTitle}`,
    `題號：${draft.qNo}`,
    draft.itemId.startsWith('gloss:')
      ? '題號是這一次結算表上的次序（語譯題目有打亂），請以題幹和考查字認題。'
      : '題號是卷面題號。',
    `題幹：${showText(draft.stem, '（無題幹）')}`,
    `考查：${showText(draft.target, '（無）')}`,
    `學生答案：${showText(draft.studentAnswer, '（空白）')}`,
    `建議答案：${showText(draft.suggestedAnswer, '（無）')}`,
    `結果：${draft.outcome}（${formatScore(draft.score)}／${formatScore(draft.max)}）`,
    `學生：${draft.displayName}`,
  ];
  if (draft.studentEmail) lines.push(`學生電郵：${draft.studentEmail}`);
  return lines.join('\n');
}

export function flagMailBody(draft: NormalizedQuestionFlag): Record<string, string> {
  const body: Record<string, string> = {
    _subject: flagEmailSubject(draft),
    _gotcha: '',
    message: flagEmailMessage(draft),
  };
  if (draft.studentEmail) body._replyto = draft.studentEmail;
  return body;
}

export type FlagMailOptions = {
  formId?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

export function isFormspreeFormId(value: string): boolean {
  return FORMSPREE_ID.test(value);
}

export async function sendFlagEmail(
  draft: NormalizedQuestionFlag,
  options: FlagMailOptions = {},
): Promise<FlagEmailStatus> {
  const formId = (options.formId ?? formspreeFormId()).trim();
  if (!formId) return 'skipped';
  if (!isFormspreeFormId(formId)) return 'failed';
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 12_000);
  try {
    const response = await fetchImpl(`https://formspree.io/f/${formId}`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(flagMailBody(draft)),
      signal: controller.signal,
    });
    return response.ok ? 'sent' : 'failed';
  } catch {
    return 'failed';
  } finally {
    clearTimeout(timer);
  }
}
