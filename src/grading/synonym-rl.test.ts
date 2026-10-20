import { describe, expect, it } from 'vitest';
import synonymRl from './synonym-rl.json' with { type: 'json' };
import { getQuiz } from '../data/quizzes.ts';
import { gradingSystemInstruction } from './aiPrompt.ts';
import { fullCreditAnswers, gradeItem } from './grade.ts';
import { normalizeAnswer } from './normalize.ts';
import { resolveGrade, type AiJudge } from './resolveGrade.ts';
import type { Quiz, QuizItem } from '../types.ts';

type Example = {
  quiz: string;
  stem: string;
  target: string;
  accept: string[];
  unseen: string[];
  pattern: string;
};

function quizzesFor(example: Example): Quiz[] {
  return example.quiz.split('/').map((id) => {
    const quiz = getQuiz(id);
    if (!quiz) throw new Error(`unknown quiz ${id}`);
    return quiz;
  });
}

function findItem(quiz: Quiz, example: Example): QuizItem {
  const item = quiz.items.find(
    (candidate) => candidate.stem === example.stem && candidate.target === example.target,
  );
  if (!item) throw new Error(`${quiz.id} missing ${example.stem} / ${example.target}`);
  return item;
}

const heldOutOfPrompt = ['猜度', '察看', '查看', '寵信', '權衡', '事奉', '朝會', '瑕疵', '大喝', '完結', '攻取', '跟從', '盡興', '喜歡', '揣測'];

describe('teacher synonym examples', () => {
  it('lists the checked glosses for an exact 1, and leaves unseen glosses to the model', async () => {
    const instruction = gradingSystemInstruction();
    expect(instruction).toContain('不是封閉名單');
    expect(instruction).toContain('近義動詞');
    expect(instruction).toContain('同一個義項');
    expect(instruction).toContain('加綴');
    expect(instruction).toContain('使動');
    expect(instruction).toContain('估量');
    for (const gloss of heldOutOfPrompt) {
      expect(instruction, gloss).not.toContain(gloss);
    }

    for (const example of synonymRl.examples as Example[]) {
      for (const quiz of quizzesFor(example)) {
        const item = findItem(quiz, example);
        expect(gradeItem(item, item.answers[0] ?? ''), `${example.stem} original`).toBe(1);
        const listed = new Set(fullCreditAnswers(item).map((answer) => normalizeAnswer(answer)));

        for (const answer of example.accept) {
          expect(listed.has(normalizeAnswer(answer)), `${quiz.id} ${example.target} ${answer}`).toBe(true);
          expect(gradeItem(item, answer)).toBe(1);
        }

        for (const answer of example.unseen) {
          expect(listed.has(normalizeAnswer(answer)), `${example.target} unseen ${answer}`).toBe(false);
          expect(gradeItem(item, answer)).toBe(0);
          const requests: string[] = [];
          const judge: AiJudge = async (input) => {
            requests.push(input.student);
            expect(input.stem).toBe(example.stem);
            expect(input.fullCredit.length).toBeGreaterThan(0);
            return { score: 1, reason: example.pattern };
          };
          const result = await resolveGrade(item, answer, judge);
          expect(result.score, `${example.target} ${answer}`).toBe(1);
          expect(result.source).toBe('ai');
          expect(requests).toEqual([answer]);
        }
      }
    }
  });

  it('does not copy a causative gloss onto a different sense of 負', () => {
    const item = getQuiz('lianpo')?.items.find((candidate) => candidate.stem === '負其彊');
    expect(item).toBeTruthy();
    if (!item) return;
    expect(gradeItem(item, '使負上')).toBe(0);
    expect(gradeItem(item, '倚仗')).toBe(1);
  });

  it('still scores 堅決 as wrong on 學則不固', () => {
    const item = getQuiz('8passages')?.items.find((candidate) => candidate.stem === '學則不固');
    expect(item).toBeTruthy();
    if (!item) return;
    expect(gradeItem(item, '堅決')).toBe(0);
    expect(gradeItem(item, '堅固')).toBe(1);
  });
});
