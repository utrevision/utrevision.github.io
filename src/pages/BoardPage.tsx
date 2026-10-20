import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Leaderboard } from '../components/Leaderboard.tsx';
import { SignInPrompt } from '../components/SignInPrompt.tsx';
import { useAuth } from '../auth.tsx';
import { getQuiz } from '../data/quizzes.ts';

export function BoardPage() {
  const { quizId } = useParams();
  const quiz = getQuiz(quizId);
  const { user, ready } = useAuth();

  useEffect(() => {
    document.title = quiz ? `${quiz.title}排行榜｜文言溫習小測` : '文言溫習小測';
  }, [quiz]);

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

  return (
    <>
      <p className="meta">
        <Link to="/">首頁</Link>
        {' · '}
        <Link to={`/quiz/${quiz.id}`}>開始作答</Link>
      </p>
      <h2 className="page-title">{quiz.title}</h2>
      {!ready ? <p role="status">正在確認登入狀態…</p> : null}
      {ready && !user ? <SignInPrompt reason="請先以 Google 帳號登入，才能查看排行榜。" /> : null}
      {ready && user ? <Leaderboard quizId={quiz.id} /> : null}
    </>
  );
}
