import { useEffect, useRef, useState } from 'react';
import { deleteAttempt, firestoreErrorMessage, loadLeaderboard } from '../attempts.ts';
import { useAuth } from '../auth.tsx';
import { canonicalQuizTotal } from '../data/quizzes.ts';
import { formatDuration, formatFinished, formatPercent, formatScore } from '../lib/format.ts';
import type { AttemptRecord, QuizId } from '../types.ts';

type LeaderboardProps = {
  quizId: QuizId;
  refreshKey?: number;
};

type PendingDelete = {
  id: string;
  step: 1 | 2;
};

export function Leaderboard({ quizId, refreshKey = 0 }: LeaderboardProps) {
  const { user, ready } = useAuth();
  const uid = user?.uid;
  const [rows, setRows] = useState<AttemptRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState<PendingDelete | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const total = canonicalQuizTotal(quizId);

  useEffect(() => {
    if (!ready || !uid) return;
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
  }, [quizId, refreshKey, ready, uid]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (pending) {
      if (!dialog.open) dialog.showModal();
    } else if (dialog.open) {
      dialog.close();
    }
  }, [pending]);

  useEffect(() => {
    if (pending) confirmRef.current?.focus();
  }, [pending]);

  if (!ready) {
    return <p role="status">正在確認登入狀態…</p>;
  }
  if (!user) {
    return <p>登入後才能查看排行榜。</p>;
  }

  function askDelete(id: string) {
    if (deleting) return;
    setDeleteError(null);
    setPending({ id, step: 1 });
  }

  function advanceDelete() {
    setPending((current) => (current ? { ...current, step: 2 } : current));
  }

  function retreatDelete() {
    setDeleteError(null);
    setPending((current) => (current ? { ...current, step: 1 } : current));
  }

  async function commitDelete() {
    if (!pending || pending.step !== 2 || deleting) return;
    const id = pending.id;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteAttempt(id);
      setRows((current) => current?.filter((row) => row.id !== id) ?? current);
      setPending(null);
    } catch (caught) {
      setDeleteError(firestoreErrorMessage(caught));
    } finally {
      setDeleting(false);
    }
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
                <th scope="col" className="actions">
                  操作
                </th>
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
                      {formatScore(row.score)} / {total}
                    </td>
                    <td>{formatPercent(row.score, total)}</td>
                    <td>{formatDuration(row.durationMs)}</td>
                    <td>{formatFinished(row.finishedAt)}</td>
                    <td className="actions">
                      {mine ? (
                        <button
                          type="button"
                          className="button secondary"
                          onClick={() => askDelete(row.id)}
                          aria-label={`刪除紀錄，${formatScore(row.score)}／${total}，${formatDuration(row.durationMs)}`}
                        >
                          刪除紀錄
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
      <dialog
        ref={dialogRef}
        className="confirm-dialog"
        aria-labelledby="delete-title"
        aria-describedby="delete-copy"
        onClose={() => {
          if (!deleting) setPending(null);
        }}
      >
        <h2 id="delete-title">{pending?.step === 2 ? '再確認一次' : '刪除這筆紀錄？'}</h2>
        <p id="delete-copy">
          {pending?.step === 2
            ? '刪除後不能還原。確定刪除這筆紀錄？'
            : '這會從排行榜移除你的這次作答。'}
        </p>
        {deleteError ? (
          <p role="alert" className="alert">
            {deleteError}
          </p>
        ) : null}
        <div className="row-actions">
          {pending?.step === 2 ? (
            <>
              <button type="button" className="button secondary" onClick={retreatDelete} disabled={deleting}>
                返回
              </button>
              <button
                type="button"
                className="button"
                ref={confirmRef}
                onClick={() => void commitDelete()}
                disabled={deleting}
              >
                {deleting ? '正在刪除…' : '確定刪除'}
              </button>
            </>
          ) : (
            <>
              <button type="button" className="button secondary" onClick={() => dialogRef.current?.close()}>
                取消
              </button>
              <button type="button" className="button" ref={confirmRef} onClick={advanceDelete}>
                繼續確認
              </button>
            </>
          )}
        </div>
      </dialog>
    </section>
  );
}
