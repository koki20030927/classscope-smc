import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

export function Auth() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn, signUp } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isSignUp) {
        await signUp(email, password);
        alert('アカウントが作成されました');
      } else {
        await signIn(email, password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '認証エラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen overflow-x-hidden overflow-y-auto bg-[var(--page)] px-4 py-6 text-[var(--text)] sm:px-6 sm:py-10 lg:flex lg:items-center">
      <div className="mx-auto grid w-full max-w-7xl gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-center lg:gap-16">
        <section className="px-1 sm:px-6 lg:px-10">
          <div className="max-w-2xl">
            <p className="text-sm font-medium text-[var(--secondary)]">ClassScope SMC</p>
            <h1 className="mt-5 max-w-2xl text-[2.35rem] font-semibold leading-[1.12] tracking-[-0.04em] text-white sm:text-5xl lg:mt-7 lg:text-[3.5rem] xl:text-6xl">
              <span className="block">学生のリアルな声から</span>
              <span className="block text-[var(--accent)]">授業選びを明確に</span>
            </h1>
            <p className="mt-5 max-w-xl text-[15px] leading-7 text-[var(--secondary)] sm:text-base sm:leading-8 lg:mt-7">
              <span className="block">教授、授業、課題量、難易度を学生同士で共有し</span>
              <span className="block">次の学期に向けた判断材料を見つけられるレビューサービスです。</span>
            </p>
          </div>

          <p className="mt-6 text-xs leading-5 text-[var(--muted)] lg:mt-8">
            ※ Santa Monica College 公式サイトではありません
          </p>
        </section>

        <section className="flex items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--workspace)] px-5 py-8 shadow-[0_16px_50px_rgba(0,0,0,0.22)] sm:px-10 sm:py-12 lg:px-12">
          <div className="w-full max-w-[460px]">
            <div className="mb-8">
              <p className="text-sm font-medium text-[var(--accent)]">
                {isSignUp ? 'はじめましょう' : 'おかえりなさい'}
              </p>
              <h2 className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-white">
                {isSignUp ? 'ClassScopeアカウントを作成' : 'ClassScopeへログイン'}
              </h2>
              <p className="mt-3 text-sm leading-6 text-[var(--secondary)]">
                {isSignUp
                  ? '学生の声を共有するためのアカウントを作成します。'
                  : '登録済みのメールアドレスで続けてください。'}
              </p>
            </div>

            <div
              className="mb-8 grid grid-cols-2 rounded-xl border border-[var(--border)] bg-black/20 p-1"
              aria-label="認証方法を選択"
            >
              <button
                type="button"
                onClick={() => setIsSignUp(false)}
                aria-pressed={!isSignUp}
                className={`min-h-11 rounded-lg border px-4 text-sm font-medium transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] motion-reduce:transition-none ${
                  !isSignUp
                    ? 'border-[var(--accent)]/25 bg-[var(--accent-soft)] text-[var(--accent)]'
                    : 'border-transparent text-[var(--muted)] hover:text-white'
                }`}
              >
                ログイン
              </button>
              <button
                type="button"
                onClick={() => setIsSignUp(true)}
                aria-pressed={isSignUp}
                className={`min-h-11 rounded-lg border px-4 text-sm font-medium transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] motion-reduce:transition-none ${
                  isSignUp
                    ? 'border-[var(--accent)]/25 bg-[var(--accent-soft)] text-[var(--accent)]'
                    : 'border-transparent text-[var(--muted)] hover:text-white'
                }`}
              >
                新規登録
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5" aria-busy={loading}>
              <div>
                <label htmlFor="email" className="mb-2 block text-sm font-medium text-[var(--text)]">
                  メールアドレス
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                  className="auth-input h-[52px] w-full rounded-xl border border-[var(--border)] bg-[var(--elevated)] px-4 text-base text-[var(--text)] outline-none transition duration-200 placeholder:text-[var(--muted)] hover:border-slate-500 focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-soft)] motion-reduce:transition-none"
                />
              </div>

              <div>
                <label htmlFor="password" className="mb-2 block text-sm font-medium text-[var(--text)]">
                  パスワード
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={isSignUp ? 'new-password' : 'current-password'}
                  required
                  minLength={6}
                  className="auth-input h-[52px] w-full rounded-xl border border-[var(--border)] bg-[var(--elevated)] px-4 text-base text-[var(--text)] outline-none transition duration-200 placeholder:text-[var(--muted)] hover:border-slate-500 focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-soft)] motion-reduce:transition-none"
                />
              </div>

              {error && (
                <div
                  role="alert"
                  className="min-h-[48px] rounded-xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm leading-5 text-rose-300"
                >
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="h-[52px] w-full rounded-xl bg-[var(--accent)] px-4 text-base font-semibold text-slate-950 transition duration-200 hover:bg-[var(--accent-hover)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--accent-soft)] active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-500 motion-reduce:transform-none motion-reduce:transition-none"
              >
                {loading ? '処理中...' : isSignUp ? '新規登録' : 'ログイン'}
              </button>
            </form>

            <p className="mt-7 text-center text-xs leading-5 text-[var(--muted)]">
              授業選びに役立つ、率直で思いやりのある情報共有をお願いします。
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
