import { describe, expect, it, vi } from 'vitest';
import { getLongQuiz } from '../data/longQuizzes.ts';
import { QUIZ_TOTALS } from '../data/quizzes.ts';
import { longqSystemInstruction, longqUserPrompt } from './longqPrompt.ts';
import type { AiJudge } from './resolveGrade.ts';
import {
  fieldKey,
  gradeLongPaper,
  parsePointHits,
  type LongQuiz,
  type LongRow,
  type PointGradeInput,
  type PointJudge,
  type PointRubric,
} from './longq.ts';

const paper = getLongQuiz('lianpo-longq-2');
if (!paper) throw new Error('missing lianpo-longq-2');
const quiz: LongQuiz = paper;

function pointsOf(id: string): PointRubric[] {
  const item = quiz.items.find((entry) => entry.id === id);
  if (!item || (item.type !== 'sentence_translate' && item.type !== 'long_points')) {
    throw new Error(`missing points ${id}`);
  }
  return item.points;
}

function row(id: string, rows: readonly LongRow[]) {
  const found = rows.find((entry) => entry.itemId === id);
  if (!found) throw new Error(`missing row ${id}`);
  return found;
}

const silentJudge: PointJudge = vi.fn(async () => {
  throw new Error('judge should not run');
});

describe('lianpo-longq-2 paper', () => {
  it('totals 30 marks across 13 items and keeps typo penalty off', () => {
    expect(QUIZ_TOTALS['lianpo-longq-2']).toBe(30);
    expect(quiz.totalMax).toBe(30);
    expect(quiz.items).toHaveLength(13);
    expect(quiz.items.reduce((sum, item) => sum + item.max, 0)).toBe(30);
    expect(quiz.typoPenalty?.enabled).toBe(false);
    expect(quiz.shuffle).toBe('none');
    for (const item of quiz.items) {
      if (item.type !== 'sentence_translate' && item.type !== 'long_points') continue;
      expect(item.points.reduce((sum, point) => sum + point.max, 0)).toBe(item.max);
    }
  });
});

describe('eight-longq-1 paper', () => {
  const eight = getLongQuiz('eight-longq-1');

  it('is the 中五 long paper, titled from the Word filename, totaling 30', () => {
    expect(eight).toBeDefined();
    expect(QUIZ_TOTALS['eight-longq-1']).toBe(30);
    expect(eight?.id).toBe('eight-longq-1');
    expect(eight?.title).toBe('上學期測驗溫習小測1');
    expect(eight?.totalMax).toBe(30);
    expect(eight?.items).toHaveLength(13);
    expect(eight?.items.reduce((sum, item) => sum + item.max, 0)).toBe(30);
    expect(eight?.typoPenalty?.enabled).toBe(false);
    expect(eight?.shuffle).toBe('none');
    for (const item of eight?.items ?? []) {
      if (item.type === 'sentence_translate' || item.type === 'long_points') {
        expect(item.points.reduce((sum, point) => sum + point.max, 0)).toBe(item.max);
      }
      if (item.type !== 'kara_table') continue;
      for (const row of item.rows) {
        for (const cell of row.cells) {
          if (cell.given || !cell.points?.length) continue;
          expect(cell.points.reduce((sum, point) => sum + point.max, 0)).toBe(cell.max);
        }
      }
    }
  });
});

describe('closed long-answer items', () => {
  it('scores lists exactly and does not call the model', async () => {
    const judge = vi.fn(silentJudge);
    const result = await gradeLongPaper(
      quiz,
      {
        q1a: '估計',
        q1b: '斜眼看',
        q1c: '沒有',
        q2: 'B',
        q3: 'A',
        q4: 'C',
        q6: '吾所以為此者,以先國家之急而後私仇也',
        q7: '忠君愛國',
        [fieldKey('q8', '藺相如', 'image')]: '胸襟廣闊',
      },
      judge,
    );

    expect(judge).not.toHaveBeenCalled();
    expect(row('q1a', result.rows).score).toBe(1);
    expect(row('q1b', result.rows).score).toBe(1);
    expect(row('q1c', result.rows).score).toBe(0);
    expect(row('q2', result.rows).score).toBe(2);
    expect(row('q3', result.rows).score).toBe(0);
    expect(row('q4', result.rows).score).toBe(2);
    expect(row('q6', result.rows).score).toBe(2);
    expect(row('q7', result.rows).score).toBe(1);
    expect(row('q8', result.rows).score).toBe(2);
    expect(result.rows.find((entry) => entry.score === 0.5)).toBeUndefined();
  });

  it('keeps 心胸廣闊 and 不 off the printed lists', () => {
    const gloss = quiz.items.find((item) => item.id === 'q1c');
    if (!gloss || gloss.type !== 'gloss') throw new Error('missing q1c');
    expect([...gloss.answers, ...(gloss.accept1 ?? [])]).not.toContain('不');
    const q8 = quiz.items.find((item) => item.id === 'q8');
    if (!q8 || q8.type !== 'kara_table') throw new Error('missing q8');
    const image = q8.rows.find((row) => row.person === '藺相如')?.cells.find((cell) => cell.key === 'image');
    if (!image || image.given) throw new Error('missing image cell');
    expect([...(image.answers ?? []), ...(image.accept1 ?? [])]).not.toContain('心胸廣闊');
    expect(image.accept1).toContain('胸襟廣闊');
    expect(gloss.answers).toEqual(expect.arrayContaining(['不要', '別']));
  });

  it('asks the 語譯 synonym judge when gloss or a kara image misses the list', async () => {
    const pointJudge = vi.fn(silentJudge);
    const synonymJudge = vi.fn<AiJudge>(async (input) => {
      if (input.target === '毋' && input.student === '不') return { score: 1, reason: '與別、不要同義' };
      if (input.student === '心胸廣闊') return { score: 1, reason: '與胸襟廣闊同義' };
      return { score: 0, reason: '詞義不同' };
    });
    const result = await gradeLongPaper(
      quiz,
      {
        q1c: '不',
        [fieldKey('q8', '藺相如', 'image')]: '心胸廣闊',
      },
      pointJudge,
      { synonymJudge, quizId: 'lianpo-longq-2' },
    );

    expect(pointJudge).not.toHaveBeenCalled();
    expect(synonymJudge).toHaveBeenCalledTimes(2);
    const glossCall = synonymJudge.mock.calls.find((call) => call[0].target === '毋');
    const imageCall = synonymJudge.mock.calls.find((call) => call[0].student === '心胸廣闊');
    expect(glossCall?.[0].fullCredit).toEqual(expect.arrayContaining(['不要', '別', '勿']));
    expect(glossCall?.[0].fullCredit).not.toContain('不');
    expect(glossCall?.[0].stem).toContain('欲毋行');
    expect(imageCall?.[0].fullCredit).toEqual(expect.arrayContaining(['胸襟廣闊', '顧全大局']));
    expect(imageCall?.[0].fullCredit).not.toContain('心胸廣闊');
    expect(imageCall?.[0].target).toBe('形象');
    expect(row('q1c', result.rows).score).toBe(1);
    expect(row('q1c', result.rows).aiUnavailable).toBe(false);
    const imageMark = row('q8', result.rows).points.find((point) => point.id === 'image');
    expect(imageMark?.hit).toBe(true);
    expect(imageMark?.awarded).toBe(2);
    expect(row('q8', result.rows).score).toBe(2);
  });

  it('leaves a synonym miss at zero and does not call the judge for a listed or rejected answer', async () => {
    const synonymJudge = vi.fn<AiJudge>(async () => ({ score: 0, reason: '詞義不同' }));
    const missed = await gradeLongPaper(
      quiz,
      { q1c: '不', [fieldKey('q8', '藺相如', 'image')]: '心胸廣闊' },
      silentJudge,
      { synonymJudge },
    );
    expect(synonymJudge).toHaveBeenCalledTimes(2);
    expect(row('q1c', missed.rows).score).toBe(0);
    expect(row('q8', missed.rows).score).toBe(0);

    synonymJudge.mockClear();
    const listed = await gradeLongPaper(
      quiz,
      { q1c: '別', [fieldKey('q8', '藺相如', 'image')]: '胸襟廣闊' },
      silentJudge,
      { synonymJudge },
    );
    const rejected = await gradeLongPaper(
      quiz,
      { q1c: '沒有', [fieldKey('q8', '藺相如', 'image')]: '勇敢' },
      silentJudge,
      { synonymJudge },
    );
    expect(synonymJudge).not.toHaveBeenCalled();
    expect(row('q1c', listed.rows).score).toBe(1);
    expect(row('q8', listed.rows).points.find((point) => point.id === 'image')?.awarded).toBe(2);
    expect(row('q1c', rejected.rows).score).toBe(0);
    expect(row('q8', rejected.rows).score).toBe(0);
  });

  it('keeps a gloss or image at zero when the synonym judge fails', async () => {
    const synonymJudge = vi.fn<AiJudge>(async () => {
      throw new Error('timeout');
    });
    const result = await gradeLongPaper(
      quiz,
      { q1c: '不', [fieldKey('q8', '藺相如', 'image')]: '心胸廣闊' },
      silentJudge,
      { synonymJudge },
    );
    expect(row('q1c', result.rows).score).toBe(0);
    expect(row('q1c', result.rows).aiUnavailable).toBe(true);
    expect(row('q8', result.rows).score).toBe(0);
    expect(row('q8', result.rows).aiUnavailable).toBe(true);
  });

  it('gives full marks for a four-character answer and zero for an unrelated image', async () => {
    const result = await gradeLongPaper(
      quiz,
      {
        q7: '先國後私。',
        [fieldKey('q8', '藺相如', 'image')]: '勇敢',
      },
      silentJudge,
    );
    expect(row('q7', result.rows).score).toBe(2);
    expect(row('q8', result.rows).score).toBe(0);
  });
});

describe('point hits', () => {
  it('teaches the model what may and may not score', () => {
    const instruction = longqSystemInstruction();
    expect(instruction).toContain('錯別字');
    expect(instruction).toContain('禁止輸出整題印象分');
    expect(instruction).toContain('禁止自創 0.5');
    expect(instruction).toContain('言之成理');
    expect(instruction).toContain('行動描寫');
    const input: PointGradeInput = {
      questionId: 'q5',
      qNo: '5',
      kind: 'sentence_translate',
      prompt: '試把以下句子譯為語體文。',
      passage: '卒廷見相如，畢禮而歸之。',
      rules: ['「卒」譯出可不另給分'],
      reasonable: false,
      points: pointsOf('q5'),
      student: '終於在朝廷接見相如',
    };
    const prompt = longqUserPrompt(input);
    expect(prompt).toContain('id=p3');
    expect(prompt).toContain('非送還和氏璧');
    expect(prompt).toContain('「卒」譯出可不另給分');
    expect(prompt).toContain('終於在朝廷接見相如');
  });

  it('ignores a whole-question score and any invented half mark', () => {
    expect(
      parsePointHits({
        suggestedScore: 99,
        max: 3,
        pointHits: [
          { id: 'p1', hit: true, evidence: '朝廷上接見' },
          { id: 'p2', hit: 0.5 },
          { id: 'p3', hit: 'true' },
          { id: '', hit: true },
        ],
      }),
    ).toEqual([
      { id: 'p1', hit: true, evidence: '朝廷上接見' },
      { id: 'p2', hit: false },
      { id: 'p3', hit: true },
    ]);
  });

  it('adds only the points the model marks, and locks a long accept phrase', async () => {
    const judge = vi.fn<PointJudge>(async (input) => ({
      hits: input.points.map((point) => ({
        id: point.id,
        hit: point.id === 'p3',
        evidence: point.id === 'p3' ? '送他回去' : '',
      })),
    }));
    const result = await gradeLongPaper(
      quiz,
      { q5: '在朝廷上接見。其餘他只說送他回去。' },
      judge,
    );
    const graded = row('q5', result.rows);
    expect(judge).toHaveBeenCalledOnce();
    expect(graded.score).toBe(2);
    expect(graded.points.find((point) => point.id === 'p1')?.hit).toBe(true);
    expect(graded.points.find((point) => point.id === 'p2')?.hit).toBe(false);
    expect(graded.points.find((point) => point.id === 'p3')?.hit).toBe(true);
    expect(graded.points.find((point) => point.id === 'p3')?.evidence).toBe('送他回去');
    expect(graded.points.reduce((sum, point) => sum + point.awarded, 0)).toBe(2);
  });

  it('does not literal-lock 歸之 when the answer sends the jade home', async () => {
    const judge = vi.fn<PointJudge>(async (input) => ({
      hits: input.points.map((point) => ({ id: point.id, hit: false })),
    }));
    const result = await gradeLongPaper(quiz, { q5: '把璧送回趙國' }, judge);
    const graded = row('q5', result.rows);
    expect(judge).toHaveBeenCalled();
    expect(graded.points.find((point) => point.id === 'p3')?.hit).toBe(false);
    expect(graded.score).toBe(0);
  });

  it('upgrades 行動描寫 only when the quote point is already hit', async () => {
    const judge = vi.fn<PointJudge>(async (input) => ({
      hits: input.points.map((point) => ({ id: point.id, hit: false })),
    }));
    const withQuote = await gradeLongPaper(
      quiz,
      { q11: '運用行動描寫，寫他持璧卻立，憤怒至極，不畏強權。' },
      judge,
    );
    expect(row('q11', withQuote.rows).score).toBe(4);
    expect(row('q11', withQuote.rows).points.find((point) => point.id === 'tech')?.hit).toBe(true);

    const bare = await gradeLongPaper(quiz, { q11: '運用行動描寫，寫得很生動。' }, judge);
    expect(row('q11', bare.rows).score).toBe(0);
    expect(row('q11', bare.rows).points.find((point) => point.id === 'tech')?.hit).toBe(false);
  });

  it('keeps literal hits when the model is unavailable and leaves the rest at zero', async () => {
    const judge = vi.fn<PointJudge>(async () => {
      throw new Error('timeout');
    });
    const result = await gradeLongPaper(quiz, { q5: '在朝廷上接見，然後就結束了。' }, judge);
    const graded = row('q5', result.rows);
    expect(graded.aiUnavailable).toBe(true);
    expect(graded.points.find((point) => point.id === 'p1')?.hit).toBe(true);
    expect(graded.score).toBe(1);
  });

  it('does not ask the model about a blank answer', async () => {
    const judge = vi.fn(silentJudge);
    const result = await gradeLongPaper(quiz, { q9: '   ', q10: '' }, judge);
    expect(judge).not.toHaveBeenCalled();
    expect(row('q9', result.rows).score).toBe(0);
    expect(row('q10', result.rows).aiUnavailable).toBe(false);
  });

  it('scores a full paper at 30 without a typo deduction', async () => {
    const judge = vi.fn(silentJudge);
    const result = await gradeLongPaper(
      quiz,
      {
        q1a: '料想',
        q1b: '斜看',
        q1c: '別',
        q2: 'B',
        q3: 'B',
        q4: 'C',
        q5: '在朝廷上接見，完成禮節後，送他回趙。',
        q6: '吾所以為此者，以先國家之急而後私讎也。',
        q7: '顧全大局',
        [fieldKey('q8', '廉頗', 'action')]: '不滿自己位居相如之下，揚言必定當面羞辱相如。',
        [fieldKey('q8', '藺相如', 'image')]: '顧全大局',
        q9: '秦國比趙國強。不答應則趙理虧。寧願給璧。',
        q10: '深謀遠慮。三十日不還則立太子。以絕秦望。',
        q11: '肖像描寫。怒髮上衝冠。憤怒至極。不畏強權。',
      },
      judge,
    );
    expect(judge).not.toHaveBeenCalled();
    expect(result.score).toBe(30);
    expect(result.total).toBe(30);
    expect(result.rows).toHaveLength(13);
    expect(pointsOf('q10').some((point) => point.id === 'image')).toBe(true);
    const q11 = quiz.items.find((item) => item.id === 'q11');
    if (!q11 || q11.type !== 'long_points') throw new Error('missing q11');
    expect(q11.prompt).toContain('試加以說明，並指出該種描寫手法的好處。');
    expect(q11.prompt).not.toContain('指出其作用');
  });
});
