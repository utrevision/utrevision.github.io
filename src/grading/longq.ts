import { AI_GRADE_CONCURRENCY } from './aiPrompt.ts';
import { gradeItem } from './grade.ts';
import { normalizeAnswer } from './normalize.ts';
import { resolveGrade, type AiJudge } from './resolveGrade.ts';
import type { QuizId, QuizItem } from '../types.ts';

/**
 * Long-answer paper grading.
 *
 * MC, recite, and short fill stay on lists. Gloss and kara image cells use the
 * same lists first; a literal miss may go through the 語譯 synonym judge, which
 * can only return 0 or 1. Open items ask the point model which points were
 * expressed. This module adds the marks. It never reads a whole-question score.
 * Each scoring unit is all or nothing: a point is its full max or 0, and a
 * short answer that is not a full listed answer scores 0. Typo penalties are
 * not applied.
 */

export const LONGQ_AI_TIMEOUT_MS = 20_000;

/**
 * Contained accept phrases shorter than this stay with the model.
 * Short glosses such as 小路、衣褐 must not lock a content point inside a longer answer.
 */
const LITERAL_CONTAINS_MIN = 4;

/**
 * Technique names are often two characters (比喻、譬喻). A tech point may
 * literal-contain those listed names. Keywords stay prompt-only.
 */
const TECH_LITERAL_CONTAINS_MIN = 2;

export type PartialOnReject = {
  ifAnswerIncludes?: string[];
  andAlsoHits?: string[];
  thenHit?: boolean;
  note?: string;
};

export type PointRubric = {
  id: string;
  max: number;
  desc: string;
  accept?: string[];
  reject?: string[];
  rejectNote?: string;
  keywords?: string[];
  partialOnReject?: PartialOnReject;
};

export type GlossLongItem = {
  id: string;
  qNo: string;
  type: 'gloss';
  max: number;
  stem: string;
  target: string;
  prompt?: string;
  sourceLabel?: string;
  answers: string[];
  accept1?: string[];
  accept05?: string[];
  reject?: string[];
};

export type McItem = {
  id: string;
  qNo: string;
  type: 'mc';
  max: number;
  prompt: string;
  stem?: string;
  target?: string;
  sourceLabel?: string;
  choices: { key: string; text: string }[];
  answer: string;
  explain?: string;
};

export type ReciteItem = {
  id: string;
  qNo: string;
  type: 'recite';
  max: number;
  prompt: string;
  answers: string[];
  accept1?: string[];
  charBoxes: string[];
};

export type ShortFillItem = {
  id: string;
  qNo: string;
  type: 'short_fill';
  max: number;
  prompt: string;
  answers: string[];
  /** Live character cells above the input. 題7 is four. */
  charCount?: number;
  /**
   * Old deviation lists. Ignored: a short answer scores its full max or 0.
   * Kept so existing quiz JSON still type-checks.
   */
  partial?: { texts: string[]; score: number }[];
};

export type KaraGivenCell = {
  key: string;
  label?: string;
  given: true;
  text: string;
};

export type KaraOpenCell = {
  key: string;
  label?: string;
  given: false;
  max: number;
  points?: PointRubric[];
  answers?: string[];
  accept1?: string[];
  reject?: string[];
  modelAnswer?: string;
};

export type KaraCell = KaraGivenCell | KaraOpenCell;

export type KaraItem = {
  id: string;
  qNo: string;
  type: 'kara_table';
  max: number;
  prompt: string;
  columns: string[];
  rows: { person: string; cells: KaraCell[] }[];
};

export type PointsItem = {
  id: string;
  qNo: string;
  type: 'sentence_translate' | 'long_points';
  max: number;
  prompt: string;
  source?: string;
  quote?: string;
  modelAnswer?: string;
  points: PointRubric[];
  globalRules?: string[];
  aiOkForReasonable?: boolean;
};

export type LongItem = GlossLongItem | McItem | ReciteItem | ShortFillItem | KaraItem | PointsItem;

export type LongQuiz = {
  id: 'lianpo-longq-1' | 'lianpo-longq-2' | 'lianpo-longq-3' | 'eight-longq-1';
  title: string;
  totalMax: number;
  timeLimitMin?: number;
  shuffle?: string;
  typoPenalty?: { enabled?: boolean };
  items: LongItem[];
};

export type PointMark = {
  id: string;
  desc: string;
  max: number;
  hit: boolean;
  awarded: number;
  evidence?: string;
};

export type LongRow = {
  itemId: string;
  qNo: string;
  title: string;
  yours: string;
  suggested: string;
  score: number;
  max: number;
  points: PointMark[];
  aiUnavailable: boolean;
};

export type PointGradeInput = {
  questionId: string;
  qNo: string;
  kind: string;
  prompt: string;
  passage: string;
  rules: readonly string[];
  reasonable: boolean;
  points: readonly PointRubric[];
  student: string;
};

export type PointHit = {
  id: string;
  hit: boolean;
  evidence?: string;
};

export type PointJudge = (
  input: PointGradeInput,
  context: { signal: AbortSignal },
) => Promise<{ hits: readonly PointHit[] }>;

export type GradeOptions = {
  signal?: AbortSignal;
  concurrency?: number;
  timeoutMs?: number;
  /** 語譯 synonym judge. Literal misses on gloss and kara image cells use it. */
  synonymJudge?: AiJudge;
  quizId?: QuizId;
  uid?: string;
};

export type LongGradeResult = {
  score: number;
  total: number;
  rows: LongRow[];
};

const PUNCT_RE = /[，,。．.！!？?；;：:、…—\-「」『』“”‘’（）()【】[\]《》〈〉]/g;

export function fieldKey(itemId: string, person?: string, cell?: string): string {
  if (person && cell) return `${itemId}::${person}::${cell}`;
  return itemId;
}

/**
 * Student fields this item's grader reads.
 * Keep this aligned with `gradeLongItem` / `gradeKara`: a kara row's given
 * cells are printed on the paper and are not answers. `gradeKara` does not
 * read `answers[item.id]`.
 */
export function longGradedFieldKeys(item: LongItem): string[] {
  if (item.type !== 'kara_table') return [item.id];
  const keys: string[] = [];
  for (const row of item.rows) {
    for (const cell of row.cells) {
      if (cell.given) continue;
      keys.push(fieldKey(item.id, row.person, cell.key));
    }
  }
  return keys;
}

export function normalizeLoose(raw: string): string {
  return normalizeAnswer(raw).replace(PUNCT_RE, '');
}

export function isRecitePunct(ch: string): boolean {
  return /^[，,。．.！!？?；;：:、]$/.test(ch);
}

export function visibleChars(value: string): string[] {
  return Array.from(value).filter((ch) => !isRecitePunct(ch) && !/\s/.test(ch));
}

function capScore(score: number, max: number): number {
  if (!Number.isFinite(score) || !(max > 0)) return 0;
  const halves = Math.round(score * 2) / 2;
  if (halves < 0) return 0;
  if (halves > max) return max;
  return halves;
}

function listed(student: string, phrases: readonly string[] | undefined, minContains: number): boolean {
  const loose = normalizeLoose(student);
  if (!loose) return false;
  for (const phrase of phrases ?? []) {
    const key = normalizeLoose(phrase);
    if (!key) continue;
    if (loose === key) return true;
    if (key.length >= minContains && loose.includes(key)) return true;
  }
  return false;
}

function joinList(values: readonly string[] | undefined): string {
  return (values ?? []).map((value) => value.trim()).filter((value) => value.length > 0).join('、');
}

function containsMin(point: PointRubric): number {
  return point.id === 'tech' ? TECH_LITERAL_CONTAINS_MIN : LITERAL_CONTAINS_MIN;
}

/**
 * A listed accept phrase long enough to contain-match, or an exact match.
 * Tech points also contain-match a short listed technique name (比喻、譬喻).
 * 歸之 must not lock when the answer sends the jade home: that point's
 * reject note says 之＝相如／非送還和氏璧.
 */
export function literalPointHit(student: string, point: PointRubric): boolean {
  if (!listed(student, point.accept, containsMin(point))) return false;
  const rejectBlob = `${(point.reject ?? []).join('\n')}\n${point.rejectNote ?? ''}`;
  const jadeMisread = rejectBlob.includes('之＝相如') || rejectBlob.includes('非送還和氏璧');
  if (jadeMisread && normalizeLoose(student).includes(normalizeLoose('璧'))) return false;
  return true;
}

function glossSuggested(item: GlossLongItem): string {
  return joinList(item.answers);
}

function asQuizItem(item: GlossLongItem): QuizItem {
  return {
    stem: item.stem,
    target: item.target,
    answers: item.answers,
    accept1: item.accept1,
    accept05: item.accept05,
  };
}

function glossRow(item: GlossLongItem, raw: string, score: number, aiUnavailable: boolean): LongRow {
  return {
    itemId: item.id,
    qNo: item.qNo,
    title: `${item.qNo}　${item.target}`,
    yours: raw.trim(),
    suggested: glossSuggested(item),
    score: capScore(score, item.max),
    max: item.max,
    points: [],
    aiUnavailable,
  };
}

async function gradeGloss(item: GlossLongItem, raw: string, options: GradeOptions | undefined): Promise<LongRow> {
  const quizItem = asQuizItem(item);
  const rejected = listed(raw, item.reject, Number.MAX_SAFE_INTEGER);
  const literal = rejected || !normalizeAnswer(raw) ? 0 : gradeItem(quizItem, raw);
  if (literal !== 0 || rejected || !normalizeAnswer(raw) || !options?.synonymJudge) {
    return glossRow(item, raw, literal, false);
  }
  const resolution = await resolveGrade(quizItem, raw, options.synonymJudge, {
    signal: options.signal,
    timeoutMs: options.timeoutMs,
    quizId: options.quizId,
    uid: options.uid,
  });
  return glossRow(item, raw, resolution.score, resolution.source === 'ai-unavailable');
}

function gradeMc(item: McItem, raw: string): LongRow {
  const selected = raw.trim();
  const choice = item.choices.find((entry) => entry.key === selected);
  const correct = item.choices.find((entry) => entry.key === item.answer);
  const score = selected === item.answer ? item.max : 0;
  const suggested = [item.answer, correct?.text, item.explain].filter((part) => part && part.trim()).join('　');
  return {
    itemId: item.id,
    qNo: item.qNo,
    title: item.target ? `${item.qNo}　${item.target}` : `${item.qNo}　選擇`,
    yours: selected ? `${selected}　${choice?.text ?? ''}` : '',
    suggested,
    score,
    max: item.max,
    points: [],
    aiUnavailable: false,
  };
}

function gradeRecite(item: ReciteItem, raw: string): LongRow {
  const phrases = [...item.answers, ...(item.accept1 ?? [])];
  const matched = phrases.some((phrase) => normalizeLoose(phrase) === normalizeLoose(raw) && normalizeLoose(raw).length > 0);
  return {
    itemId: item.id,
    qNo: item.qNo,
    title: `${item.qNo}　背誦`,
    yours: raw.trim(),
    suggested: item.answers[0] ?? '',
    score: matched ? item.max : 0,
    max: item.max,
    points: [],
    aiUnavailable: false,
  };
}

function gradeShort(item: ShortFillItem, raw: string): LongRow {
  const loose = normalizeLoose(raw);
  const phrases = item.answers ?? [];
  const matched = loose.length > 0 && phrases.some((phrase) => normalizeLoose(phrase) === loose);
  return {
    itemId: item.id,
    qNo: item.qNo,
    title: `${item.qNo}　短答`,
    yours: raw.trim(),
    suggested: joinList(phrases),
    score: matched ? item.max : 0,
    max: item.max,
    points: [],
    aiUnavailable: false,
  };
}

function marksFromHits(points: readonly PointRubric[], hits: ReadonlyMap<string, PointHit>): PointMark[] {
  return points.map((point) => {
    const found = hits.get(point.id);
    const hit = found?.hit === true;
    const max = point.max > 0 ? point.max : 0;
    return {
      id: point.id,
      desc: point.desc,
      max,
      hit,
      awarded: hit ? max : 0,
      ...(found?.evidence ? { evidence: found.evidence } : {}),
    };
  });
}

function sumMarks(marks: readonly PointMark[]): number {
  return marks.reduce((sum, mark) => sum + mark.awarded, 0);
}

function applyPartial(student: string, points: readonly PointRubric[], hits: Map<string, PointHit>): void {
  const loose = normalizeLoose(student);
  for (const point of points) {
    const rule = point.partialOnReject;
    if (!rule?.thenHit) continue;
    const current = hits.get(point.id);
    if (current?.hit) continue;
    const triggered = (rule.ifAnswerIncludes ?? []).some((phrase) => {
      const key = normalizeLoose(phrase);
      return key.length >= 2 && loose.includes(key);
    });
    const depsOk = (rule.andAlsoHits ?? []).every((id) => hits.get(id)?.hit === true);
    if (!triggered || !depsOk) continue;
    hits.set(point.id, {
      id: point.id,
      hit: true,
      evidence: current?.evidence,
    });
  }
}

function literalHits(student: string, points: readonly PointRubric[]): Map<string, PointHit> {
  const hits = new Map<string, PointHit>();
  for (const point of points) {
    hits.set(point.id, { id: point.id, hit: literalPointHit(student, point) });
  }
  return hits;
}

function coerceJudgeHits(points: readonly PointRubric[], raw: { hits?: readonly PointHit[] } | null): Map<string, PointHit> {
  const allowed = new Set(points.map((point) => point.id));
  const hits = new Map<string, PointHit>();
  for (const point of points) hits.set(point.id, { id: point.id, hit: false });
  for (const entry of raw?.hits ?? []) {
    if (!entry || !allowed.has(entry.id) || hits.get(entry.id)?.hit) continue;
    const evidence = typeof entry.evidence === 'string' ? entry.evidence.trim().slice(0, 80) : '';
    hits.set(entry.id, {
      id: entry.id,
      hit: entry.hit === true,
      ...(evidence ? { evidence } : {}),
    });
  }
  return hits;
}

function mergeHits(literal: ReadonlyMap<string, PointHit>, judged: ReadonlyMap<string, PointHit>): Map<string, PointHit> {
  const merged = new Map<string, PointHit>();
  for (const [id, point] of literal) {
    if (point.hit) {
      merged.set(id, point);
      continue;
    }
    merged.set(id, judged.get(id) ?? { id, hit: false });
  }
  return merged;
}

function rejectOnAbort(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    if (signal.aborted) {
      reject(new Error('aborted'));
      return;
    }
    signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
  });
}

async function judgePoints(
  input: PointGradeInput,
  judge: PointJudge,
  options: GradeOptions | undefined,
): Promise<{ hits: Map<string, PointHit>; unavailable: boolean }> {
  const literal = literalHits(input.student, input.points);
  const pending = input.points.filter((point) => !literal.get(point.id)?.hit);
  if (!normalizeLoose(input.student) || pending.length === 0) {
    return { hits: literal, unavailable: false };
  }

  const parent = options?.signal;
  if (parent?.aborted) return { hits: literal, unavailable: true };

  const controller = new AbortController();
  const onParentAbort = () => controller.abort();
  parent?.addEventListener('abort', onParentAbort);
  const timer = setTimeout(() => controller.abort(), options?.timeoutMs ?? LONGQ_AI_TIMEOUT_MS);
  try {
    const verdict = await Promise.race([
      judge(input, { signal: controller.signal }),
      rejectOnAbort(controller.signal),
    ]);
    const judged = coerceJudgeHits(input.points, verdict);
    const hits = mergeHits(literal, judged);
    applyPartial(input.student, input.points, hits);
    return { hits, unavailable: false };
  } catch {
    const hits = literal;
    applyPartial(input.student, input.points, hits);
    return { hits, unavailable: true };
  } finally {
    clearTimeout(timer);
    parent?.removeEventListener('abort', onParentAbort);
  }
}

function pointSuggested(points: readonly PointRubric[], modelAnswer?: string): string {
  if (modelAnswer && modelAnswer.trim()) return modelAnswer.trim();
  return points
    .map((point) => point.accept?.[0] ?? point.desc)
    .filter((line) => line.trim().length > 0)
    .join('；');
}

async function gradePointItem(
  item: PointsItem,
  raw: string,
  judge: PointJudge,
  options: GradeOptions | undefined,
): Promise<LongRow> {
  const judged = await judgePoints(
    {
      questionId: item.id,
      qNo: item.qNo,
      kind: item.type,
      prompt: item.prompt,
      passage: item.source ?? item.quote ?? '',
      rules: item.globalRules ?? [],
      reasonable: item.aiOkForReasonable === true,
      points: item.points,
      student: raw.trim(),
    },
    judge,
    options,
  );
  const marks = marksFromHits(item.points, judged.hits);
  return {
    itemId: item.id,
    qNo: item.qNo,
    title: item.type === 'sentence_translate' ? `${item.qNo}　句譯` : `${item.qNo}　長答`,
    yours: raw.trim(),
    suggested: pointSuggested(item.points, item.modelAnswer),
    score: capScore(sumMarks(marks), item.max),
    max: item.max,
    points: marks,
    aiUnavailable: judged.unavailable,
  };
}

function whitelistMark(cell: KaraOpenCell, raw: string): PointMark {
  const hit = listed(raw, [...(cell.answers ?? []), ...(cell.accept1 ?? [])], LITERAL_CONTAINS_MIN);
  const max = cell.max;
  return {
    id: cell.key,
    desc: cell.label ? `${cell.label}（白名單）` : '白名單',
    max,
    hit,
    awarded: hit ? max : 0,
  };
}

async function gradeWhitelistCell(
  item: KaraItem,
  person: string,
  cell: KaraOpenCell,
  raw: string,
  options: GradeOptions | undefined,
): Promise<{ mark: PointMark; aiUnavailable: boolean }> {
  const mark = whitelistMark(cell, raw);
  const rejected = listed(raw, cell.reject, Number.MAX_SAFE_INTEGER);
  if (mark.hit || rejected || !normalizeAnswer(raw) || !options?.synonymJudge) {
    return { mark, aiUnavailable: false };
  }
  const resolution = await resolveGrade(
    {
      stem: `${item.prompt}（${person}／${cell.label ?? cell.key}）`,
      target: cell.label ?? cell.key,
      answers: cell.answers ?? [],
      accept1: cell.accept1,
    },
    raw,
    options.synonymJudge,
    {
      signal: options.signal,
      timeoutMs: options.timeoutMs,
      quizId: options.quizId,
      uid: options.uid,
    },
  );
  if (resolution.score === 1) {
    return { mark: { ...mark, hit: true, awarded: cell.max }, aiUnavailable: false };
  }
  return { mark, aiUnavailable: resolution.source === 'ai-unavailable' };
}

async function gradeKara(
  item: KaraItem,
  answers: Readonly<Record<string, string>>,
  judge: PointJudge,
  options: GradeOptions | undefined,
): Promise<LongRow> {
  const parts: string[] = [];
  const marks: PointMark[] = [];
  let unavailable = false;
  const suggestBits: string[] = [];

  for (const row of item.rows) {
    for (const cell of row.cells) {
      if (cell.given) continue;
      const raw = answers[fieldKey(item.id, row.person, cell.key)] ?? '';
      parts.push(`${row.person}${cell.label ?? cell.key}：${raw.trim() || '（空白）'}`);
      if (cell.points && cell.points.length > 0) {
        const judged = await judgePoints(
          {
            questionId: item.id,
            qNo: item.qNo,
            kind: 'kara_action',
            prompt: `${item.prompt}（${row.person}／${cell.label ?? cell.key}）`,
            passage: '',
            rules: [
              '只評這一欄要求的先前表現。',
              '後來的道歉情節、空泛情緒詞，不能用來填未寫到的給分點。',
            ],
            reasonable: false,
            points: cell.points,
            student: raw.trim(),
          },
          judge,
          options,
        );
        marks.push(...marksFromHits(cell.points, judged.hits));
        unavailable = unavailable || judged.unavailable;
        suggestBits.push(`${row.person}：${pointSuggested(cell.points, cell.modelAnswer)}`);
      } else {
        const graded = await gradeWhitelistCell(item, row.person, cell, raw, options);
        marks.push(graded.mark);
        unavailable = unavailable || graded.aiUnavailable;
        suggestBits.push(`${row.person}${cell.label ?? ''}：${joinList([...(cell.answers ?? []), ...(cell.accept1 ?? [])])}`);
      }
    }
  }

  return {
    itemId: item.id,
    qNo: item.qNo,
    title: `${item.qNo}　人物表`,
    yours: parts.join('｜'),
    suggested: suggestBits.join('｜'),
    score: capScore(sumMarks(marks), item.max),
    max: item.max,
    points: marks,
    aiUnavailable: unavailable,
  };
}

async function gradeLongItem(
  item: LongItem,
  answers: Readonly<Record<string, string>>,
  judge: PointJudge,
  options: GradeOptions | undefined,
): Promise<LongRow> {
  const raw = answers[item.id] ?? '';
  switch (item.type) {
    case 'gloss':
      return gradeGloss(item, raw, options);
    case 'mc':
      return gradeMc(item, raw);
    case 'recite':
      return gradeRecite(item, raw);
    case 'short_fill':
      return gradeShort(item, raw);
    case 'kara_table':
      return gradeKara(item, answers, judge, options);
    case 'sentence_translate':
    case 'long_points':
      return gradePointItem(item, raw, judge, options);
    default:
      return {
        itemId: 'unknown',
        qNo: '',
        title: '',
        yours: '',
        suggested: '',
        score: 0,
        max: 0,
        points: [],
        aiUnavailable: false,
      };
  }
}

/** Grade the whole paper. Typo deduction is intentionally absent. */
export async function gradeLongPaper(
  paper: LongQuiz,
  answers: Readonly<Record<string, string>>,
  judge: PointJudge,
  options?: GradeOptions,
): Promise<LongGradeResult> {
  const rows = new Array<LongRow>(paper.items.length);
  if (paper.items.length === 0) return { score: 0, total: paper.totalMax, rows };

  const concurrency = Math.max(1, options?.concurrency ?? AI_GRADE_CONCURRENCY);
  let next = 0;

  async function worker(): Promise<void> {
    while (next < paper.items.length) {
      const current = next;
      next += 1;
      const item = paper.items[current];
      if (!item) return;
      rows[current] = await gradeLongItem(item, answers, judge, options);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, paper.items.length) }, () => worker()));
  const score = capScore(
    rows.reduce((sum, row) => sum + row.score, 0),
    paper.totalMax,
  );
  return { score, total: paper.totalMax, rows };
}

/** Model JSON → point hits. Any whole-question score field is ignored. */
export function parsePointHits(raw: unknown): PointHit[] {
  const data = typeof raw === 'string' ? (JSON.parse(raw) as unknown) : raw;
  if (!data || typeof data !== 'object') throw new Error('智能判分沒有回傳給分點');
  const list = (data as { pointHits?: unknown }).pointHits;
  if (!Array.isArray(list)) throw new Error('智能判分沒有回傳給分點');
  const hits: PointHit[] = [];
  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as { id?: unknown; hit?: unknown; evidence?: unknown };
    if (typeof record.id !== 'string' || !record.id.trim()) continue;
    const evidence = typeof record.evidence === 'string' ? record.evidence.trim().slice(0, 80) : '';
    hits.push({
      id: record.id.trim(),
      hit: record.hit === true || record.hit === 'true',
      ...(evidence ? { evidence } : {}),
    });
  }
  return hits;
}
