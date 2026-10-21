// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { saveAttempt } from '../attempts.ts';
import { getLongQuiz } from '../data/longQuizzes.ts';
import { firebasePointJudge } from '../grading/longqAi.ts';
import { fieldKey, type PointJudge } from '../grading/longq.ts';
import { LongQuizPage } from './LongQuizPage.tsx';

const paper = getLongQuiz('lianpo-longq-2');
if (!paper) throw new Error('missing paper');

vi.mock('../auth.tsx', () => ({
  useAuth: () => ({
    user: { uid: 'student', displayName: '測試' },
    ready: true,
    busy: false,
    error: null,
    errorCode: null,
    signIn: async () => undefined,
    signOut: async () => undefined,
  }),
}));

vi.mock('../attempts.ts', () => ({
  saveAttempt: vi.fn(async () => ({ recorded: true })),
  deleteMyQuizAttempts: vi.fn(async () => undefined),
  loadLeaderboard: vi.fn(async () => []),
  firestoreErrorMessage: () => '寫入失敗',
}));

vi.mock('../grading/aiClient.ts', () => ({
  firebaseAiJudge: vi.fn(async () => ({ score: 0 })),
}));

vi.mock('../grading/longqAi.ts', () => ({
  firebasePointJudge: vi.fn<PointJudge>(async (input) => ({
    hits: input.points.map((point) => ({
      id: point.id,
      hit: input.questionId === 'q5' && point.id === 'p1',
      evidence: input.questionId === 'q5' && point.id === 'p1' ? '見到相如' : '',
    })),
  })),
}));

function buttonNamed(name: string): HTMLButtonElement {
  const button = [...document.querySelectorAll('button')].find((node) => node.textContent?.trim() === name);
  if (!(button instanceof HTMLButtonElement)) throw new Error(`找不到按鈕：${name}`);
  return button;
}

function setValue(id: string, value: string) {
  const field = document.getElementById(id);
  if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) {
    throw new Error(`找不到欄位 ${id}`);
  }
  const prototype = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  setter?.call(field, value);
  field.dispatchEvent(new Event('input', { bubbles: true }));
}

function choose(name: string, value: string) {
  const input = document.querySelector(`input[name="${name}"][value="${value}"]`);
  if (!(input instanceof HTMLInputElement)) throw new Error(`找不到選項 ${name} ${value}`);
  input.click();
}

describe('long quiz page', () => {
  let root: Root;
  let host: HTMLDivElement;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    vi.mocked(saveAttempt).mockClear();
    vi.mocked(firebasePointJudge).mockClear();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    host.remove();
  });

  async function start() {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <LongQuizPage paper={paper!} />
        </MemoryRouter>,
      );
    });
    await act(async () => {
      buttonNamed('開始作答').click();
    });
  }

  it('renders the 中五 long paper and its first gloss stem', async () => {
    const eight = getLongQuiz('eight-longq-1');
    await act(async () => {
      root.render(
        <MemoryRouter>
          <LongQuizPage paper={eight!} />
        </MemoryRouter>,
      );
    });
    expect(document.body.textContent).toContain('上學期測驗溫習小測1');
    expect(document.body.textContent).toContain('共 30 分');
    expect(document.querySelector('a[href="/quiz/eight-longq-1/board"]')).toBeTruthy();
    await act(async () => {
      buttonNamed('開始作答').click();
    });
    expect(document.body.textContent).toContain('學不可以已。');
    expect(document.body.textContent).toContain('弊在賂秦');
    expect(document.getElementById('field-q1a')).toBeTruthy();
  });

  it('does not repeat 首頁 under the paper title', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <LongQuizPage paper={paper!} />
        </MemoryRouter>,
      );
    });
    expect(document.querySelector('.quiz-start')?.textContent).not.toContain('首頁');
    expect(document.body.textContent).toContain('開始作答');
  });

  it('drops type names from question titles, grids 題7, and only reddens empty cells after leaving', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <LongQuizPage paper={paper!} />
        </MemoryRouter>,
      );
    });
    await act(async () => {
      buttonNamed('開始作答').click();
    });

    const headings = [...document.querySelectorAll('.q-head h3')].map((node) => node.textContent ?? '');
    expect(headings).toContain('題1');
    expect(headings).toContain('題6');
    expect(headings).toContain('題7');
    expect(headings).toContain('題8');
    expect(headings.join('\n')).not.toMatch(/短答|人物表|背誦|選擇|字詞語譯|句子語譯|長答|卡拉/);
    expect(document.body.textContent).toContain('試以四字作答');
    expect(document.body.textContent).toContain('試根據課文完成下表');

    const q7 = document.getElementById('field-q7')?.closest('.q-card');
    const q7Cells = () => [...(q7?.querySelectorAll('.recite-cell') ?? [])];
    expect(q7Cells()).toHaveLength(4);
    expect(q7Cells().every((cell) => cell.classList.contains('empty'))).toBe(true);
    expect(q7?.querySelector('.missing')).toBeNull();

    await act(async () => {
      setValue('field-q7', '先國');
    });
    expect(q7Cells().filter((cell) => cell.classList.contains('filled')).map((cell) => cell.textContent)).toEqual([
      '先',
      '國',
    ]);
    expect(q7?.querySelector('.missing')).toBeNull();

    await act(async () => {
      const field = document.getElementById('field-q7');
      field?.focus();
      field?.blur();
    });
    expect(q7Cells().filter((cell) => cell.classList.contains('missing'))).toHaveLength(2);
    expect(q7Cells().filter((cell) => cell.classList.contains('filled'))).toHaveLength(2);

    await act(async () => {
      setValue('field-q6', '吾');
      const area = document.getElementById('field-q6');
      area?.focus();
      area?.blur();
    });
    const q6 = document.getElementById('field-q6')?.closest('.q-card');
    expect(q6?.querySelectorAll('.recite-cell.filled').length).toBe(1);
    expect(q6?.querySelectorAll('.recite-cell.missing').length).toBeGreaterThan(0);
    expect(q6?.querySelector('.recite-cell.punct.missing')).toBeNull();

    expect(buttonNamed('完卷').disabled).toBe(false);
    await act(async () => {
      buttonNamed('完卷').click();
    });
    expect(document.body.textContent).toContain('逐題結算');
  });

  it('shows a live recite grid, hides scores until 完卷, then settles and records 30 as the total', async () => {
    await start();
    const paperText = document.body.textContent ?? '';
    expect(paperText).toContain('心胸狹窄');
    expect(paperText).toContain('常稱病不上朝');
    expect(paperText).not.toContain('已給');
    expect(paperText).toContain('該種描寫手法的好處');
    expect(paperText).not.toContain('指出其作用');
    expect(document.body.textContent).not.toContain('得分');
    const punct = [...document.querySelectorAll('.recite-cell.punct')].map((node) => node.textContent);
    expect(punct).toEqual(['，', '。']);
    expect(document.querySelector('.recite-cell.filled')).toBeNull();

    await act(async () => {
      setValue('field-q6', '吾');
    });
    expect(document.querySelector('.recite-cell.filled')?.textContent).toBe('吾');
    expect(document.querySelector('#field-q6')).toBeTruthy();

    await act(async () => {
      buttonNamed('暫停').click();
    });
    expect(document.querySelector('#field-q6')).toBeNull();
    expect(document.body.textContent).toContain('已暫停');

    await act(async () => {
      buttonNamed('繼續').click();
    });

    await act(async () => {
      setValue('field-q1a', '估計');
      setValue('field-q7', '忠君愛國');
      setValue('field-q6', '吾所以為此者，以先國家之急而後私讎也。');
      setValue(`field-${fieldKey('q8', '藺相如', 'image')}`, '顧全大局');
      setValue('field-q5', '他最後見到相如');
      choose('q2', 'B');
    });
    expect(document.body.textContent).not.toContain('得分');
    expect(firebasePointJudge).not.toHaveBeenCalled();

    await act(async () => {
      buttonNamed('完卷').click();
    });

    const text = document.body.textContent ?? '';
    expect(text).toContain('逐題結算');
    expect(text).toContain('得分');
    expect(text).toContain('9 / 30');
    expect(text).toContain('半分');
    expect(text).toContain('廷見');
    expect(text).toContain('見到相如');
    expect(firebasePointJudge).toHaveBeenCalledOnce();
    expect(saveAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ quizId: 'lianpo-longq-2', score: 9, total: 30, uid: 'student' }),
    );
  });
});