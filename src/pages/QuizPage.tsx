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
import { fullCreditAnswers, halfCreditAnswers } from '../grading/grade.ts';
import { resolveGrades, type GradeResolution } from '../grading/resolveGrade.ts';
import { elapsedMs } from '../lib/elapsed.ts';
import { formatDuration, formatHitRate } from '../lib/format.ts';
import { shuffle } from '../lib/shuffle.ts';
import type { QuizItem, Score } from '../types.ts';

function noteFor(resolution: GradeResolution | undefined): 'synonym' | 'unavailable' | null {
  if (!resolution) return 'unavailable';
  if (resolution.source === 'ai-unavailable') return 'unavailable';
  if (resolution.source === 'ai' && resolution.score === 1) return 'synonym';
  return null;
}

type Phase = 'ready' | 'question' | 'result';

export function QuizPage() {
  const { quizId } = useParams();
  const quiz = getQuiz(quizId);
  const { user, ready } = useAuth();
  const [phase, setPhase] = useState<Phase>('ready');
  const [order, setOrder] = useState<QuizItem[]>([]);
  const [index, setIndex] = useState(0);
  const [draft, setDraft] = useState('');
  const [submitted, setSubmitted] = useState<Score | null>(null);
  const [judging, setJudging] = useState(false);
  const [aiNote, setAiNote] = useState<'synonym' | 'unavailable' | null>(null);
  const [earned, setEarned] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [stoppedAt, setStoppedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [boardKey, setBoardKey] = useState(0);
  const [pausedAccumMs, setPausedAccumMs] = useState(0);
  const [pauseStartedAt, setPauseStartedAt] = useState<number | null>(null);
  const [abortOpen, setAbortOpen] = useState(false);
  const attemptGen = useRef(0);
  const gradingLock = useRef(false);
  const gradeAbort = useRef<AbortController | null>(null);
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
    if (submitted === null) return;
    nextButtonRef.current?.focus();
  }, [submitted, index]);

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
    attemptGen.current += 1;
    setOrder(shuffle(quiz!.items));
    setIndex(0);
    setDraft('');
    setSubmitted(null);
    setJudging(false);
    setAiNote(null);
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

  async function submitAnswer() {
    if (!current || submitted !== null || gradingLock.current) return;
    const gen = attemptGen.current;
    const item = current;
    const raw = draft;
    gradingLock.current = true;
    gradeAbort.current?.abort();
    const controller = new AbortController();
    gradeAbort.current = controller;
    setJudging(true);
    setAiNote(null);
    try {
      const [resolution] = await resolveGrades([{ item, raw }], firebaseAiJudge, {
        concurrency: AI_GRADE_CONCURRENCY,
        timeoutMs: AI_GRADE_TIMEOUT_MS,
        signal: controller.signal,
      });
      if (attemptGen.current !== gen || controller.signal.aborted) return;
      const score = resolution?.score ?? 0;
      setSubmitted(score);
      setEarned((value) => value + score);
      setAiNote(noteFor(resolution));
    } finally {
      if (attemptGen.current === gen) {
        gradingLock.current = false;
        setJudging(false);
      }
    }
  }

  async function publish(score: number, durationMs: number) {
    if (!user) return;
    const gen = attemptGen.current;
    setSaveState('saving');
    setSaveError(null);
    try {
      await saveAttempt({
        uid: user.uid,
        displayName: user.displayName,
        quizId: quiz!.id,
        score,
        total,
        durationMs,
      });
      if (attemptGen.current !== gen) return;
      setSaveState('saved');
      setBoardKey((value) => value + 1);
    } catch (caught) {
      if (attemptGen.current !== gen) return;
      setSaveState('error');
      setSaveError(firestoreErrorMessage(caught));
    }
  }

  function goNext() {
    if (submitted === null || startedAt == null) return;
    if (index + 1 >= order.length) {
      const durationMs = elapsedMs({
        startedAt,
        stoppedAt: null,
        now,
        pausedAccumMs,
        pauseStartedAt,
      });
      setStoppedAt(now);
      setPhase('result');
      void publish(earned, durationMs);
      return;
    }
    setIndex((value) => value + 1);
    setDraft('');
    setSubmitted(null);
    setAiNote(null);
  }

  function pauseQuiz() {
    if (pauseStartedAt != null || judging) return;
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
    attemptGen.current += 1;
    setAbortOpen(false);
    setPhase('ready');
    setOrder([]);
    setIndex(0);
    setDraft('');
    setSubmitted(null);
    setJudging(false);
    setAiNote(null);
    setEarned(0);
    setStartedAt(null);
    setStoppedAt(null);
    setPausedAccumMs(0);
    setPauseStartedAt(null);
    setSaveState('idle');
    setSaveError(null);
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
          共 {total} 題；題序隨機、計時作答，以 AI 智能評分。途中可暫停或中止；中止不入排行榜。
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
  const standards = fullCreditAnswers(current);
  const halves = halfCreditAnswers(current);

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
          <button type="button" className="button secondary" onClick={pauseQuiz} disabled={judging}>
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
            aria-busy={judging}
            onSubmit={(event) => {
              event.preventDefault();
              void submitAnswer();
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
                readOnly={submitted !== null || judging}
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
            <div className="row-actions" aria-live="polite">
              {submitted === null ? (
                <button type="submit" className="button" disabled={judging}>
                  {judging ? '正在智能判分…' : '送出'}
                </button>
              ) : null}
            </div>
          </form>
          {submitted !== null ? (
            <section className="feedback" aria-live="polite">
              <p className={`score score-${submitted === 0.5 ? 'half' : submitted}`}>
                <strong>{submitted} 分</strong>
                <span>{submitted === 1 ? '正確' : submitted === 0.5 ? '部分正確' : '不正確'}</span>
              </p>
              <p>標準語譯：{standards.join('、')}</p>
              {halves.length > 0 ? <p className="hint">半分亦可：{halves.join('、')}</p> : null}
              {aiNote === 'synonym' ? <p className="hint">未列入標準答案，智能判分為同義。</p> : null}
              {aiNote === 'unavailable' ? (
                <p role="status" className="hint">
                  智能判分暫時不可用，此題先計 0 分。
                </p>
              ) : null}
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
        <p id="abort-copy">中止後，本次得分不會寫入排行榜。</p>
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
