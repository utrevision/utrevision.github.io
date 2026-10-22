import OpenCC from 'opencc-js/cn2t';
import { describe, expect, it } from 'vitest';
import gradingRl from './grading-rl.json' with { type: 'json' };
import { getQuiz } from '../data/quizzes.ts';
import { gradingSystemInstruction, gradingUserPrompt, GRADING_MODEL } from './aiPrompt.ts';
import { gradeItem } from './grade.ts';
import { toSimplified } from './normalize.ts';
import {
  clampAiScore,
  parseAiVerdict,
  resolveGrade,
  resolveGrades,
  type AiGradeRequest,
  type AiJudge,
} from './resolveGrade.ts';
import type { Quiz, QuizItem, Score } from '../types.ts';

const toTraditional = OpenCC.Converter({ from: 'cn', to: 'tw' });

type Label = {
  quiz: string;
  stem: string;
  target: string;
  score1: string[];
  score05: string[];
  score0_examples: string[];
};

function variants(text: string): string[] {
  const simplified = toSimplified(text);
  const traditional = toTraditional(simplified);
  const spacedTraditional = [...text].join('\u3000');
  const spacedSimplified = [...simplified].join(' ');
  return [...new Set([text, simplified, traditional, spacedTraditional, spacedSimplified])];
}

function quizzesFor(label: Label): Quiz[] {
  return label.quiz.split('/').map((id) => {
    const quiz = getQuiz(id);
    if (!quiz) throw new Error(`unknown quiz ${id}`);
    return quiz;
  });
}

function findItem(quiz: Quiz, label: Label): QuizItem {
  const item = quiz.items.find(
    (candidate) => candidate.stem === label.stem && candidate.target === label.target,
  );
  if (!item) throw new Error(`${quiz.id} missing ${label.stem} / ${label.target}`);
  return item;
}

function itemByStem(quizId: string, stem: string): QuizItem {
  const item = getQuiz(quizId)?.items.find((candidate) => candidate.stem === stem);
  if (!item) throw new Error(`missing ${quizId} ${stem}`);
  return item;
}

const alwaysOne: AiJudge = async () => ({ score: 1, reason: '不應翻案' });

describe('literal path is unchanged, including mixed script', () => {
  it('does not ask the model for listed full-credit, half-credit, or teacher-zero answers', async () => {
    const calls: string[] = [];
    const judge: AiJudge = async (input) => {
      calls.push(`${input.stem}/${input.student}`);
      return { score: 1, reason: '不應被呼叫' };
    };

    for (const label of gradingRl.labels as Label[]) {
      for (const quiz of quizzesFor(label)) {
        const item = findItem(quiz, label);
        const groups: Array<[string[], Score]> = [
          [label.score1, 1],
          [label.score05, 0],
          [label.score0_examples, 0],
        ];
        for (const [answers, expected] of groups) {
          for (const answer of answers) {
            for (const variant of variants(answer)) {
              const result = await resolveGrade(item, variant, judge);
              expect(result.score, `${quiz.id} ${label.stem} ${variant}`).toBe(expected);
              expect(result.source).toBe('literal');
              expect(gradeItem(item, variant)).toBe(expected);
            }
          }
        }
      }
    }

    expect(calls).toEqual([]);
  });

  it('leaves blanks and whitespace at 0 without calling the model', async () => {
    const item = itemByStem('lianpo', '而束君歸趙矣');
    const judge: AiJudge = async () => {
      throw new Error('不應呼叫');
    };
    expect(await resolveGrade(item, '', judge)).toEqual({ score: 0, source: 'blank' });
    expect(await resolveGrade(item, '   ', judge)).toEqual({ score: 0, source: 'blank' });
  });
});

describe('unlisted synonyms can score 1', () => {
  it('accepts 綁住 when the model says it matches 綁', async () => {
    const item = itemByStem('lianpo', '而束君歸趙矣');
    expect(gradeItem(item, '綁住')).toBe(0);
    const seen: AiGradeRequest[] = [];
    const result = await resolveGrade(item, '綁住', async (input) => {
      seen.push(input);
      return { score: 1, reason: '綁住與綁同義' };
    });
    expect(seen).toHaveLength(1);
    expect(seen[0]?.fullCredit).toContain('綁');
    expect(seen[0]?.halfCredit).toContain('約束');
    expect(seen[0]?.stem).toBe('而束君歸趙矣');
    expect(seen[0]?.target).toBe('束');
    expect(seen[0]?.student).toBe('綁住');
    expect(result).toEqual({ score: 1, source: 'ai', reason: '綁住與綁同義' });
  });

  it('accepts an unlisted synonym of 擔憂, including simplified script', async () => {
    const item = itemByStem('lianpo', '即患秦兵之來');
    const result = await resolveGrade(item, '忧心', async (input) => {
      expect(input.student).toBe('忧心');
      expect(input.fullCredit).toEqual(expect.arrayContaining(['擔憂', '擔心', '憂慮']));
      return { score: 1, reason: '憂心與擔憂同義' };
    });
    expect(result.score).toBe(1);
    expect(result.source).toBe('ai');
  });

  it('can still give 1 to a single character when the model says it is the same meaning', async () => {
    const item = itemByStem('lianpo', '而束君歸趙矣');
    const result = await resolveGrade(item, '束', async () => ({ score: 1, reason: '束與束縛同義' }));
    expect(result.score).toBe(1);
  });
});

describe('wrong meanings stay 0', () => {
  it('does not let the model turn 患→禍患 into 1 on the 擔憂 question', async () => {
    const item = itemByStem('8passages', '即患秦兵之來');
    for (const variant of variants('禍患')) {
      const result = await resolveGrade(item, variant, alwaysOne);
      expect(result, variant).toEqual({ score: 0, source: 'literal' });
    }
  });

  it('does not let 擔憂 score on the 禍患 question', async () => {
    const item = itemByStem('8passages', '故患有所不辟也');
    const result = await resolveGrade(item, '擔心', alwaysOne);
    expect(result).toEqual({ score: 0, source: 'literal' });
    expect(await resolveGrade(item, '禍患', alwaysOne)).toEqual({ score: 1, source: 'literal' });
  });

  it('keeps an unlisted wrong gloss at 0 when the model rejects it', async () => {
    const item = itemByStem('lianpo', '即患秦兵之來');
    const result = await resolveGrade(item, '蘋果', async () => ({ score: 0, reason: '詞義無關' }));
    expect(result).toEqual({ score: 0, source: 'ai', reason: '詞義無關' });
  });
});

describe('the model cannot invent 0.5', () => {
  it('clamps every score other than 1 to 0', () => {
    for (const value of [0, 0.5, '0.5', 2, '0', '1 ', 1.5, null, undefined, true, false, '', 'half']) {
      expect(clampAiScore(value)).toBe(0);
    }
    expect(clampAiScore(1)).toBe(1);
    expect(clampAiScore('1')).toBe(1);
  });

  it('records 0 when the model returns 0.5', async () => {
    const item = itemByStem('lianpo', '而束君歸趙矣');
    const result = await resolveGrade(item, '管束', async () => ({
      score: 0.5 as never,
      reason: '接近約束',
    }));
    expect(result.score).toBe(0);
    expect(result.source).toBe('ai');
    expect(result.score).not.toBe(0.5);
  });

  it('parses structured JSON and refuses a half score', () => {
    expect(parseAiVerdict('{"score":"1","reason":"同義"}')).toEqual({ score: 1, reason: '同義' });
    expect(parseAiVerdict('{"score":"0"}')).toEqual({ score: 0 });
    expect(parseAiVerdict({ score: 0.5, reason: '部分' }).score).toBe(0);
    expect(() => parseAiVerdict('')).toThrow();
    expect(() => parseAiVerdict('not json')).toThrow();
  });

  it('forwards the quiz and user only when the model is asked', async () => {
    const item = itemByStem('lianpo', '而束君歸趙矣');
    const seen: Array<{ quizId?: string; uid?: string }> = [];
    const judge: AiJudge = async (_input, context) => {
      seen.push({ quizId: context.quizId, uid: context.uid });
      return { score: 1, reason: '同義' };
    };
    await resolveGrade(item, '束縛', judge, { quizId: 'lianpo', uid: 'student' });
    expect(seen).toEqual([]);
    await resolveGrade(item, '綁住', judge, { quizId: 'lianpo', uid: 'student' });
    expect(seen).toEqual([{ quizId: 'lianpo', uid: 'student' }]);
  });

  it('gives listed accept05 answers 0 without asking the model', async () => {
    const item = itemByStem('lianpo', '而束君歸趙矣');
    const result = await resolveGrade(item, '約束', alwaysOne);
    expect(result).toEqual({ score: 0, source: 'literal' });
    expect(gradeItem(item, '約束')).toBe(0);
  });
});

describe('model failures stay at the literal 0', () => {
  it('reports the judge as unavailable when the call throws', async () => {
    const item = itemByStem('lianpo', '而束君歸趙矣');
    const result = await resolveGrade(item, '綁住', async () => {
      throw new Error('PERMISSION_DENIED');
    });
    expect(result).toEqual({ score: 0, source: 'ai-unavailable' });
  });

  it('stops waiting after the timeout', async () => {
    const item = itemByStem('lianpo', '而束君歸趙矣');
    const result = await resolveGrade(item, '綁住', () => new Promise(() => undefined), { timeoutMs: 30 });
    expect(result).toEqual({ score: 0, source: 'ai-unavailable' });
  });

  it('does not apply a verdict after the caller aborts', async () => {
    const item = itemByStem('lianpo', '而束君歸趙矣');
    const controller = new AbortController();
    const pending = resolveGrade(
      item,
      '綁住',
      () => new Promise(() => undefined),
      { signal: controller.signal, timeoutMs: 5_000 },
    );
    controller.abort();
    expect(await pending).toEqual({ score: 0, source: 'ai-unavailable' });
  });
});

describe('batch grading', () => {
  it('keeps result order and limits how many model calls run at once', async () => {
    const bundle = itemByStem('lianpo', '而束君歸趙矣');
    const worry = itemByStem('lianpo', '即患秦兵之來');
    const tasks = [
      { item: worry, raw: '擔憂' },
      { item: bundle, raw: '綁住' },
      { item: worry, raw: '禍患' },
      { item: bundle, raw: '捆綁' },
      { item: bundle, raw: '約束' },
      { item: bundle, raw: '綁起來' },
    ];
    let inFlight = 0;
    let maxInFlight = 0;
    const releases: Array<() => void> = [];
    const judge: AiJudge = async (input) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise<void>((resolve) => {
        releases.push(resolve);
      });
      inFlight -= 1;
      return { score: input.student === '蘋果' ? 0 : 1, reason: input.student };
    };

    const pending = resolveGrades(tasks, judge, { concurrency: 2, timeoutMs: 5_000 });
    await waitFor(() => releases.length === 2);
    expect(maxInFlight).toBe(2);
    expect(inFlight).toBe(2);
    releases.shift()?.();
    await waitFor(() => releases.length === 2 && inFlight === 2);
    while (releases.length > 0) releases.shift()?.();
    const results = await pending;

    expect(results.map((result) => result.score)).toEqual([1, 1, 0, 1, 0, 1]);
    expect(results.map((result) => result.source)).toEqual([
      'literal',
      'ai',
      'literal',
      'ai',
      'literal',
      'ai',
    ]);
    expect(maxInFlight).toBeLessThanOrEqual(2);
  });
});

describe('prompt contract', () => {
  it('uses the free-tier Flash-Lite model', () => {
    expect(GRADING_MODEL).toBe('gemini-3.5-flash-lite');
  });

  it('teaches every teacher-listed wrong meaning, and forbids 0.5', () => {
    const instruction = gradingSystemInstruction();
    expect(instruction).toContain('你不可輸出 0.5');
    expect(instruction).toContain('先詞義、後詞性');
    expect(instruction).toContain('綁住');
    expect(instruction).not.toContain('只答單字，或意思只是接近');
    expect(instruction).toContain('不要因為答案只有一個字就輸出 "0"');
    for (const rule of gradingRl.rules) {
      expect(instruction).toContain(rule);
    }
    for (const label of gradingRl.labels as Label[]) {
      expect(instruction).toContain(label.stem);
      expect(instruction).toContain(label.target);
      for (const wrong of label.score0_examples) {
        expect(instruction, `${label.stem} ${wrong}`).toContain(wrong);
      }
    }
  });

  it('sends the stem, target, full-credit list, half-credit list, and student answer', () => {
    const prompt = gradingUserPrompt({
      stem: '即患秦兵之來',
      target: '患',
      fullCredit: ['擔憂', '擔心', '憂慮'],
      halfCredit: [],
      student: '憂心',
    });
    expect(prompt).toContain('即患秦兵之來');
    expect(prompt).toContain('患');
    expect(prompt).toContain('擔憂');
    expect(prompt).toContain('擔心');
    expect(prompt).toContain('憂慮');
    expect(prompt).toContain('憂心');
    expect(prompt).toContain('（無）');
  });
});

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('timed out waiting for batch grading');
}
