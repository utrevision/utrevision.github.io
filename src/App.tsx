import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth.tsx';
import { SiteHeader } from './components/SiteHeader.tsx';
import { BoardPage } from './pages/BoardPage.tsx';
import { HomePage } from './pages/HomePage.tsx';
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

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <div className="app">
          <SiteHeader />
          <main>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/quiz/:quizId" element={<QuizPage />} />
              <Route path="/quiz/:quizId/board" element={<BoardPage />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </main>
        </div>
      </BrowserRouter>
    </AuthProvider>
  );
}
