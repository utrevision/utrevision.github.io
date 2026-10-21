import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth.tsx';
import { getQuiz } from '../data/quizzes.ts';
import type { QuizId } from '../types.ts';

const HOME_SECTIONS: readonly { level: string; quizId: QuizId }[] = [
  { level: '中四', quizId: 'lianpo' },
  { level: '中五', quizId: '8passages' },
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
      {HOME_SECTIONS.map((section) => {
        const quiz = getQuiz(section.quizId);
        if (!quiz) return null;
        const headingId = `level-${section.quizId}`;
        return (
          <section key={section.quizId} className="level-section" aria-labelledby={headingId}>
            <h2 id={headingId}>{section.level}</h2>
            <ul className="quiz-list">
              <li>
                <h3>{quiz.title}</h3>
                <p className="meta">{quiz.items.length} 題</p>
                <div className="row-actions">
                  <Link className="button" to={`/quiz/${quiz.id}`}>
                    開始作答
                  </Link>
                  <Link className="button secondary" to={`/quiz/${quiz.id}/board`}>
                    排行榜
                  </Link>
                </div>
              </li>
            </ul>
          </section>
        );
      })}
    </>
  );
}
