import { useEffect, useState } from 'react';
import { firestoreErrorMessage, loadLeaderboard } from '../attempts.ts';
import { useAuth } from '../auth.tsx';
import { formatDuration, formatFinished, formatPercent, formatScore } from '../lib/format.ts';
import type { AttemptRecord, QuizId } from '../types.ts';

type LeaderboardProps = {
  quizId: QuizId;
  refreshKey?: number;
};

export function Leaderboard({ quizId, refreshKey = 0 }: LeaderboardProps) {
  const { user, ready } = useAuth();
  const [rows, setRows] = useState<AttemptRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!ready || !user) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    loadLeaderboard(quizId)
      .then((next) => {
        if (!cancelled) setRows(next);
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setRows(null);
          setError(firestoreErrorMessage(caught));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [quizId, refreshKey, ready, user]);

  if (!ready) {
    return <p role="status">正在確認登入狀態…</p>;
  }
  if (!user) {
    return <p>登入後才能查看排行榜。</p>;
  }

  return (
    <section className="board" aria-busy={loading}>
      <h2>排行榜</h2>
      <p className="hint">先按總分，再按命中率，然後按完成時間由短至長。</p>
      {loading && rows === null ? <p role="status">正在載入排行榜…</p> : null}
      {error ? (
        <p role="alert" className="alert">
          {error}
        </p>
      ) : null}
      {rows && rows.length === 0 ? <p>這套小測還沒有完成紀錄。</p> : null}
      {rows && rows.length > 0 ? (
        <div className="table-wrap">
          <table>
            <caption>已完成的作答，共 {rows.length} 次</caption>
            <thead>
              <tr>
                <th scope="col">名次</th>
                <th scope="col">姓名</th>
                <th scope="col">得分</th>
                <th scope="col">命中率</th>
                <th scope="col">時間</th>
                <th scope="col">完成</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const mine = row.uid === user.uid;
                return (
                  <tr key={row.id} className={mine ? 'mine' : undefined}>
                    <td>{index + 1}</td>
                    <td>
                      {row.displayName}
                      {mine ? '（你）' : ''}
                    </td>
                    <td>
                      {formatScore(row.score)} / {row.total}
                    </td>
                    <td>{formatPercent(row.score, row.total)}</td>
                    <td>{formatDuration(row.durationMs)}</td>
                    <td>{formatFinished(row.finishedAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
