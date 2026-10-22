import { QuestionFlagButton } from './QuestionFlagButton.tsx';
import { formatScore } from '../lib/format.ts';
import { longFlagQuestion, type QuestionFlagHandler } from '../lib/questionFlag.ts';
import type { LongItem, LongRow } from '../grading/longq.ts';

function markClass(score: number, max: number): 'mark-ok' | 'mark-half' | 'mark-wrong' {
  if (!(max > 0) || !(score > 0)) return 'mark-wrong';
  if (score + 1e-9 >= max) return 'mark-ok';
  return 'mark-half';
}

export function LongSettlement({
  rows,
  items,
  signedIn,
  onReport,
}: {
  rows: readonly LongRow[];
  items?: readonly LongItem[];
  signedIn: boolean;
  onReport: QuestionFlagHandler;
}) {
  if (rows.length === 0) return null;
  const missedAi = rows.some((row) => row.aiUnavailable);

  return (
    <section className="settlement long-settlement" aria-labelledby="settlement-title">
      <h2 id="settlement-title">逐題結算</h2>
      <p className="hint">若你認為自己的答案被誤判為錯誤，請按回報問題按鈕。</p>
      {missedAi ? (
        <p role="status" className="hint">
          有開放題未能完成智能評分。已對上答案字句的給分點仍會給分，其餘未鎖定的點記 0。
        </p>
      ) : null}
      <div className="table-wrap">
        <table className="settlement-table">
          <colgroup>
            <col className="col-n" />
            <col className="col-score" />
            <col className="col-yours" />
            <col className="col-suggest" />
            <col className="col-flag" />
          </colgroup>
          <thead>
            <tr>
              <th scope="col">題</th>
              <th scope="col">得分</th>
              <th scope="col">你的答案</th>
              <th scope="col">建議答案／按點</th>
              <th scope="col">回報</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const item = items?.find((entry) => entry.id === row.itemId);
              return (
                <tr key={row.itemId} className={markClass(row.score, row.max)}>
                  <th scope="row" data-label="題">
                    {row.qNo}
                  </th>
                  <td className="points" data-label="得分">
                    {formatScore(row.score)}／{formatScore(row.max)}
                  </td>
                  <td data-label="你的答案">{row.yours.trim() || '（空白）'}</td>
                  <td data-label="建議答案">
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
                  <td className="flag-cell" data-label="回報">
                    {row.max > 0 ? (
                      <QuestionFlagButton
                        question={longFlagQuestion(row, item)}
                        signedIn={signedIn}
                        onReport={onReport}
                      />
                    ) : null}
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
