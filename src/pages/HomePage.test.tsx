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

  it('groups the gloss quizzes by form and drops the old tagline', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <HomePage />
        </MemoryRouter>,
      );
    });

    const levels = [...document.querySelectorAll('h2')].map((node) => node.textContent);
    expect(levels).toEqual(['中四', '中五']);
    const titles = [...document.querySelectorAll('h3')].map((node) => node.textContent);
    expect(titles).toEqual(['《廉頗藺相如列傳》溫習小測（語譯）', '指定文言八篇溫習小測（語譯）']);
    expect(document.body.textContent).not.toContain('選一套甲部小測');
    expect(document.body.textContent).not.toContain('智能評分');
    expect(document.body.textContent).not.toContain('（甲部）');
    expect(document.body.textContent).toContain('65 題');
    expect(document.body.textContent).toContain('100 題');
  });
});
