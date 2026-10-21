// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteMyQuizAttempts, loadLeaderboard } from '../attempts.ts';
import { Leaderboard } from './Leaderboard.tsx';

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
  loadLeaderboard: vi.fn(async () => [
    {
      id: 'mine',
      uid: 'student',
      displayName: 'LAM KA HO WBSS',
      quizId: 'lianpo',
      score: 40,
      total: 65,
      hitRate: 40 / 65,
      durationMs: 5 * 60 * 1000 + 27 * 1000,
      finishedAt: new Date('2026-10-20T08:00:00+08:00'),
    },
    {
      id: 'other',
      uid: 'other',
      displayName: '其他同學',
      quizId: 'lianpo',
      score: 50,
      total: 65,
      hitRate: 50 / 65,
      durationMs: 4 * 60 * 1000,
      finishedAt: new Date('2026-10-20T09:00:00+08:00'),
    },
  ]),
  deleteMyQuizAttempts: vi.fn(async () => undefined),
  firestoreErrorMessage: () => '刪除失敗',
}));

function buttonNamed(name: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll('button')].find((node) => node.textContent?.trim() === name) as
    | HTMLButtonElement
    | undefined;
}

describe('leaderboard delete', () => {
  let root: Root;
  let host: HTMLDivElement;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    vi.mocked(deleteMyQuizAttempts).mockClear();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    host.remove();
  });

  async function renderBoard() {
    await act(async () => {
      root.render(<Leaderboard quizId="lianpo" />);
    });
    await act(async () => {
      await Promise.resolve();
    });
  }

  it('shows 刪除紀錄 only on your row and deletes only after two confirms', async () => {
    await renderBoard();
    const own = [...document.querySelectorAll('tr')].find((row) => row.textContent?.includes('（你）'));
    const other = [...document.querySelectorAll('tr')].find((row) => row.textContent?.includes('其他同學'));
    expect(own?.textContent).toContain('刪除紀錄');
    expect(own?.classList.contains('mine')).toBe(true);
    expect(other?.textContent).not.toContain('刪除紀錄');
    expect(buttonNamed('刪除紀錄')).toBeTruthy();
    expect(document.body.textContent).toContain('40 / 65');

    await act(async () => {
      buttonNamed('刪除紀錄')?.click();
    });
    const dialog = document.querySelector('dialog');
    expect(dialog?.open).toBe(true);
    expect(dialog?.textContent).toContain('刪除這筆紀錄');
    expect(deleteMyQuizAttempts).not.toHaveBeenCalled();

    await act(async () => {
      buttonNamed('繼續確認')?.click();
    });
    expect(document.querySelector('dialog')?.textContent).toContain('再次確認刪除');
    expect(deleteMyQuizAttempts).not.toHaveBeenCalled();

    await act(async () => {
      buttonNamed('確定刪除')?.click();
    });
    expect(deleteMyQuizAttempts).toHaveBeenCalledTimes(1);
    expect(deleteMyQuizAttempts).toHaveBeenCalledWith('lianpo', 'student');
    expect(document.body.textContent).not.toContain('LAM KA HO WBSS');
  });

  it('leaves the row in place when the first confirm is cancelled', async () => {
    await renderBoard();
    await act(async () => {
      buttonNamed('刪除紀錄')?.click();
    });
    await act(async () => {
      buttonNamed('取消')?.click();
    });
    expect(document.querySelector('dialog')?.open).toBe(false);
    expect(deleteMyQuizAttempts).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('LAM KA HO WBSS');
    expect(loadLeaderboard).toHaveBeenCalled();
  });
});
