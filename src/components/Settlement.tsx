import { QuestionFlagButton } from './QuestionFlagButton.tsx';
import { formatScore } from '../lib/format.ts';
import { glossFlagQuestion, type QuestionFlagHandler } from '../lib/questionFlag.ts';

export type SettlementEntry = {
  stem: string;
  target: string;
  raw: string;
  score: number;
  suggested: string;
};

function markClass(score: number): 'mark-ok' | 'mark-half' | 'mark-wrong' {
  if (score + 1e-9 >= 1) return 'mark-ok';
  if (score > 0) return 'mark-half';
  return 'mark-wrong';
}

export function Settlement({
  rows,
  signedIn,
  onReport,
}: {
  rows: readonly SettlementEntry[];
  signedIn: boolean;
  onReport: QuestionFlagHandler;
}) {
  if (rows.length === 0) return null;

  return (
    <section className="settlement" aria-labelledby="settlement-title">
      <h2 id="settlement-title">逐題結算</h2>
      <p className="hint">若你認為自己的答案被誤判為錯誤，請按回報問題按鈕。</p>
      <div className="table-wrap">
        <table className="settlement-table">
          <colgroup>
            <col className="col-n" />
            <col className="col-score" />
            <col className="col-ask" />
            <col className="col-yours" />
            <col className="col-suggest" />
            <col className="col-flag" />
          </colgroup>
          <thead>
            <tr>
              <th scope="col">題</th>
              <th scope="col">得分</th>
              <th scope="col">考查</th>
              <th scope="col">你的答案</th>
              <th scope="col">建議答案</th>
              <th scope="col">回報</th>
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
                  <td className="points" data-label="得分">
                    {formatScore(row.score)}／1
                  </td>
                  <td data-label="考查">
                    <span className="exam-target">{row.target}</span>
                    <span className="stem-mini">{row.stem}</span>
                  </td>
                  <td data-label="你的答案">{yours || '（空白）'}</td>
                  <td data-label="建議答案">{row.suggested}</td>
                  <td className="flag-cell" data-label="回報">
                    <QuestionFlagButton question={glossFlagQuestion(row, index)} signedIn={signedIn} onReport={onReport} />
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
