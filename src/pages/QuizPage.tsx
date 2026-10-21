import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { firestoreErrorMessage, saveAttempt } from '../attempts.ts';
import { useAuth } from '../auth.tsx';
import { Leaderboard } from '../components/Leaderboard.tsx';
import { SignInPrompt } from '../components/SignInPrompt.tsx';
import { Stem } from '../components/Stem.tsx';
import { getQuiz } from '../data/quizzes.ts';
import { firebaseAiJudge } from '../grading/aiClient.ts';
import { AI_GRADE_CONCURRENCY, AI_GRADE_TIMEOUT_MS } from '../grading/aiPrompt.ts';
import { resolveGrades } from '../grading/resolveGrade.ts';
import { elapsedMs } from '../lib/elapsed.ts';
import { formatDuration, formatHitRate } from '../lib/format.ts';
import { shuffle } from '../lib/shuffle.ts';
import type { QuizItem } from '../types.ts';

type Phase = 'ready' | 'question' | 'grading' | 'result';

type GivenAnswer = {
  item: QuizItem;
  raw: string;
};

function suggestedAnswer(item: QuizItem): string {
  return item.answers
    .map((answer) => answer.trim())
    .filter((answer) => answer.length > 0)
    .join('、');
}

export function QuizPage() {
  const { quizId } = useParams();
  const quiz = getQuiz(quizId);
  const { user, ready } = useAuth();
  const [phase, setPhase] = useState<Phase>('ready');
  const [order, setOrder] = useState<QuizItem[]>([]);
  const [index, setIndex] = useState(0);
  const [draft, setDraft] = useState('');
  const [given, setGiven] = useState<GivenAnswer[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [grading, setGrading] = useState(false);
  const [gradeError, setGradeError] = useState<string | null>(null);
  const [earned, setEarned] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [stoppedAt, setStoppedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'kept' | 'error'>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [boardKey, setBoardKey] = useState(0);
  const [pausedAccumMs, setPausedAccumMs] = useState(0);
  const [pauseStartedAt, setPauseStartedAt] = useState<number | null>(null);
  const [abortOpen, setAbortOpen] = useState(false);
  const attemptGen = useRef(0);
  const gradingLock = useRef(false);
  const gradeAbort = useRef<AbortController | null>(null);
  const pendingFinish = useRef<{ answered: GivenAnswer[]; durationMs: number } | null>(null);
  const nextButtonRef = useRef<HTMLButtonElement>(null);
  const continueRef = useRef<HTMLButtonElement>(null);
  const abortDialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    return () => {
      gradeAbort.current?.abort();
    };
  }, []);

  useEffect(() => {
    document.title = quiz ? `${quiz.title}｜文言溫習小測` : '文言溫習小測';
  }, [quiz]);

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

  useEffect(() => {
    if (!revealed) return;
    nextButtonRef.current?.focus();
  }, [revealed, index]);

  if (!quiz) {
    return (
      <section className="panel">
        <h2>找不到這套小測</h2>
        <Link className="button secondary" to="/">
          返回首頁
        </Link>
      </section>
    );
  }

  const total = quiz.items.length;
  const current = order[index];
  const elapsed = elapsedMs({ startedAt, stoppedAt, now, pausedAccumMs, pauseStartedAt });

  function begin() {
    gradeAbort.current?.abort();
    gradeAbort.current = null;
    gradingLock.current = false;
    pendingFinish.current = null;
    attemptGen.current += 1;
    setOrder(shuffle(quiz!.items));
    setIndex(0);
    setDraft('');
    setGiven([]);
    setRevealed(false);
    setGrading(false);
    setGradeError(null);
    setEarned(0);
    setStartedAt(Date.now());
    setStoppedAt(null);
    setNow(Date.now());
    setSaveState('idle');
    setSaveError(null);
    setPausedAccumMs(0);
    setPauseStartedAt(null);
    setAbortOpen(false);
    setPhase('question');
  }

  function submitAnswer() {
    if (!current || revealed || gradingLock.current) return;
    setRevealed(true);
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
        quizId: quiz!.id,
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

  async function finish(answered: GivenAnswer[], durationMs: number) {
    if (gradingLock.current) return;
    const gen = attemptGen.current;
    pendingFinish.current = { answered, durationMs };
    gradingLock.current = true;
    gradeAbort.current?.abort();
    const controller = new AbortController();
    gradeAbort.current = controller;
    setGrading(true);
    setGradeError(null);
    setPhase('grading');
    try {
      const resolutions = await resolveGrades(answered, firebaseAiJudge, {
        concurrency: AI_GRADE_CONCURRENCY,
        timeoutMs: AI_GRADE_TIMEOUT_MS,
        signal: controller.signal,
        quizId: quiz?.id,
        uid: user?.uid,
      });
      if (attemptGen.current !== gen || controller.signal.aborted) return;
      const score = resolutions.reduce((sum, resolution) => sum + (resolution?.score ?? 0), 0);
      setEarned(score);
      setPhase('result');
      void publish(score, durationMs);
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

  function goNext() {
    if (!current || !revealed || startedAt == null || gradingLock.current) return;
    const answered = [...given, { item: current, raw: draft }];
    if (index + 1 >= order.length) {
      const durationMs = elapsedMs({
        startedAt,
        stoppedAt: null,
        now,
        pausedAccumMs,
        pauseStartedAt,
      });
      setGiven(answered);
      setStoppedAt(now);
      setSaveState('idle');
      setSaveError(null);
      void finish(answered, durationMs);
      return;
    }
    setGiven(answered);
    setIndex((value) => value + 1);
    setDraft('');
    setRevealed(false);
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
    setOrder([]);
    setIndex(0);
    setDraft('');
    setGiven([]);
    setRevealed(false);
    setGrading(false);
    setGradeError(null);
    setEarned(0);
    setStartedAt(null);
    setStoppedAt(null);
    setPausedAccumMs(0);
    setPauseStartedAt(null);
    setSaveState('idle');
    setSaveError(null);
  }

  function retryFinish() {
    const pending = pendingFinish.current;
    if (!pending) return;
    void finish(pending.answered, pending.durationMs);
  }

  if (!ready) {
    return <p role="status">正在確認登入狀態…</p>;
  }

  if (!user) {
    return (
      <>
        <h2 className="page-title">{quiz.title}</h2>
        <SignInPrompt reason="請先以 Google 帳號登入，才能開始作答。" />
      </>
    );
  }

  if (phase === 'ready') {
    return (
      <>
        <p className="meta">
          <Link to="/">首頁</Link>
        </p>
        <h2 className="page-title">{quiz.title}</h2>
        <p className="lede">
          共 {total} 題；題序隨機、計時作答。完成全部題目後才結算成績。途中可暫停或中止；中止不入排行榜。
        </p>
        <div className="row-actions">
          <button type="button" className="button" onClick={begin}>
            開始作答
          </button>
          <Link className="button secondary" to={`/quiz/${quiz.id}/board`}>
            排行榜
          </Link>
        </div>
      </>
    );
  }

  if (phase === 'grading') {
    return (
      <>
        <h2 className="page-title">正在結算成績…</h2>
        {grading ? <p role="status">請稍候，完成後會顯示命中率。</p> : null}
        {gradeError ? (
          <p role="alert" className="alert">
            {gradeError}{' '}
            <button type="button" className="button secondary" onClick={retryFinish} disabled={grading}>
              再試一次
            </button>
          </p>
        ) : null}
      </>
    );
  }

  if (phase === 'result') {
    return (
      <>
        <h2 className="page-title">作答完成</h2>
        <p className="result-line">
          命中率 <strong>{formatHitRate(earned, total)}</strong>
        </p>
        <p className="result-line">
          完成時間 <strong>{formatDuration(elapsed)}</strong>
        </p>
        {saveState === 'saving' ? <p role="status">正在寫入排行榜…</p> : null}
        {saveState === 'saved' ? <p role="status">成績已寫入排行榜。</p> : null}
        {saveState === 'kept' ? (
          <p role="status">這次未超過你的最佳紀錄，排行榜仍保留較佳的一次。</p>
        ) : null}
        {saveState === 'error' ? (
          <p role="alert" className="alert">
            {saveError}{' '}
            <button type="button" className="button secondary" onClick={() => void publish(earned, elapsed)}>
              再試寫入
            </button>
          </p>
        ) : null}
        <div className="row-actions">
          <button type="button" className="button" onClick={begin}>
            再做一次
          </button>
          <Link className="button secondary" to="/">
            返回首頁
          </Link>
        </div>
        <Leaderboard quizId={quiz.id} refreshKey={boardKey} />
      </>
    );
  }

  if (!current) return null;

  const paused = pauseStartedAt != null;

  return (
    <>
      <div className="quiz-toolbar">
        <p className="meta">{quiz.title}</p>
        <p className="timer">
          用時 <time>{formatDuration(elapsed)}</time>
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
      {paused ? (
        <section className="panel" role="status">
          <h2>已暫停</h2>
          <p>題目已隱藏，計時已經凍結。按「繼續」回到這題。</p>
          <div className="row-actions">
            <button type="button" className="button" ref={continueRef} onClick={resumeQuiz}>
              繼續
            </button>
          </div>
        </section>
      ) : (
        <>
          <div className="progress-block">
            <label htmlFor="quiz-progress">
              第 {index + 1} / {total} 題
            </label>
            <progress id="quiz-progress" max={total} value={index + 1} />
          </div>
          <Stem stem={current.stem} target={current.target} />
          <form
            method="post"
            action={`/quiz/${quiz.id}`}
            onSubmit={(event) => {
              event.preventDefault();
              submitAnswer();
            }}
          >
            <div className="field">
              <label htmlFor="gloss">「{current.target}」的語譯</label>
              <input
                id="gloss"
                key={index}
                name="gloss"
                type="text"
                lang="zh-Hant"
                value={draft}
                autoFocus
                required
                maxLength={40}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                enterKeyHint="done"
                readOnly={revealed}
                aria-describedby="gloss-hint"
                ref={(node) => {
                  if (node && !node.value.trim()) node.setCustomValidity('請寫出語譯。');
                }}
                onChange={(event) => {
                  const field = event.currentTarget;
                  field.setCustomValidity(field.value.trim() ? '' : '請寫出語譯。');
                  setDraft(field.value);
                }}
              />
              <p id="gloss-hint" className="hint">
                按 Enter 送出。考查的字已在句中加粗並畫線。
              </p>
            </div>
            <div className="row-actions">
              {revealed ? null : (
                <button type="submit" className="button">
                  送出
                </button>
              )}
            </div>
          </form>
          {revealed ? (
            <section className="feedback" aria-live="polite">
              <p>建議答案：{suggestedAnswer(current)}</p>
              <button type="button" className="button" ref={nextButtonRef} onClick={goNext}>
                {index + 1 >= order.length ? '查看成績' : '下一題'}
              </button>
            </section>
          ) : null}
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
        <p id="abort-copy">中止後，這次作答不會寫入排行榜。</p>
        <div className="row-actions">
          <button type="button" className="button secondary" onClick={() => abortDialogRef.current?.close()}>
            返回作答
          </button>
          <button type="button" className="button" onClick={abortAttempt}>
            確定中止
          </button>
        </div>
      </dialog>
    </>
  );
}
