import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { auth } from './firebase.ts';

type AuthValue = {
  user: User | null;
  ready: boolean;
  busy: boolean;
  error: string | null;
  errorCode: string | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

function errorCodeOf(error: unknown): string {
  if (typeof error === 'object' && error && 'code' in error) {
    return String((error as { code: unknown }).code);
  }
  return '';
}

export function authErrorMessage(code: string): string {
  switch (code) {
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return '已取消登入。';
    case 'auth/popup-blocked':
      return '瀏覽器封鎖了登入視窗，請允許彈出式視窗後再試。';
    case 'auth/unauthorized-domain':
      return '此網域尚未加入 Firebase 授權網域。請到 Authentication → Settings → Authorized domains，加入 utrevision.github.io。';
    case 'auth/operation-not-allowed':
      return 'Google 登入尚未在 Firebase Console 啟用。';
    case 'auth/network-request-failed':
      return '網絡連線失敗，請稍後再試。';
    default:
      return '登入失敗，請再試一次。';
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  useEffect(() => {
    return onAuthStateChanged(auth, (next) => {
      setUser(next);
      setReady(true);
    });
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      user,
      ready,
      busy,
      error,
      errorCode,
      async signIn() {
        setBusy(true);
        setError(null);
        setErrorCode(null);
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        try {
          await signInWithPopup(auth, provider);
        } catch (caught) {
          const code = errorCodeOf(caught);
          if (code === 'auth/popup-blocked') {
            try {
              await signInWithRedirect(auth, provider);
              return;
            } catch (redirectError) {
              const redirectCode = errorCodeOf(redirectError);
              setErrorCode(redirectCode);
              setError(authErrorMessage(redirectCode));
            }
          } else {
            setErrorCode(code);
            setError(authErrorMessage(code));
          }
        } finally {
          setBusy(false);
        }
      },
      async signOut() {
        setError(null);
        setErrorCode(null);
        await firebaseSignOut(auth);
      },
    }),
    [user, ready, busy, error, errorCode],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used within AuthProvider');
  return value;
}
