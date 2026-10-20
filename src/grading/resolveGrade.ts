import gradingRl from './grading-rl.json' with { type: 'json' };
import { fullCreditAnswers, gradeItem, halfCreditAnswers } from './grade.ts';
import { normalizeAnswer } from './normalize.ts';
import { AI_GRADE_CONCURRENCY, AI_GRADE_TIMEOUT_MS } from './aiPrompt.ts';
import type { QuizItem, Score } from '../types.ts';

export type AiScore = 0 | 1;

export type AiVerdict = {
  score: AiScore;
  reason?: string;
};

export type AiGradeRequest = {
  stem: string;
  target: string;
  fullCredit: string[];
  halfCredit: string[];
  student: string;
};

export type AiJudgeContext = {
  signal: AbortSignal;
};

export type AiJudge = (input: AiGradeRequest, context: AiJudgeContext) => Promise<AiVerdict>;

export type GradeSource = 'blank' | 'literal' | 'ai' | 'ai-unavailable';

export type GradeResolution = {
  score: Score;
  source: GradeSource;
  reason?: string;
};

export type ResolveOptions = {
  timeoutMs?: number;
  signal?: AbortSignal;
  concurrency?: number;
};

type ZeroLabel = {
  stem: string;
  target: string;
  score0_examples: string[];
};

const teacherZeros = new Map<string, Set<string>>();

function teacherZeroKey(stem: string, target: string): string {
  return `${stem}\0${target}`;
}

for (const label of gradingRl.labels as ZeroLabel[]) {
  const key = teacherZeroKey(label.stem, label.target);
  const scores = teacherZeros.get(key) ?? new Set<string>();
  for (const example of label.score0_examples) {
    const normalized = normalizeAnswer(example);
    if (normalized) scores.add(normalized);
  }
  teacherZeros.set(key, scores);
}

/** Teacher-confirmed wrong meanings. These stay 0 even if a model would score them 1. */
export function isTeacherZero(item: QuizItem, raw: string): boolean {
  const student = normalizeAnswer(raw);
  if (!student) return false;
  return teacherZeros.get(teacherZeroKey(item.stem, item.target))?.has(student) ?? false;
}

/** AI may only contribute 0 or 1. 0.5 is never inferred from a model. */
export function clampAiScore(score: unknown): AiScore {
  return score === 1 || score === '1' ? 1 : 0;
}

export function parseAiVerdict(raw: unknown): AiVerdict {
  const data = typeof raw === 'string' ? (JSON.parse(raw) as unknown) : raw;
  if (!data || typeof data !== 'object') {
    throw new Error('智能判分沒有回傳分數');
  }
  const record = data as { score?: unknown; reason?: unknown };
  const reason = typeof record.reason === 'string' ? record.reason.trim().slice(0, 80) : '';
  return {
    score: clampAiScore(record.score),
    ...(reason ? { reason } : {}),
  };
}

function gradeRequest(item: QuizItem, raw: string): AiGradeRequest {
  return {
    stem: item.stem,
    target: item.target,
    fullCredit: fullCreditAnswers(item),
    halfCredit: halfCreditAnswers(item),
    student: raw.trim(),
  };
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

/**
 * Literal answers[] / accept1[] / accept05[] win first.
 * Teacher-listed wrong meanings stay 0.
 * Anything else may be judged as 0 or 1. Failures stay 0.
 */
export async function resolveGrade(
  item: QuizItem,
  raw: string,
  judge: AiJudge,
  options?: ResolveOptions,
): Promise<GradeResolution> {
  if (!normalizeAnswer(raw)) return { score: 0, source: 'blank' };

  const literal = gradeItem(item, raw);
  if (literal !== 0) return { score: literal, source: 'literal' };
  if (isTeacherZero(item, raw)) return { score: 0, source: 'literal' };

  const timeoutMs = options?.timeoutMs ?? AI_GRADE_TIMEOUT_MS;
  const parent = options?.signal;
  if (parent?.aborted) return { score: 0, source: 'ai-unavailable' };

  const controller = new AbortController();
  const onParentAbort = () => controller.abort();
  parent?.addEventListener('abort', onParentAbort);
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const verdict = await Promise.race([
      judge(gradeRequest(item, raw), { signal: controller.signal }),
      rejectOnAbort(controller.signal),
    ]);
    const reason = typeof verdict?.reason === 'string' ? verdict.reason.trim().slice(0, 80) : '';
    return {
      score: clampAiScore(verdict?.score),
      source: 'ai',
      ...(reason ? { reason } : {}),
    };
  } catch {
    return { score: 0, source: 'ai-unavailable' };
  } finally {
    clearTimeout(timer);
    parent?.removeEventListener('abort', onParentAbort);
  }
}

/** Grade many answers, calling the model only for misses, with a concurrency cap. */
export async function resolveGrades(
  tasks: readonly { item: QuizItem; raw: string }[],
  judge: AiJudge,
  options?: ResolveOptions,
): Promise<GradeResolution[]> {
  const results = new Array<GradeResolution>(tasks.length);
  if (tasks.length === 0) return results;

  const concurrency = Math.max(1, options?.concurrency ?? AI_GRADE_CONCURRENCY);
  let next = 0;

  async function worker(): Promise<void> {
    while (next < tasks.length) {
      const current = next;
      next += 1;
      const task = tasks[current];
      if (!task) return;
      results[current] = await resolveGrade(task.item, task.raw, judge, options);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker());
  await Promise.all(workers);
  return results;
}
