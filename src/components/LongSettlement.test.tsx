// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getLongQuiz } from '../data/longQuizzes.ts';
import type { LongRow } from '../grading/longq.ts';
import type { FlagEmailStatus, FlagQuestion } from '../lib/questionFlag.ts';
import { LongSettlement } from './LongSettlement.tsx';

const rows: LongRow[] = [
  {
    itemId: 'q7',
    qNo: '7',
    title: '7　短答',
    yours: '忠君愛國',
    suggested: '先國後私、以國為先、顧全大局',
    score: 1,
    max: 2,
    points: [],
    aiUnavailable: false,
  },
  {
    itemId: 'q5',
    qNo: '5',
    title: '5　句譯',
    yours: '在朝廷上接見，其餘未寫。',
    suggested: '終於在朝廷上接見',
    score: 1,
    max: 3,
    aiUnavailable: false,
    points: [
      { id: 'p1', desc: '廷見＝在朝廷上接見（相如）', max: 1, hit: true, awarded: 1, evidence: '在朝廷上接見' },
      { id: 'p2', desc: '畢禮＝完成禮節之後', max: 1, hit: false, awarded: 0 },
      { id: 'p3', desc: '歸之＝把相如送回趙國', max: 1, hit: false, awarded: 0 },
    ],
  },
  {
    itemId: 'q2',
    qNo: '2',
    title: '2　誠',
    yours: 'B　實在',
    suggested: 'B　實在',
    score: 2,
    max: 2,
    points: [],
    aiUnavailable: false,
  },
];

describe('long settlement', () => {
  let root: Root;
  let host: HTMLDivElement;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    window.confirm = vi.fn(() => true);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    host.remove();
    vi.restoreAllMocks();
  });

  it('shows each score against the question maximum and lists point hits', async () => {
    await act(async () => {
      root.render(<LongSettlement rows={rows} signedIn onReport={async () => 'sent'} />);
    });

    const text = document.body.textContent ?? '';
    expect(text).toContain('逐題結算');
    expect(text).toContain('若你認為自己的答案被誤判為錯誤，請按回報問題按鈕。');
    expect(text).not.toContain('半分');
    expect(text).not.toContain('回報題目');
    expect(text).not.toContain('每一題的對錯');
    expect(text).toContain('1／2');
    expect(text).toContain('1／3');
    expect(text).toContain('2／2');
    expect(text).toContain('廷見＝在朝廷上接見（相如）');
    expect(text).toContain('在朝廷上接見');
    expect(text).toContain('忠君愛國');
    expect(document.querySelector('caption')).toBeNull();
    expect([...document.querySelectorAll('thead th')].map((cell) => cell.textContent)).toEqual([
      '題',
      '得分',
      '你的答案',
      '建議答案／按點',
      '回報',
    ]);

    const partial = document.querySelector('tr.mark-half');
    const full = document.querySelector('tr.mark-ok');
    expect(partial?.textContent).toContain('1／2');
    expect(partial?.textContent).not.toContain('半分');
    expect(full?.textContent).toContain('2／2');
    expect(full?.textContent).not.toContain('半分');

    const pointLabels = [...document.querySelectorAll('.point-hits strong')].map((node) => node.textContent);
    expect(pointLabels).toEqual(['對', '錯', '錯']);
    expect(document.querySelectorAll('.flag-button')).toHaveLength(rows.length);
  });

  it('reports a long-paper row with the paper question, answers, and point hits', async () => {
    const paper = getLongQuiz('lianpo-longq-2');
    const onReport = vi.fn(async (_question: FlagQuestion): Promise<FlagEmailStatus> => 'skipped');
    await act(async () => {
      root.render(<LongSettlement rows={rows} items={paper?.items} signedIn onReport={onReport} />);
    });

    const flagged = document.querySelector('tr.mark-half .flag-button');
    const buttons = [...document.querySelectorAll('tr.mark-half .flag-button')];
    const pointRow = buttons[1];
    if (!(pointRow instanceof HTMLButtonElement)) throw new Error('找不到回報按鈕');
    await act(async () => {
      pointRow.click();
    });

    expect(onReport).toHaveBeenCalledOnce();
    const reported = onReport.mock.calls[0]?.[0];
    expect(reported).toEqual(
      expect.objectContaining({
        itemId: 'q5',
        qNo: '5',
        studentAnswer: '在朝廷上接見，其餘未寫。',
        suggestedAnswer: '終於在朝廷上接見',
        score: 1,
        max: 3,
        outcome: '錯',
      }),
    );
    expect(reported?.stem).toContain('卒廷見相如');
    expect(reported?.pointsNote).toContain('廷見＝在朝廷上接見（相如）');
    expect(reported?.pointsNote).toContain('證據：在朝廷上接見');
    expect(pointRow.disabled).toBe(true);
    expect(pointRow.textContent).toContain('已回報');
    expect(document.body.textContent).not.toContain('電郵暫時未能送出');
    expect(flagged).toBeTruthy();
  });
});
