// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { verdictOf } from '../lib/format.ts';
import type { FlagEmailStatus, FlagQuestion } from '../lib/questionFlag.ts';
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
      root.render(<Settlement rows={rows} signedIn onReport={async () => 'sent'} />);
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
    expect(document.querySelectorAll('.flag-button')).toHaveLength(3);
  });

  it('flags one row, then shows 已回報 and ignores another click', async () => {
    const onReport = vi.fn(async (): Promise<FlagEmailStatus> => 'sent');
    await act(async () => {
      root.render(<Settlement rows={rows} signedIn onReport={onReport} />);
    });

    const button = document.querySelector('tr.mark-wrong .flag-button');
    if (!(button instanceof HTMLButtonElement)) throw new Error('找不到回報按鈕');
    await act(async () => {
      button.click();
      button.click();
    });

    expect(onReport).toHaveBeenCalledOnce();
    expect(onReport).toHaveBeenCalledWith(
      expect.objectContaining<Partial<FlagQuestion>>({
        target: '束',
        stem: '而束君歸趙矣',
        studentAnswer: '綁住',
        suggestedAnswer: '束縛、綁',
        score: 0,
        max: 1,
        outcome: '錯',
        qNo: '1',
        itemId: 'gloss:束:而束君歸趙矣',
      }),
    );
    expect(button.disabled).toBe(true);
    expect(button.textContent).toContain('已回報');
    expect(button.getAttribute('aria-label')).toBe('第1題已回報');
  });

  it('keeps the flag when email fails, and leaves the button enabled when the save fails', async () => {
    const onReport = vi
      .fn<QuestionReporter>()
      .mockResolvedValueOnce('failed')
      .mockRejectedValueOnce(new Error('回報未能記下，請再試一次。'));
    await act(async () => {
      root.render(<Settlement rows={rows} signedIn onReport={onReport} />);
    });

    const buttons = [...document.querySelectorAll('.flag-button')];
    const first = buttons[0];
    const second = buttons[1];
    if (!(first instanceof HTMLButtonElement) || !(second instanceof HTMLButtonElement)) {
      throw new Error('找不到回報按鈕');
    }

    await act(async () => {
      first.click();
    });
    expect(first.disabled).toBe(true);
    expect(first.textContent).toContain('已回報');
    expect(document.body.textContent).toContain('已回報。電郵暫時未能送出。');

    await act(async () => {
      second.click();
    });
    expect(second.disabled).toBe(false);
    expect(second.textContent).toContain('回報題目');
    expect(document.body.textContent).toContain('回報未能記下，請再試一次。');
  });

  it('asks a signed-out student to sign in and does not report', async () => {
    const onReport = vi.fn(async (): Promise<FlagEmailStatus> => 'sent');
    await act(async () => {
      root.render(<Settlement rows={rows} signedIn={false} onReport={onReport} />);
    });
    const button = document.querySelector('.flag-button');
    if (!(button instanceof HTMLButtonElement)) throw new Error('找不到回報按鈕');
    await act(async () => {
      button.click();
    });
    expect(onReport).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('請先登入，才能回報題目。');
    expect(button.disabled).toBe(false);
  });
});

type QuestionReporter = (question: FlagQuestion) => Promise<FlagEmailStatus>;
