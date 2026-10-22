// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { saveAttempt } from '../attempts.ts';
import { saveLatestAnswers } from '../latestAnswers.ts';
import { QuizPage } from './QuizPage.tsx';

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

vi.mock('../latestAnswers.ts', () => ({
  saveLatestAnswers: vi.fn(async () => undefined),
}));

function buttonNamed(name: string): HTMLButtonElement {
  const button = [...document.querySelectorAll('button')].find((node) => node.textContent?.includes(name));
  if (!(button instanceof HTMLButtonElement)) throw new Error(`找不到按鈕：${name}`);
  return button;
}

describe('quiz pause and abort', () => {
  let root: Root;
  let host: HTMLDivElement;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    host.remove();
    vi.mocked(saveAttempt).mockClear();
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

  it('does not repeat 首頁 under the quiz title', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/quiz/lianpo']}>
          <Routes>
            <Route path="/quiz/:quizId" element={<QuizPage />} />
          </Routes>
        </MemoryRouter>,
      );
    });
    expect(document.querySelector('.quiz-start')?.textContent).not.toContain('首頁');
    expect(document.body.textContent).toContain('開始作答');
  });

  it('hides the question while paused and freezes the clock', async () => {
    await start();
    expect(document.querySelector('.stem')).toBeTruthy();
    expect(document.querySelector('#gloss')).toBeTruthy();
    const frozen = document.querySelector('time')?.textContent;

    await act(async () => {
      buttonNamed('暫停').click();
    });
    expect(document.querySelector('.stem')).toBeNull();
    expect(document.querySelector('#gloss')).toBeNull();
    expect(document.body.textContent).toContain('已暫停');
    expect(document.body.textContent).toContain('計時已經凍結');

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1100));
    });
    expect(document.querySelector('time')?.textContent).toBe(frozen);

    await act(async () => {
      buttonNamed('繼續').click();
    });
    expect(document.querySelector('.stem')).toBeTruthy();
    expect(document.querySelector('#gloss')).toBeTruthy();
    expect(document.body.textContent).not.toContain('已暫停');
  });

  it('asks before aborting and does not record the attempt', async () => {
    await start();
    await act(async () => {
      buttonNamed('中止').click();
    });
    const dialog = document.querySelector('dialog');
    expect(dialog?.open).toBe(true);
    expect(dialog?.textContent).toContain('不會寫入排行榜');

    await act(async () => {
      buttonNamed('返回作答').click();
    });
    expect(document.querySelector('dialog')?.open).toBe(false);
    expect(document.querySelector('#gloss')).toBeTruthy();

    await act(async () => {
      buttonNamed('中止').click();
    });
    await act(async () => {
      buttonNamed('確定中止').click();
    });
    expect(document.body.textContent).toContain('開始作答');
    expect(document.body.textContent).not.toContain('成績已寫入');
    expect(document.querySelector('.stem')).toBeNull();
    expect(saveAttempt).not.toHaveBeenCalled();
    expect(saveLatestAnswers).not.toHaveBeenCalled();
  });
});
