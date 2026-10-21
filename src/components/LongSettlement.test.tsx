// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { LongRow } from '../grading/longq.ts';
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
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    host.remove();
  });

  it('shows 對、半分、錯 against each question maximum and lists point hits', async () => {
    await act(async () => {
      root.render(<LongSettlement rows={rows} />);
    });

    const text = document.body.textContent ?? '';
    expect(text).toContain('逐題結算');
    expect(text).toContain('對 1 題');
    expect(text).toContain('半分 2 題');
    expect(text).toContain('錯 0 題');
    expect(text).toContain('1／2');
    expect(text).toContain('1／3');
    expect(text).toContain('2／2');
    expect(text).toContain('廷見＝在朝廷上接見（相如）');
    expect(text).toContain('在朝廷上接見');
    expect(text).toContain('忠君愛國');

    const half = document.querySelector('tr.mark-half');
    const full = document.querySelector('tr.mark-ok');
    expect(half?.textContent).toContain('半分');
    expect(full?.textContent).toContain('對');
    expect(full?.textContent).not.toContain('半分');

    const pointLabels = [...document.querySelectorAll('.point-hits strong')].map((node) => node.textContent);
    expect(pointLabels).toEqual(['對', '錯', '錯']);
  });
});
