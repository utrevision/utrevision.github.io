// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HomePage } from './HomePage.tsx';

vi.mock('../auth.tsx', () => ({
  useAuth: () => ({
    user: null,
    ready: true,
    busy: false,
    error: null,
    errorCode: null,
    signIn: async () => undefined,
    signOut: async () => undefined,
  }),
}));

describe('home sections', () => {
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
  });

  it('groups the renamed quizzes under 中四 and 中五, without the old tagline', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <HomePage />
        </MemoryRouter>,
      );
    });

    const text = document.body.textContent ?? '';
    expect(text.indexOf('中四')).toBeGreaterThanOrEqual(0);
    expect(text.indexOf('中四')).toBeLessThan(text.indexOf('《廉頗藺相如列傳》溫習小測（語譯）'));
    expect(text.indexOf('《廉頗藺相如列傳》溫習小測（語譯）')).toBeLessThan(text.indexOf('中五'));
    expect(text.indexOf('中五')).toBeLessThan(text.indexOf('指定文言八篇溫習小測（語譯）'));
    expect(text).not.toContain('甲部');
    expect(text).not.toContain('選一套甲部小測');
    expect(text).toContain('65 題');
    expect(text).toContain('100 題');
    expect(text.indexOf('《廉頗藺相如列傳》溫習小測（語譯）')).toBeLessThan(text.indexOf('上學期測驗溫習小測2'));
    expect(text.indexOf('上學期測驗溫習小測2')).toBeLessThan(text.indexOf('中五'));
    expect(text).toContain('長答 · 30 分');
    expect(document.querySelector('a[href="/quiz/lianpo-longq-2"]')).toBeTruthy();
  });
});
