import { itemVerdict, formatScore } from '../lib/format.ts';
import type { LongRow } from '../grading/longq.ts';

function markClass(score: number, max: number): 'mark-ok' | 'mark-half' | 'mark-wrong' {
  const verdict = itemVerdict(score, max);
  if (verdict === '對') return 'mark-ok';
  if (verdict === '半分') return 'mark-half';
  return 'mark-wrong';
}

export function LongSettlement({ rows }: { rows: readonly LongRow[] }) {
  if (rows.length === 0) return null;
  const counts = { 對: 0, 半分: 0, 錯: 0 };
  for (const row of rows) counts[itemVerdict(row.score, row.max)] += 1;
  const missedAi = rows.some((row) => row.aiUnavailable);

  return (
    <section className="settlement long-settlement" aria-labelledby="settlement-title">
      <h2 id="settlement-title">逐題結算</h2>
      <p className="hint">
        對＝得滿分，半分＝只得部分分數，錯＝0 分。這次對 {counts['對']} 題，半分 {counts['半分']} 題，錯 {counts['錯']} 題。
        開放題按給分點列出對或錯。
      </p>
      {missedAi ? (
        <p role="status" className="hint">
          有開放題未能完成智能評分。已對上答案字句的給分點仍會給分，其餘未鎖定的點記 0。
        </p>
      ) : null}
      <div className="table-wrap">
        <table className="settlement-table">
          <caption>每一題的對錯、得分、你的答案、建議答案和按點結果</caption>
          <thead>
            <tr>
              <th scope="col">題</th>
              <th scope="col">結果</th>
              <th scope="col">得分</th>
              <th scope="col">你的答案</th>
              <th scope="col">建議答案／按點</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const verdict = itemVerdict(row.score, row.max);
              return (
                <tr key={row.itemId} className={markClass(row.score, row.max)}>
                  <th scope="row">{row.qNo}</th>
                  <td className="verdict-cell">
                    <strong className="verdict">{verdict}</strong>
                  </td>
                  <td className="points">
                    {formatScore(row.score)}／{formatScore(row.max)}
                  </td>
                  <td>{row.yours.trim() || '（空白）'}</td>
                  <td>
                    <span>{row.suggested}</span>
                    {row.points.length > 0 ? (
                      <ul className="point-hits">
                        {row.points.map((point) => (
                          <li key={point.id} className={point.hit ? 'hit' : 'miss'}>
                            <strong>{point.hit ? '對' : '錯'}</strong>
                            <span>{point.desc}</span>
                            <span className="points">
                              {formatScore(point.awarded)}／{formatScore(point.max)}
                            </span>
                            {point.evidence ? <span className="hint">「{point.evidence}」</span> : null}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {row.aiUnavailable ? <p className="hint">這題有給分點未能完成智能評分。</p> : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
