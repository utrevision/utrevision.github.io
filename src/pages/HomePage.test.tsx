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
    expect(text).toContain('長答 · 30 分');

    const form4 = document.getElementById('year-中四')?.closest('section');
    const form5 = document.getElementById('year-中五')?.closest('section');
    const form4Text = form4?.textContent ?? '';
    const form5Text = form5?.textContent ?? '';
    expect(form4Text.indexOf('《廉頗藺相如列傳》溫習小測（語譯）')).toBeLessThan(form4Text.indexOf('上學期測驗溫習小測1'));
    expect(form4Text.indexOf('上學期測驗溫習小測1')).toBeLessThan(form4Text.indexOf('上學期測驗溫習小測2'));
    expect(form4Text.indexOf('上學期測驗溫習小測2')).toBeLessThan(form4Text.indexOf('上學期測驗溫習小測3'));
    expect(form4Text.indexOf('上學期測驗溫習小測3')).toBeLessThan(text.indexOf('中五'));
    expect(form4?.querySelector('a[href="/quiz/lianpo-longq-1"]')).toBeTruthy();
    expect(form4?.querySelector('a[href="/quiz/lianpo-longq-2"]')).toBeTruthy();
    expect(form4?.querySelector('a[href="/quiz/lianpo-longq-3"]')).toBeTruthy();
    expect(form4?.querySelector('a[href="/quiz/eight-longq-1"]')).toBeNull();
    expect(form5Text.indexOf('指定文言八篇溫習小測（語譯）')).toBeLessThan(form5Text.indexOf('上學期測驗溫習小測1'));
    expect(form5?.querySelector('a[href="/quiz/eight-longq-1"]')).toBeTruthy();
    expect(form5?.querySelector('a[href="/quiz/lianpo-longq-1"]')).toBeNull();
    expect(form5?.querySelector('a[href="/quiz/lianpo-longq-3"]')).toBeNull();

    const marks = [...document.querySelectorAll('.new-mark')];
    expect(marks.map((node) => node.textContent)).toEqual(['新', '新']);
    expect(form4?.querySelectorAll('.new-mark')).toHaveLength(1);
    expect(form5?.querySelectorAll('.new-mark')).toHaveLength(1);

    const form4New = form4?.querySelector('.new-mark')?.closest('li');
    expect(form4New?.querySelector('a[href="/quiz/lianpo-longq-3"]')).toBeTruthy();
    expect(form4New?.classList.contains('is-new')).toBe(true);
    expect(form4?.querySelector('a[href="/quiz/lianpo"]')?.closest('li')?.classList.contains('is-new')).toBe(false);
    expect(form4?.querySelector('a[href="/quiz/lianpo-longq-1"]')?.closest('li')?.classList.contains('is-new')).toBe(false);
    expect(form4?.querySelector('a[href="/quiz/lianpo-longq-2"]')?.closest('li')?.classList.contains('is-new')).toBe(false);

    const form5New = form5?.querySelector('.new-mark')?.closest('li');
    expect(form5New?.querySelector('a[href="/quiz/eight-longq-1"]')).toBeTruthy();
    expect(form5New?.classList.contains('is-new')).toBe(true);
    expect(form5?.querySelector('a[href="/quiz/8passages"]')?.closest('li')?.classList.contains('is-new')).toBe(false);
    expect(document.querySelector('.quiz-card:not(.is-new) .new-mark')).toBeNull();
    expect(document.querySelector('.seal, .chop')).toBeNull();
  });
});
