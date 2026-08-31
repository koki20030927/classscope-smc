import { useEffect, useState } from 'react';
import { useAuth } from './contexts/AuthContext';
import { useSchool } from './contexts/SchoolContext';
import { Auth } from './components/Auth';
import { CollegeSelection } from './components/CollegeSelection';
import { ProfessorManager } from './components/ProfessorManager';
import { CourseManager } from './components/CourseManager';
import ReviewForm from './components/ReviewForm';

import { ReviewList } from './components/ReviewList';
import { ProfessorStats } from './components/ProfessorStats';
import { BarChart3, BookOpen, LogOut, Search, SquarePen, Users } from 'lucide-react';

type ActiveView = 'write' | 'search' | 'stats' | 'professors' | 'courses';

function App() {
  const { user, loading, isAdmin, isAdminLoading, signOut } = useAuth();
  const { currentSchool, clearSchool } = useSchool();
  const [reviewRefresh, setReviewRefresh] = useState(0);
  const [activeView, setActiveView] = useState<ActiveView>('write');

  useEffect(() => {
    const isAdminView = activeView === 'professors' || activeView === 'courses';
    if (!isAdminLoading && !isAdmin && isAdminView) {
      setActiveView('write');
    }
  }, [activeView, isAdmin, isAdminLoading]);

  useEffect(() => {
    setActiveView('write');
  }, [currentSchool?.id]);

  const studentNavigationItems = [
    { id: 'write' as const, label: 'レビューを書く', icon: SquarePen },
    { id: 'search' as const, label: 'レビューを探す', icon: Search },
    { id: 'stats' as const, label: '教授別評価', icon: BarChart3 },
  ];

  const adminNavigationItems = isAdmin && !isAdminLoading
    ? [
        { id: 'professors' as const, label: '教授管理', icon: Users },
        { id: 'courses' as const, label: '授業管理', icon: BookOpen },
      ]
    : [];

  const pageIntro = activeView === 'write'
    ? {
        title: 'レビューを書く',
        description: '受講した経験を、次に授業を選ぶ学生へ共有します。',
      }
    : activeView === 'professors'
      ? {
          title: '教授管理',
          description: 'レビューで使用する教授情報を確認し、新しい教授を登録できます。',
        }
      : activeView === 'courses'
        ? {
            title: '授業管理',
            description: '科目コードと授業名を整理し、レビュー投稿に必要な授業情報を管理します。',
          }
        : null;

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#090b0f]">
        <p className="text-sm text-slate-400">読み込み中...</p>
      </div>
    );
  }

  if (!user) {
    return <Auth />;
  }

  if (!currentSchool) {
    return <CollegeSelection />;
  }

  return (
    <div className="min-h-screen bg-[var(--page)] text-[var(--text)]">
      <header className="sticky top-0 z-30 border-b border-[var(--divider)] bg-[var(--page)]/95 backdrop-blur-sm lg:hidden">
        <div className="flex h-20 items-center justify-between px-4 sm:px-6">
          <div>
            <h1 className="text-[17px] font-semibold leading-tight tracking-[-0.015em]">ClassScope {currentSchool.short_name}</h1>
            <p className="mt-0.5 text-[10px] leading-4 text-[var(--muted)]">非公式{currentSchool.short_name}学生レビュー</p>
            <button onClick={clearSchool} className="mt-1 min-h-7 text-left text-[10px] font-medium text-[var(--accent)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]">大学を切り替える</button>
          </div>
          <button
            onClick={signOut}
            aria-label="ログアウト"
            className="flex min-h-11 items-center gap-2 rounded-lg px-2 text-[13px] font-medium leading-5 text-[var(--secondary)] transition-colors duration-150 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] motion-reduce:transition-none"
          >
            <LogOut size={17} aria-hidden="true" />
            <span className="hidden sm:inline">ログアウト</span>
          </button>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1536px]">
        <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-[var(--divider)] bg-[var(--workspace)] px-3 py-4 lg:flex">
          <div className="px-3 py-2">
            <h1 className="text-[15px] font-semibold leading-5 tracking-[-0.015em]">ClassScope {currentSchool.short_name}</h1>
            <p className="mt-1.5 text-[10px] leading-[1.55] text-[var(--muted)]">※ {currentSchool.name} 公式サイトではありません</p>
            <button onClick={clearSchool} className="mt-3 min-h-9 text-left text-[11px] font-medium text-[var(--accent)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]">大学を切り替える</button>
          </div>
          <nav aria-label="メインナビゲーション" className="mt-7 grid gap-0.5">
            {studentNavigationItems.map(({ id, label, icon: Icon }) => (
              <button key={id} onClick={() => setActiveView(id)} aria-pressed={activeView === id} className={`relative flex min-h-11 items-center gap-3 rounded-md px-3 text-[14px] leading-5 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] motion-reduce:transition-none ${activeView === id ? 'bg-white/[0.035] font-medium text-white before:absolute before:bottom-2 before:left-0 before:top-2 before:w-0.5 before:bg-[var(--accent)]' : 'font-normal text-[var(--secondary)] hover:bg-white/[0.025] hover:text-white'}`}>
                <Icon size={17} aria-hidden="true" />
                <span>{label}</span>
              </button>
            ))}
            {adminNavigationItems.length > 0 && (
              <div className="mt-5 grid gap-0.5 border-t border-[var(--divider)] pt-5">
                {adminNavigationItems.map(({ id, label, icon: Icon }) => (
                  <button key={id} onClick={() => setActiveView(id)} aria-pressed={activeView === id} className={`relative flex min-h-11 items-center gap-3 rounded-md px-3 text-[14px] leading-5 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] motion-reduce:transition-none ${activeView === id ? 'bg-white/[0.035] font-medium text-white before:absolute before:bottom-2 before:left-0 before:top-2 before:w-0.5 before:bg-[var(--accent)]' : 'font-normal text-[var(--secondary)] hover:bg-white/[0.025] hover:text-white'}`}>
                    <Icon size={17} aria-hidden="true" />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            )}
          </nav>
          <div className="mt-auto border-t border-[var(--divider)] pt-3">
            <button onClick={signOut} aria-label="ログアウト" className="flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-[13px] font-normal leading-5 text-[var(--secondary)] transition-colors duration-150 hover:bg-white/[0.025] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"><LogOut size={16} aria-hidden="true" />ログアウト</button>
          </div>
        </aside>

        <main className="min-w-0 flex-1 px-4 py-8 sm:px-6 sm:py-11 lg:px-10 lg:py-12 xl:px-12">
        <div className="mx-auto max-w-[1180px]">
        <div className={`mb-10 flex flex-col gap-7 sm:mb-12 ${pageIntro ? 'lg:mb-12' : 'lg:hidden'}`}>
          {pageIntro && (
            <div>
              <h2 className="app-page-title text-white">{pageIntro.title}</h2>
              <p className="app-page-description mt-2.5 text-[var(--secondary)]">{pageIntro.description}</p>
            </div>
          )}

          <nav aria-label="メインナビゲーション" className="grid gap-3 lg:hidden">
            <div className="grid grid-cols-3 border-b border-[var(--divider)]">
              {studentNavigationItems.map(({ id, label, icon: Icon }) => (
                <button key={id} onClick={() => setActiveView(id)} aria-pressed={activeView === id} className={`flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 border-b-2 px-1.5 py-2 text-[11px] leading-4 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] motion-reduce:transition-none sm:min-h-11 sm:flex-row sm:gap-2 sm:px-3 sm:text-[13px] ${activeView === id ? 'border-[var(--accent)] bg-[var(--accent-soft)] font-medium text-white' : 'border-transparent text-[var(--muted)] hover:text-white'}`}>
                  <Icon className="shrink-0" size={16} aria-hidden="true" />
                  <span className="whitespace-nowrap">{label}</span>
                </button>
              ))}
            </div>
            {adminNavigationItems.length > 0 && (
              <div className="grid grid-cols-2 border-t border-[var(--divider)] pt-3">
                {adminNavigationItems.map(({ id, label, icon: Icon }) => (
                  <button key={id} onClick={() => setActiveView(id)} aria-pressed={activeView === id} className={`flex min-h-11 min-w-0 items-center justify-center gap-2 border-b-2 px-2 text-[12px] leading-4 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] motion-reduce:transition-none sm:text-[13px] ${activeView === id ? 'border-[var(--accent)] bg-white/[0.035] font-medium text-white' : 'border-transparent text-[var(--muted)] hover:text-white'}`}>
                    <Icon className="shrink-0" size={16} aria-hidden="true" />
                    <span className="whitespace-nowrap">{label}</span>
                  </button>
                ))}
              </div>
            )}
          </nav>
        </div>

        {activeView === 'write' && (
          <div className="max-w-3xl">
            <ReviewForm key={currentSchool.id} onReviewSubmitted={() => setReviewRefresh(prev => prev + 1)} />
          </div>
        )}

        {activeView === 'search' && <div className="max-w-4xl"><ReviewList refresh={reviewRefresh} /></div>}

        {activeView === 'stats' && <div className="max-w-4xl"><ProfessorStats refresh={reviewRefresh} /></div>}

        {isAdmin && activeView === 'professors' && <ProfessorManager />}

        {isAdmin && activeView === 'courses' && <CourseManager />}
        </div>
      </main>
      </div>
    </div>
  );
}

export default App;
