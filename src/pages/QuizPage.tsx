import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { firestoreErrorMessage, saveAttempt } from '../attempts.ts';
import { useAuth } from '../auth.tsx';
import { Leaderboard } from '../components/Leaderboard.tsx';
import { SignInPrompt } from '../components/SignInPrompt.tsx';
import { Stem } from '../components/Stem.tsx';
import { getQuiz } from '../data/quizzes.ts';
import { fullCreditAnswers, gradeItem, halfCreditAnswers } from '../grading/grade.ts';
import { formatDuration, formatHitRate } from '../lib/format.ts';
import { shuffle } from '../lib/shuffle.ts';
import type { QuizItem, Score } from '../types.ts';

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
  const [earned, setEarned] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [stoppedAt, setStoppedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [boardKey, setBoardKey] = useState(0);
  const attemptGen = useRef(0);
  const nextButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    document.title = quiz ? `${quiz.title}｜文言溫習小測` : '文言溫習小測';
  }, [quiz]);

  useEffect(() => {
    if (startedAt == null || stoppedAt != null) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [startedAt, stoppedAt]);

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
  const elapsed = startedAt == null ? 0 : (stoppedAt ?? now) - startedAt;

  function begin() {
    attemptGen.current += 1;
    setOrder(shuffle(quiz!.items));
    setIndex(0);
    setDraft('');
    setSubmitted(null);
    setEarned(0);
    setStartedAt(Date.now());
    setStoppedAt(null);
    setNow(Date.now());
    setSaveState('idle');
    setSaveError(null);
    setPhase('question');
  }

  function submitAnswer() {
    if (!current || submitted !== null) return;
    const score = gradeItem(current, draft);
    setSubmitted(score);
    setEarned((value) => value + score);
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
      const durationMs = Date.now() - startedAt;
      setStoppedAt(Date.now());
      setPhase('result');
      void publish(earned, durationMs);
      return;
    }
    setIndex((value) => value + 1);
    setDraft('');
    setSubmitted(null);
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
          共 {total} 題。開始後會計時，題目順序隨機。批改先看詞義：詞義錯誤為 0 分；0.5 分只限教師預先列出的答案。
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
        <p className="meta">
          <Link to="/">首頁</Link>
        </p>
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

  return (
    <>
      <div className="quiz-toolbar">
        <p className="meta">{quiz.title}</p>
        <p className="timer">
          用時 <time>{formatDuration(elapsed)}</time>
        </p>
      </div>
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
            readOnly={submitted !== null}
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
        {submitted === null ? (
          <button type="submit" className="button">
            送出
          </button>
        ) : null}
      </form>
      {submitted !== null ? (
        <section className="feedback" aria-live="polite">
          <p className={`score score-${submitted === 0.5 ? 'half' : submitted}`}>
            <strong>{submitted} 分</strong>
            <span>{submitted === 1 ? '正確' : submitted === 0.5 ? '部分正確' : '不正確'}</span>
          </p>
          <p>
            標準語譯：{standards.join('、')}
          </p>
          {halves.length > 0 ? <p className="hint">半分亦可：{halves.join('、')}</p> : null}
          <button type="button" className="button" ref={nextButtonRef} onClick={goNext}>
            {index + 1 >= order.length ? '查看成績' : '下一題'}
          </button>
        </section>
      ) : null}
    </>
  );
}
