// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SiteHeader } from './SiteHeader.tsx';

const auth = vi.hoisted(() => ({
  user: null as { displayName: string } | null,
  ready: true,
  busy: false,
  error: null as string | null,
  errorCode: null as string | null,
  signIn: async () => undefined,
  signOut: async () => undefined,
}));

vi.mock('../auth.tsx', () => ({
  useAuth: () => auth,
}));

describe('site header', () => {
  let root: Root;
  let host: HTMLDivElement;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    auth.user = { displayName: 'Viola Ng' };
    auth.ready = true;
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    host.remove();
    auth.user = null;
  });

  it('places 首頁 immediately left of 登出', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <SiteHeader />
        </MemoryRouter>,
      );
    });

    const actions = document.querySelector('.auth-slot .row-actions');
    const labels = [...(actions?.children ?? [])].map((node) => node.textContent?.trim());
    expect(labels).toEqual(['首頁', '登出']);
    expect(actions?.querySelector('a.button.secondary')?.getAttribute('href')).toBe('/');
    expect(document.body.textContent?.indexOf('首頁')).toBeLessThan(document.body.textContent?.indexOf('登出') ?? -1);
  });
});
