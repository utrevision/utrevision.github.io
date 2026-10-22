import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { firestoreErrorMessage, saveAttempt } from '../attempts.ts';
import { useAuth } from '../auth.tsx';
import { saveLatestAnswers } from '../latestAnswers.ts';
import { longPaperAnswers } from '../lib/latestAnswerPayload.ts';
import { Leaderboard } from '../components/Leaderboard.tsx';
import { LongPaper } from '../components/LongPaper.tsx';
import { LongSettlement } from '../components/LongSettlement.tsx';
import { SignInPrompt } from '../components/SignInPrompt.tsx';
import { firebaseAiJudge } from '../grading/aiClient.ts';
import { gradeLongPaper, type LongQuiz, type LongRow } from '../grading/longq.ts';
import { firebasePointJudge } from '../grading/longqAi.ts';
import { elapsedMs } from '../lib/elapsed.ts';
import { formatDuration, formatHitRate } from '../lib/format.ts';
import type { FlagQuestion } from '../lib/questionFlag.ts';
import { submitQuestionFlag } from '../questionFlags.ts';

type Phase = 'ready' | 'paper' | 'grading' | 'result';

export function LongQuizPage({ paper }: { paper: LongQuiz }) {
  const { user, ready } = useAuth();
  const [phase, setPhase] = useState<Phase>('ready');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [rows, setRows] = useState<LongRow[]>([]);
  const [earned, setEarned] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [stoppedAt, setStoppedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [pausedAccumMs, setPausedAccumMs] = useState(0);
  const [pauseStartedAt, setPauseStartedAt] = useState<number | null>(null);
  const [abortOpen, setAbortOpen] = useState(false);
  const [grading, setGrading] = useState(false);
  const [gradeError, setGradeError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'kept' | 'error'>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [answerState, setAnswerState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [answerError, setAnswerError] = useState<string | null>(null);
  const [boardKey, setBoardKey] = useState(0);
  const attemptGen = useRef(0);
  const gradingLock = useRef(false);
  const gradeAbort = useRef<AbortController | null>(null);
  const pendingFinish = useRef<{ answers: Record<string, string>; durationMs: number } | null>(null);
  const continueRef = useRef<HTMLButtonElement>(null);
  const abortDialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    return () => {
      gradeAbort.current?.abort();
    };
  }, []);

  useEffect(() => {
    document.title = `${paper.title}｜文言溫習小測`;
  }, [paper.title]);

  useEffect(() => {
    if (startedAt == null || stoppedAt != null || pauseStartedAt != null) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [startedAt, stoppedAt, pauseStartedAt]);

  useEffect(() => {
    if (pauseStartedAt != null) continueRef.current?.focus();
  }, [pauseStartedAt]);

  useEffect(() => {
    const dialog = abortDialogRef.current;
    if (!dialog) return;
    if (abortOpen) {
      if (!dialog.open) dialog.showModal();
    } else if (dialog.open) {
      dialog.close();
    }
  }, [abortOpen]);

  const total = paper.totalMax;
  const limitMin = paper.timeLimitMin ?? 30;
  const elapsed = elapsedMs({ startedAt, stoppedAt, now, pausedAccumMs, pauseStartedAt });

  function begin() {
    gradeAbort.current?.abort();
    gradeAbort.current = null;
    gradingLock.current = false;
    pendingFinish.current = null;
    attemptGen.current += 1;
    setAnswers({});
    setRows([]);
    setEarned(0);
    setGrading(false);
    setGradeError(null);
    setStartedAt(Date.now());
    setStoppedAt(null);
    setNow(Date.now());
    setSaveState('idle');
    setSaveError(null);
    setAnswerState('idle');
    setAnswerError(null);
    setPausedAccumMs(0);
    setPauseStartedAt(null);
    setAbortOpen(false);
    setPhase('paper');
  }

  function setField(key: string, value: string) {
    setAnswers((current) => ({ ...current, [key]: value }));
  }

  async function reportQuestion(question: FlagQuestion) {
    if (!user) throw new Error('請先登入，才能回報問題。');
    return submitQuestionFlag({
      ...question,
      quizId: paper.id,
      quizTitle: paper.title,
      finishedAt: new Date(stoppedAt ?? Date.now()),
      uid: user.uid,
      displayName: user.displayName,
      studentEmail: user.email ?? '',
    });
  }

  async function publish(score: number, durationMs: number) {
    if (!user) return;
    const gen = attemptGen.current;
    setSaveState('saving');
    setSaveError(null);
    try {
      const result = await saveAttempt({
        uid: user.uid,
        displayName: user.displayName,
        quizId: paper.id,
        score,
        total,
        durationMs,
      });
      if (attemptGen.current !== gen) return;
      setSaveState(result.recorded ? 'saved' : 'kept');
      setBoardKey((value) => value + 1);
    } catch (caught) {
      if (attemptGen.current !== gen) return;
      setSaveState('error');
      setSaveError(firestoreErrorMessage(caught));
    }
  }

  async function persistAnswers(submitted: Record<string, string>, score: number, durationMs: number) {
    if (!user) return;
    const gen = attemptGen.current;
    setAnswerState('saving');
    setAnswerError(null);
    try {
      await saveLatestAnswers({
        uid: user.uid,
        displayName: user.displayName,
        quizId: paper.id,
        score,
        total,
        durationMs,
        answers: longPaperAnswers(paper, submitted),
      });
      if (attemptGen.current !== gen) return;
      setAnswerState('saved');
    } catch (caught) {
      if (attemptGen.current !== gen) return;
      setAnswerState('error');
      setAnswerError(firestoreErrorMessage(caught, 'answers'));
    }
  }

  async function finish(submitted: Record<string, string>, durationMs: number) {
    if (gradingLock.current) return;
    const gen = attemptGen.current;
    pendingFinish.current = { answers: submitted, durationMs };
    gradingLock.current = true;
    gradeAbort.current?.abort();
    const controller = new AbortController();
    gradeAbort.current = controller;
    setGrading(true);
    setGradeError(null);
    setPhase('grading');
    try {
      const result = await gradeLongPaper(paper, submitted, firebasePointJudge, {
        signal: controller.signal,
        synonymJudge: firebaseAiJudge,
        quizId: paper.id,
        uid: user?.uid,
      });
      if (attemptGen.current !== gen || controller.signal.aborted) return;
      setRows(result.rows);
      setEarned(result.score);
      setPhase('result');
      void publish(result.score, durationMs);
      void persistAnswers(submitted, result.score, durationMs);
    } catch (caught) {
      if (attemptGen.current !== gen || controller.signal.aborted) return;
      setGradeError(caught instanceof Error && caught.message ? caught.message : '結算成績失敗，請再試一次。');
    } finally {
      if (attemptGen.current === gen) {
        gradingLock.current = false;
        setGrading(false);
      }
    }
  }

  function submitPaper() {
    if (startedAt == null || gradingLock.current || pauseStartedAt != null) return;
    const durationMs = elapsedMs({
      startedAt,
      stoppedAt: null,
      now,
      pausedAccumMs,
      pauseStartedAt,
    });
    setStoppedAt(now);
    setSaveState('idle');
    setSaveError(null);
    setAnswerState('idle');
    setAnswerError(null);
    void finish(answers, durationMs);
  }

  function pauseQuiz() {
    if (pauseStartedAt != null) return;
    const at = Date.now();
    setNow(at);
    setPauseStartedAt(at);
  }

  function resumeQuiz() {
    if (pauseStartedAt == null) return;
    const at = Date.now();
    setPausedAccumMs((ms) => ms + (at - pauseStartedAt));
    setPauseStartedAt(null);
    setNow(at);
  }

  function abortAttempt() {
    const dialog = abortDialogRef.current;
    if (dialog?.open) dialog.close();
    gradeAbort.current?.abort();
    gradeAbort.current = null;
    gradingLock.current = false;
    pendingFinish.current = null;
    attemptGen.current += 1;
    setAbortOpen(false);
    setPhase('ready');
    setAnswers({});
    setRows([]);
    setEarned(0);
    setGrading(false);
    setGradeError(null);
    setStartedAt(null);
    setStoppedAt(null);
    setPausedAccumMs(0);
    setPauseStartedAt(null);
    setSaveState('idle');
    setSaveError(null);
    setAnswerState('idle');
    setAnswerError(null);
  }

  function retryFinish() {
    const pending = pendingFinish.current;
    if (!pending) return;
    void finish(pending.answers, pending.durationMs);
  }

  if (!ready) return <p role="status">正在確認登入狀態…</p>;

  if (!user) {
    return (
      <>
        <h2 className="page-title">{paper.title}</h2>
        <SignInPrompt reason="請先以 Google 帳號登入，才能開始作答。" />
      </>
    );
  }

  if (phase === 'ready') {
    return (
      <section className="quiz-start">
        <h2 className="page-title">{paper.title}</h2>
        <p className="lede">
          長答卷，共 {total} 分，限時 {limitMin} 分鐘。題目按卷面順序一次作答，途中不顯示分數。完卷後才結算：選擇、字詞、背誦、四字和形象格對答案；句子語譯和長答按給分點評分。電子版不扣錯別字。可暫停或中止；中止不入排行榜，也不留答案。
        </p>
        <div className="row-actions">
          <button type="button" className="button" onClick={begin}>
            開始作答
          </button>
          <Link className="button secondary" to={`/quiz/${paper.id}/board`}>
            排行榜
          </Link>
        </div>
      </section>
    );
  }

  if (phase === 'grading') {
    return (
      <div className="long-paper">
        <h2 className="page-title">正在結算成績…</h2>
        {grading ? <p role="status">請稍候。開放題會按給分點評分，完成後才顯示得分。</p> : null}
        {gradeError ? (
          <p role="alert" className="alert">
            {gradeError}{' '}
            <button type="button" className="button secondary" onClick={retryFinish} disabled={grading}>
              再試一次
            </button>
          </p>
        ) : null}
      </div>
    );
  }

  if (phase === 'result') {
    return (
      <div className="long-paper">
        <h2 className="page-title">作答完成</h2>
        <div className="result-summary">
          <p className="result-line">
            得分 <strong>{formatHitRate(earned, total)}</strong>
          </p>
          <p className="result-line">
            完成時間 <strong>{formatDuration(elapsed)}</strong>
          </p>
        </div>
        {saveState === 'saving' ? <p role="status">正在寫入排行榜…</p> : null}
        {saveState === 'saved' ? <p role="status">成績已寫入排行榜。</p> : null}
        {saveState === 'kept' ? <p role="status">這次未超過你的最佳紀錄，排行榜仍保留較佳的一次。</p> : null}
        {saveState === 'error' ? (
          <p role="alert" className="alert">
            {saveError}{' '}
            <button type="button" className="button secondary" onClick={() => void publish(earned, elapsed)}>
              再試寫入
            </button>
          </p>
        ) : null}
        {answerState === 'saving' ? <p role="status">正在儲存今次答案…</p> : null}
        {answerState === 'saved' ? <p role="status">已儲存今次全卷答案。</p> : null}
        {answerState === 'error' ? (
          <p role="alert" className="alert">
            {answerError}{' '}
            <button
              type="button"
              className="button secondary"
              onClick={() => void persistAnswers(answers, earned, elapsed)}
            >
              再試儲存
            </button>
          </p>
        ) : null}
        <LongSettlement rows={rows} items={paper.items} signedIn={user != null} onReport={reportQuestion} />
        <div className="row-actions">
          <button type="button" className="button" onClick={begin}>
            再做一次
          </button>
          <Link className="button secondary" to="/">
            返回首頁
          </Link>
        </div>
        <Leaderboard quizId={paper.id} refreshKey={boardKey} />
      </div>
    );
  }

  const paused = pauseStartedAt != null;

  return (
    <div className="long-paper">
      <div className="quiz-nav">
        <div className="quiz-toolbar">
          <p className="meta">{paper.title}</p>
          <p className="timer">
            用時 <time>{formatDuration(elapsed)}</time>
            <span className="hint">　限時 {limitMin} 分鐘</span>
          </p>
        </div>
        <div className="quiz-controls">
          {paused ? null : (
            <button type="button" className="button secondary" onClick={pauseQuiz}>
              暫停
            </button>
          )}
          <button type="button" className="button secondary" onClick={() => setAbortOpen(true)}>
            中止
          </button>
        </div>
      </div>
      {paused ? (
        <section className="panel" role="status">
          <h2>已暫停</h2>
          <p>題目已隱藏，計時已經凍結。按「繼續」回到試卷。</p>
          <div className="row-actions">
            <button type="button" className="button" ref={continueRef} onClick={resumeQuiz}>
              繼續
            </button>
          </div>
        </section>
      ) : (
        <>
          <p className="hint">答完按「完卷」。送出前不顯示分數，也不會逐題呼叫評分。</p>
          <LongPaper paper={paper} answers={answers} onChange={setField} />
          <div className="row-actions paper-submit">
            <button type="button" className="button" onClick={submitPaper}>
              完卷
            </button>
          </div>
        </>
      )}
      <dialog
        ref={abortDialogRef}
        className="confirm-dialog"
        aria-labelledby="abort-title"
        aria-describedby="abort-copy"
        onClose={() => setAbortOpen(false)}
      >
        <h2 id="abort-title">中止這次作答？</h2>
        <p id="abort-copy">中止後，這次作答不會寫入排行榜，也不會儲存答案。</p>
        <div className="row-actions">
          <button type="button" className="button secondary" onClick={() => abortDialogRef.current?.close()}>
            返回作答
          </button>
          <button type="button" className="button" onClick={abortAttempt}>
            確定中止
          </button>
        </div>
      </dialog>
    </div>
  );
}
