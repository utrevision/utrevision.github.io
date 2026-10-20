import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth.tsx';
import { quizzes } from '../data/quizzes.ts';

export function HomePage() {
  const { user, ready } = useAuth();

  useEffect(() => {
    document.title = '文言溫習小測';
  }, []);

  return (
    <>
      <p className="lede">
        選一套甲部小測。每次開始都會打亂題序並重新計時。送出語譯後即時顯示該題得分，完成後計算命中率。
      </p>
      {!ready ? <p role="status">正在確認登入狀態…</p> : null}
      {ready && !user ? (
        <p className="hint">請先以 Google 帳號登入，才能作答和查看排行榜。可多次作答。</p>
      ) : null}
      <ul className="quiz-list">
        {quizzes.map((quiz) => (
          <li key={quiz.id}>
            <h2>{quiz.title}</h2>
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
        ))}
      </ul>
    </>
  );
}
