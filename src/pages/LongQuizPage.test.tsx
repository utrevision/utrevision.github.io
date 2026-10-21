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

  it('shows a live recite grid, hides scores until 完卷, then settles and records 30 as the total', async () => {
    await start();
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