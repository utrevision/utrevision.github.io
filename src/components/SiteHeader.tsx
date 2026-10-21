import { Link } from 'react-router-dom';
import { useAuth } from '../auth.tsx';
import { AUTHORIZED_DOMAINS_URL, GOOGLE_PROVIDER_URL } from '../firebase.ts';

export function SiteHeader() {
  const { user, ready, busy, error, errorCode, signIn, signOut } = useAuth();
  return (
    <header className="site-header">
      <div>
        <p className="eyebrow">字詞語譯</p>
        <h1>
          <Link to="/">文言溫習小測</Link>
        </h1>
      </div>
      <div className="auth-slot">
        {!ready ? <p role="status">正在確認登入狀態…</p> : null}
        {ready && user ? (
          <>
            <p className="who">{user.displayName || '未命名'}</p>
            <div className="row-actions">
              <Link className="button secondary" to="/">
                首頁
              </Link>
              <button type="button" className="button secondary" onClick={() => void signOut()}>
                登出
              </button>
            </div>
          </>
        ) : null}
        {ready && !user ? (
          <button type="button" className="button" onClick={() => void signIn()} disabled={busy}>
            {busy ? '正在開啟 Google 登入…' : '以 Google 帳號登入'}
          </button>
        ) : null}
        {error ? (
          <p role="alert" className="alert">
            {error}
            {errorCode === 'auth/operation-not-allowed' ? (
              <>
                {' '}
                <a href={GOOGLE_PROVIDER_URL}>開啟 Google 供應商</a>
              </>
            ) : null}
            {errorCode === 'auth/unauthorized-domain' || errorCode === 'auth/configuration-not-found' ? (
              <>
                {' '}
                <a href={AUTHORIZED_DOMAINS_URL}>開啟授權網域設定</a>
              </>
            ) : null}
          </p>
        ) : null}
      </div>
    </header>
  );
}
