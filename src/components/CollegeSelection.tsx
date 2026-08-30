import { LogOut } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useSchool } from '../contexts/SchoolContext';

export function CollegeSelection() {
  const { signOut } = useAuth();
  const { schools, loading, error, selectSchool, reloadSchools } = useSchool();

  return (
    <main className="min-h-screen bg-[var(--page)] px-4 py-10 text-[var(--text)] sm:px-6 sm:py-16">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-start justify-between gap-6 border-b border-[var(--divider)] pb-8">
          <div>
            <p className="text-sm font-medium text-[var(--accent)]">ClassScope</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-white sm:text-4xl">Select Your College</h1>
            <p className="mt-3 text-sm leading-6 text-[var(--secondary)]">表示する大学を選択してください。</p>
          </div>
          <button onClick={signOut} className="flex min-h-11 shrink-0 items-center gap-2 rounded-lg px-3 text-sm text-[var(--secondary)] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]">
            <LogOut size={17} aria-hidden="true" />
            <span className="hidden sm:inline">ログアウト</span>
          </button>
        </div>

        {loading && <p className="py-12 text-sm text-[var(--secondary)]" aria-live="polite">大学一覧を読み込んでいます...</p>}
        {error && (
          <div className="py-10">
            <p role="alert" className="text-sm text-[var(--danger)]">{error}</p>
            <button onClick={() => void reloadSchools()} className="mt-4 min-h-11 rounded-lg border border-[var(--border)] px-4 text-sm text-white">再試行</button>
          </div>
        )}
        {!loading && !error && (
          <div className="grid gap-3 py-8 sm:grid-cols-2">
            {schools.map((school) => (
              <button
                key={school.id}
                type="button"
                disabled={!school.is_active}
                onClick={() => selectSchool(school)}
                className="min-h-28 rounded-xl border border-[var(--border)] bg-[var(--workspace)] p-5 text-left transition-colors hover:border-slate-500 hover:bg-white/[0.025] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-55"
              >
                <span className="block text-lg font-semibold text-white">{school.name}</span>
                <span className="mt-2 block text-sm text-[var(--secondary)]">{school.short_name}</span>
                {!school.is_active && <span className="mt-3 block text-xs font-medium text-[var(--muted)]">Coming Soon</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
