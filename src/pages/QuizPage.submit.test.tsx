// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getQuiz } from '../data/quizzes.ts';
import { suggestedAnswerText } from '../grading/grade.ts';
import { QuizPage } from './QuizPage.tsx';

const { resolveGrades } = vi.hoisted(() => ({
  resolveGrades: vi.fn(),
}));

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
  saveAttempt: vi.fn(async () => undefined),
  firestoreErrorMessage: () => '寫入失敗',
}));

vi.mock('../grading/resolveGrade.ts', () => ({
  resolveGrades,
}));

function buttonNamed(name: string): HTMLButtonElement {
  const button = [...document.querySelectorAll('button')].find((node) => node.textContent === name);
  if (!(button instanceof HTMLButtonElement)) throw new Error(`找不到按鈕：${name}`);
  return button;
}

describe('per-question submit', () => {
  let root: Root;
  let host: HTMLDivElement;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    resolveGrades.mockReset();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    host.remove();
  });

  it('shows only the suggested gloss and never the grading label', async () => {
    let release: (value: { score: 0 | 0.5 | 1; source: 'literal' }[]) => void = () => undefined;
    resolveGrades.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );

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

    const stem = document.querySelector('.stem')?.textContent ?? '';
    const item = getQuiz('lianpo')?.items.find((candidate) => candidate.stem === stem);
    expect(item).toBeTruthy();
    if (!item) return;

    const input = document.querySelector('#gloss');
    if (!(input instanceof HTMLInputElement)) throw new Error('找不到語譯欄');
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(input, item.answers[0] ?? '語譯');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    await act(async () => {
      buttonNamed('送出').click();
    });
    expect(buttonNamed('送出中…').disabled).toBe(true);
    expect(document.body.textContent).not.toContain('智能判分');
    expect(document.querySelector('.feedback')).toBeNull();

    await act(async () => {
      release([{ score: 0, source: 'literal' }]);
    });

    const feedback = document.querySelector('.feedback');
    expect(feedback?.textContent).toContain(`建議答案：${suggestedAnswerText(item)}`);
    expect(feedback?.textContent).not.toContain('分');
    expect(feedback?.textContent).not.toContain('得分');
    expect(feedback?.textContent).not.toContain('標準語譯');
    expect(feedback?.textContent).not.toContain('半分');
    expect(document.body.textContent).not.toContain('智能判分');
    expect(buttonNamed('下一題')).toBeTruthy();
  });
});
