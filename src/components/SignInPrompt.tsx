import { useAuth } from '../auth.tsx';

export function SignInPrompt({ reason }: { reason: string }) {
  const { signIn, busy } = useAuth();
  return (
    <section className="panel">
      <p>{reason}</p>
      <button type="button" className="button" onClick={() => void signIn()} disabled={busy}>
        {busy ? '正在開啟 Google 登入…' : '以 Google 帳號登入'}
      </button>
    </section>
  );
}
