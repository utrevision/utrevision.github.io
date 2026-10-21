// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteAttempt, loadLeaderboard } from '../attempts.ts';
import { Leaderboard } from './Leaderboard.tsx';
import type { AttemptRecord } from '../types.ts';

const { authUser } = vi.hoisted(() => ({
  authUser: { uid: 'me', displayName: 'LAM KA HO WBSS' },
}));

vi.mock('../auth.tsx', () => ({
  useAuth: () => ({
    user: authUser,
    ready: true,
    busy: false,
    error: null,
    errorCode: null,
    signIn: async () => undefined,
    signOut: async () => undefined,
  }),
}));

vi.mock('../attempts.ts', () => ({
  loadLeaderboard: vi.fn(),
  deleteAttempt: vi.fn(async () => undefined),
  firestoreErrorMessage: () => '刪除失敗',
}));

const mine: AttemptRecord = {
  id: 'mine-row',
  uid: 'me',
  displayName: 'LAM KA HO WBSS',
  quizId: 'lianpo',
  score: 40,
  total: 66,
  hitRate: 40 / 66,
  durationMs: 5 * 60 * 1000 + 27 * 1000,
  finishedAt: new Date('2026-10-20T12:00:00+08:00'),
};

const other: AttemptRecord = {
  id: 'other-row',
  uid: 'someone-else',
  displayName: '其他同學',
  quizId: 'lianpo',
  score: 30,
  total: 66,
  hitRate: 30 / 66,
  durationMs: 400000,
  finishedAt: new Date('2026-10-20T12:05:00+08:00'),
};

function buttonNamed(name: string): HTMLButtonElement {
  const button = [...document.querySelectorAll('button')].find((node) => node.textContent === name);
  if (!(button instanceof HTMLButtonElement)) throw new Error(`找不到按鈕：${name}`);
  return button;
}

describe('leaderboard delete', () => {
  let root: Root;
  let host: HTMLDivElement;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    vi.mocked(loadLeaderboard).mockResolvedValue([mine, other]);
    vi.mocked(deleteAttempt).mockClear();
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
  }

  it('shows 65 for lianpo and a delete control only on the signed-in row', async () => {
    await renderBoard();
    expect(document.body.textContent).toContain('40 / 65');
    expect(document.body.textContent).toContain('61.5%');
    expect(document.body.textContent).not.toContain('/ 66');
    expect(document.body.textContent).toContain('LAM KA HO WBSS（你）');
    const deletes = [...document.querySelectorAll('button')].filter((node) => node.textContent === '刪除紀錄');
    expect(deletes).toHaveLength(1);
    const ownRow = document.querySelector('tr.mine');
    expect(ownRow?.textContent).toContain('刪除紀錄');
    const otherRow = [...document.querySelectorAll('tbody tr')].find((row) => row.textContent?.includes('其他同學'));
    expect(otherRow?.textContent).not.toContain('刪除紀錄');
    expect(otherRow?.classList.contains('mine')).toBe(false);
  });

  it('deletes only after two confirmations', async () => {
    await renderBoard();
    await act(async () => {
      buttonNamed('刪除紀錄').click();
    });
    const dialog = document.querySelector('dialog');
    expect(dialog?.open).toBe(true);
    expect(dialog?.textContent).toContain('刪除這筆紀錄？');
    expect(deleteAttempt).not.toHaveBeenCalled();

    await act(async () => {
      buttonNamed('繼續確認').click();
    });
    expect(dialog?.textContent).toContain('再確認一次');
    expect(dialog?.textContent).toContain('刪除後不能還原');
    expect(deleteAttempt).not.toHaveBeenCalled();

    await act(async () => {
      buttonNamed('確定刪除').click();
    });
    expect(deleteAttempt).toHaveBeenCalledExactlyOnceWith('mine-row');
    expect(document.body.textContent).not.toContain('LAM KA HO WBSS');
    expect(document.querySelector('dialog')?.open).toBe(false);
  });

  it('does not delete when the first confirmation is cancelled or stepped back', async () => {
    await renderBoard();
    await act(async () => {
      buttonNamed('刪除紀錄').click();
    });
    await act(async () => {
      buttonNamed('取消').click();
    });
    expect(document.querySelector('dialog')?.open).toBe(false);
    expect(deleteAttempt).not.toHaveBeenCalled();

    await act(async () => {
      buttonNamed('刪除紀錄').click();
    });
    await act(async () => {
      buttonNamed('繼續確認').click();
    });
    await act(async () => {
      buttonNamed('返回').click();
    });
    expect(document.querySelector('dialog')?.textContent).toContain('繼續確認');
    expect(deleteAttempt).not.toHaveBeenCalled();
  });
});
