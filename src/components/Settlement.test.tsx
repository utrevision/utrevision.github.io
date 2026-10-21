// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { verdictOf } from '../lib/format.ts';
import { Settlement, type SettlementEntry } from './Settlement.tsx';

const rows: SettlementEntry[] = [
  { stem: '而束君歸趙矣', target: '束', raw: '綁住', score: 0, suggested: '束縛、綁' },
  { stem: '臣舍人藺相如可使', target: '使', raw: '出使', score: 1, suggested: '出使' },
  { stem: '即患秦兵之來', target: '患', raw: '憂心', score: 0.5, suggested: '擔憂、擔心、憂慮' },
];

describe('verdict labels', () => {
  it('maps full, half, and zero scores to 對、半分、錯', () => {
    expect(verdictOf(1)).toBe('對');
    expect(verdictOf(0.5)).toBe('半分');
    expect(verdictOf(0)).toBe('錯');
  });
});

describe('settlement list', () => {
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

  it('shows every question as 對, 半分, or 錯 with the score and both answers', async () => {
    await act(async () => {
      root.render(<Settlement rows={rows} />);
    });

    const text = document.body.textContent ?? '';
    expect(text).toContain('逐題結算');
    expect(text).toContain('對 1 題');
    expect(text).toContain('半分 1 題');
    expect(text).toContain('錯 1 題');
    expect(text).not.toContain('命中率');

    const wrong = document.querySelector('tr.mark-wrong');
    const correct = document.querySelector('tr.mark-ok');
    const half = document.querySelector('tr.mark-half');
    expect(wrong?.textContent).toContain('錯');
    expect(wrong?.textContent).toContain('0');
    expect(wrong?.textContent).toContain('束');
    expect(wrong?.textContent).toContain('而束君歸趙矣');
    expect(wrong?.textContent).toContain('綁住');
    expect(wrong?.textContent).toContain('束縛、綁');
    expect(correct?.textContent).toContain('對');
    expect(correct?.textContent).toContain('1');
    expect(correct?.textContent).toContain('出使');
    expect(half?.textContent).toContain('半分');
    expect(half?.textContent).toContain('0.5');
    expect(half?.textContent).toContain('憂心');
    expect(half?.textContent).toContain('擔憂、擔心、憂慮');

    const numbers = [...document.querySelectorAll('tbody th')].map((cell) => cell.textContent);
    expect(numbers).toEqual(['1', '2', '3']);
  });
});
