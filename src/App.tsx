import { BrowserRouter, Route, Routes, useParams } from 'react-router-dom';
import { AuthProvider } from './auth.tsx';
import { SiteHeader } from './components/SiteHeader.tsx';
import { getLongQuiz } from './data/longQuizzes.ts';
import { BoardPage } from './pages/BoardPage.tsx';
import { HomePage } from './pages/HomePage.tsx';
import { LongQuizPage } from './pages/LongQuizPage.tsx';
import { QuizPage } from './pages/QuizPage.tsx';

function NotFound() {
  return (
    <section className="panel">
      <h2>找不到頁面</h2>
      <a className="button secondary" href="/">
        返回首頁
      </a>
    </section>
  );
}

function QuizRoute() {
  const { quizId } = useParams();
  const paper = getLongQuiz(quizId);
  if (paper) return <LongQuizPage paper={paper} />;
  return <QuizPage />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <div className="app">
          <SiteHeader />
          <main>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/quiz/:quizId" element={<QuizRoute />} />
              <Route path="/quiz/:quizId/board" element={<BoardPage />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </main>
        </div>
      </BrowserRouter>
    </AuthProvider>
  );
}
