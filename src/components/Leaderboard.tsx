import { useEffect, useRef, useState } from 'react';
import { deleteMyQuizAttempts, firestoreErrorMessage, loadLeaderboard } from '../attempts.ts';
import { useAuth } from '../auth.tsx';
import { formatDuration, formatFinished, formatScore } from '../lib/format.ts';
import type { AttemptRecord, QuizId } from '../types.ts';

type LeaderboardProps = {
  quizId: QuizId;
  refreshKey?: number;
};

export function Leaderboard({ quizId, refreshKey = 0 }: LeaderboardProps) {
  const { user, ready } = useAuth();
  const [rows, setRows] = useState<AttemptRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState(false);
  const [confirmStep, setConfirmStep] = useState<1 | 2>(1);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const deleteDialogRef = useRef<HTMLDialogElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  const uid = user?.uid ?? null;

  useEffect(() => {
    if (!ready || !uid) return;
    let cancelled = false;
    loadLeaderboard(quizId)
      .then((next) => {
        if (!cancelled) {
          setRows(next);
          setError(null);
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setRows(null);
          setError(firestoreErrorMessage(caught));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [quizId, refreshKey, ready, uid]);

  useEffect(() => {
    const dialog = deleteDialogRef.current;
    if (!dialog) return;
    if (pendingDelete) {
      if (!dialog.open) dialog.showModal();
    } else if (dialog.open) {
      dialog.close();
    }
  }, [pendingDelete]);

  useEffect(() => {
    if (pendingDelete) confirmButtonRef.current?.focus();
  }, [pendingDelete, confirmStep]);

  function closeDeletePrompt() {
    if (deleting) return;
    setPendingDelete(false);
    setConfirmStep(1);
    setDeleteError(null);
  }

  async function confirmDelete() {
    if (!user || deleting) return;
    if (confirmStep === 1) {
      setConfirmStep(2);
      return;
    }
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteMyQuizAttempts(quizId, user.uid);
      setRows((current) => current?.filter((row) => row.uid !== user.uid) ?? current);
      setDeleting(false);
      setPendingDelete(false);
      setConfirmStep(1);
    } catch (caught) {
      setDeleting(false);
      setDeleteError(firestoreErrorMessage(caught, 'delete'));
    }
  }

  if (!ready) {
    return <p role="status">正在確認登入狀態…</p>;
  }
  if (!user) {
    return <p>登入後才能查看排行榜。</p>;
  }

  const ownRow = rows?.find((row) => row.uid === user.uid);

  return (
    <section className="board" aria-busy={rows === null && error === null}>
      <h2>排行榜</h2>
      <p className="hint">
        每人只保留最佳一次（總分較高；同分則用時較短）。下表先按總分由高至低，同分再按完成時間由短至長。
      </p>
      {rows === null && error === null ? <p role="status">正在載入排行榜…</p> : null}
      {error ? (
        <p role="alert" className="alert">
          {error}
        </p>
      ) : null}
      {rows && rows.length === 0 ? <p>這套小測還沒有完成紀錄。</p> : null}
      {rows && rows.length > 0 ? (
        <div className="table-wrap">
          <table className="leaderboard">
            <caption>已完成的作答，每人一次，共 {rows.length} 人</caption>
            <colgroup>
              <col className="col-rank" />
              <col className="col-name" />
              <col className="col-score" />
              <col className="col-time" />
              <col className="col-done" />
              <col className="col-actions" />
            </colgroup>
            <thead>
              <tr>
                <th scope="col">名次</th>
                <th scope="col">姓名</th>
                <th scope="col">得分</th>
                <th scope="col">時間</th>
                <th scope="col">完成</th>
                <th scope="col">操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const mine = row.uid === user.uid;
                const [minutes, seconds] = formatDuration(row.durationMs).split(':');
                return (
                  <tr key={row.id} className={mine ? 'mine' : undefined}>
                    <td>{index + 1}</td>
                    <td className="name-cell">
                      {row.displayName}
                      {mine ? '（你）' : ''}
                    </td>
                    <td className="score-cell">
                      {formatScore(row.score)}
                      <span className="score-of"> / {row.total}</span>
                    </td>
                    <td className="time-cell">
                      {minutes}
                      <wbr />:{seconds}
                    </td>
                    <td className="done-cell">{formatFinished(row.finishedAt)}</td>
                    <td className="actions">
                      {mine ? (
                        <button
                          type="button"
                          className="button secondary compact"
                          onClick={() => {
                            setDeleteError(null);
                            setConfirmStep(1);
                            setPendingDelete(true);
                          }}
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
        ref={deleteDialogRef}
        className="confirm-dialog"
        aria-labelledby="delete-title"
        aria-describedby="delete-copy"
        onCancel={(event) => {
          if (deleting) event.preventDefault();
        }}
        onClose={closeDeletePrompt}
      >
        <h2 id="delete-title">{confirmStep === 1 ? '刪除這筆紀錄？' : '再次確認刪除？'}</h2>
        <p id="delete-copy">
          {confirmStep === 1
            ? `將刪除你的紀錄（${ownRow ? `${formatScore(ownRow.score)} / ${ownRow.total}，用時 ${formatDuration(ownRow.durationMs)}` : '本次成績'}）。請再確認一次才會刪除。`
            : '刪除後不能還原，排行榜會去掉你的紀錄。'}
        </p>
        {deleteError ? (
          <p role="alert" className="alert">
            {deleteError}
          </p>
        ) : null}
        <div className="row-actions">
          <button type="button" className="button secondary" onClick={closeDeletePrompt} disabled={deleting}>
            取消
          </button>
          <button
            type="button"
            className="button"
            ref={confirmButtonRef}
            onClick={() => void confirmDelete()}
            disabled={deleting}
          >
            {confirmStep === 1 ? '繼續確認' : deleting ? '正在刪除…' : '確定刪除'}
          </button>
        </div>
      </dialog>
    </section>
  );
}
