import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth.tsx';
import { getLongQuiz } from '../data/longQuizzes.ts';
import { getQuiz } from '../data/quizzes.ts';

const levels: readonly { level: string; ids: readonly string[] }[] = [
  { level: '中四', ids: ['lianpo', 'lianpo-longq-2'] },
  { level: '中五', ids: ['8passages', 'eight-longq-1'] },
];

export function HomePage() {
  const { user, ready } = useAuth();

  useEffect(() => {
    document.title = '文言溫習小測';
  }, []);

  return (
    <>
      {!ready ? <p role="status">正在確認登入狀態…</p> : null}
      {ready && !user ? (
        <p className="hint">請先以 Google 帳號登入，才能作答和查看排行榜。</p>
      ) : null}
      {levels.map((section) => (
        <section key={section.level} className="year-group" aria-labelledby={`year-${section.level}`}>
          <h2 id={`year-${section.level}`} className="year-heading">
            {section.level}
          </h2>
          <ul className="quiz-list">
            {section.ids.map((id) => {
              const gloss = getQuiz(id);
              const paper = getLongQuiz(id);
              if (!gloss && !paper) return null;
              const title = gloss?.title ?? paper?.title ?? '';
              const quizId = gloss?.id ?? paper?.id ?? id;
              const meta = gloss ? `${gloss.items.length} 題` : `長答 · ${paper?.totalMax ?? 0} 分`;
              const isNew = quizId === 'eight-longq-1';
              return (
                <li key={quizId} className={isNew ? 'quiz-card is-new' : 'quiz-card'}>
                  {isNew ? <span className="new-mark">新</span> : null}
                  <h3>{title}</h3>
                  <p className="meta">{meta}</p>
                  <div className="row-actions">
                    <Link className="button" to={`/quiz/${quizId}`}>
                      開始作答
                    </Link>
                    <Link className="button secondary" to={`/quiz/${quizId}/board`}>
                      排行榜
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </>
  );
}
