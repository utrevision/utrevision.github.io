// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { saveAttempt } from '../attempts.ts';
import { firebaseAiJudge } from '../grading/aiClient.ts';
import { resolveGrades } from '../grading/resolveGrade.ts';
import type { QuizItem } from '../types.ts';
import { QuizPage } from './QuizPage.tsx';

const items: QuizItem[] = [
  { stem: '而束君歸趙矣', target: '束', answers: ['束縛'] },
  { stem: '臣舍人藺相如可使', target: '使', answers: ['出使'] },
];

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

vi.mock('../data/quizzes.ts', () => ({
  getQuiz: (id?: string) => {
    if (id !== 'lianpo') return undefined;
    return {
      id: 'lianpo',
      title: '《廉頗藺相如列傳》溫習小測（語譯）',
      items,
    };
  },
}));

vi.mock('../grading/aiClient.ts', () => ({
  firebaseAiJudge: vi.fn(async () => ({ score: 1 })),
}));

vi.mock('../grading/resolveGrade.ts', () => ({
  resolveGrades: vi.fn(async (tasks: { raw: string }[]) => tasks.map(() => ({ score: 1, source: 'literal' }))),
}));

function buttonNamed(name: string): HTMLButtonElement {
  const button = [...document.querySelectorAll('button')].find((node) => node.textContent?.trim() === name);
  if (!(button instanceof HTMLButtonElement)) throw new Error(`找不到按鈕：${name}`);
  return button;
}

function fillGloss(value: string) {
  const input = document.querySelector('#gloss');
  if (!(input instanceof HTMLInputElement)) throw new Error('找不到語譯欄');
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('per-question submit shows the suggested answer only', () => {
  let root: Root;
  let host: HTMLDivElement;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    vi.mocked(resolveGrades).mockClear();
    vi.mocked(firebaseAiJudge).mockClear();
    vi.mocked(saveAttempt).mockClear();
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
        <MemoryRouter initialEntries={['/quiz/lianpo']}>
          <Routes>
            <Route path="/quiz/:quizId" element={<QuizPage />} />
          </Routes>
        </MemoryRouter>,
      );
    });
    await act(async () => {
      buttonNamed('開始作答').click();
    });
  }

  it('does not score or call the model until the whole quiz is finished', async () => {
    await start();
    const firstStem = document.querySelector('.stem')?.textContent ?? '';
    const firstAnswer = firstStem.includes('束') ? '束縛' : '出使';

    await act(async () => {
      fillGloss('綁住');
    });
    await act(async () => {
      buttonNamed('送出').click();
    });

    expect(document.body.textContent).toContain(`建議答案：${firstAnswer}`);
    expect(document.querySelector('.score')).toBeNull();
    expect(document.body.textContent).not.toContain('得分');
    expect(document.body.textContent).not.toContain('智能判分');
    expect(document.body.textContent).not.toContain('正在智能判分');
    expect(resolveGrades).not.toHaveBeenCalled();
    expect(firebaseAiJudge).not.toHaveBeenCalled();

    await act(async () => {
      buttonNamed('下一題').click();
    });
    const secondStem = document.querySelector('.stem')?.textContent ?? '';
    const secondAnswer = secondStem.includes('束') ? '束縛' : '出使';
    await act(async () => {
      fillGloss('出使');
    });
    await act(async () => {
      buttonNamed('送出').click();
    });
    expect(document.body.textContent).toContain(`建議答案：${secondAnswer}`);
    expect(document.querySelector('.score')).toBeNull();
    expect(resolveGrades).not.toHaveBeenCalled();

    await act(async () => {
      buttonNamed('查看成績').click();
    });

    expect(resolveGrades).toHaveBeenCalledTimes(1);
    const tasks = vi.mocked(resolveGrades).mock.calls[0]?.[0];
    expect(tasks).toHaveLength(2);
    expect(vi.mocked(resolveGrades).mock.calls[0]?.[2]).toEqual(
      expect.objectContaining({ quizId: 'lianpo', uid: 'student' }),
    );
    expect(firebaseAiJudge).not.toHaveBeenCalled();
    expect(saveAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ quizId: 'lianpo', score: 2, total: 2, uid: 'student' }),
    );
    expect(document.body.textContent).toContain('命中率');
    expect(document.body.textContent).toContain('成績已寫入排行榜');
  });
});
