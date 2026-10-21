import { formatScore, verdictOf } from '../lib/format.ts';

export type SettlementEntry = {
  stem: string;
  target: string;
  raw: string;
  score: number;
  suggested: string;
};

function markClass(score: number): 'mark-ok' | 'mark-half' | 'mark-wrong' {
  const verdict = verdictOf(score);
  if (verdict === '對') return 'mark-ok';
  if (verdict === '半分') return 'mark-half';
  return 'mark-wrong';
}

export function Settlement({ rows }: { rows: readonly SettlementEntry[] }) {
  if (rows.length === 0) return null;

  const counts = { 對: 0, 半分: 0, 錯: 0 };
  for (const row of rows) counts[verdictOf(row.score)] += 1;

  return (
    <section className="settlement" aria-labelledby="settlement-title">
      <h2 id="settlement-title">逐題結算</h2>
      <p className="hint">
        對＝1 分，半分＝0.5 分，錯＝0 分。這次對 {counts['對']} 題，半分 {counts['半分']} 題，錯 {counts['錯']} 題。
      </p>
      <div className="table-wrap">
        <table className="settlement-table">
          <caption>每一題的對錯、得分、你的答案和建議答案</caption>
          <colgroup>
            <col className="col-n" />
            <col className="col-mark" />
            <col className="col-ask" />
            <col className="col-yours" />
            <col className="col-suggest" />
          </colgroup>
          <thead>
            <tr>
              <th scope="col">題</th>
              <th scope="col">結果</th>
              <th scope="col">考查</th>
              <th scope="col">你的答案</th>
              <th scope="col">建議答案</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const yours = row.raw.trim();
              return (
                <tr key={`${index}:${row.target}:${row.stem}`} className={markClass(row.score)}>
                  <th scope="row" data-label="題">
                    {index + 1}
                  </th>
                  <td className="verdict-cell" data-label="結果">
                    <strong className="verdict">{verdictOf(row.score)}</strong>
                    <span className="points">{formatScore(row.score)}</span>
                  </td>
                  <td data-label="考查">
                    <span className="exam-target">{row.target}</span>
                    <span className="stem-mini">{row.stem}</span>
                  </td>
                  <td data-label="你的答案">{yours || '（空白）'}</td>
                  <td data-label="建議答案">{row.suggested}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
