import { useEffect, useState } from 'react';
import { useAuth } from './contexts/AuthContext';
import { Auth } from './components/Auth';
import { ProfessorManager } from './components/ProfessorManager';
import { CourseManager } from './components/CourseManager';
import ReviewForm from './components/ReviewForm';

import { ReviewList } from './components/ReviewList';
import { ProfessorStats } from './components/ProfessorStats';
import { BookOpen, LogOut, MessageSquareText, Users } from 'lucide-react';

function App() {
  const { user, loading, isAdmin, isAdminLoading, signOut } = useAuth();
  const [reviewRefresh, setReviewRefresh] = useState(0);
  const [activeTab, setActiveTab] = useState<'reviews' | 'professors' | 'courses'>('reviews');

  useEffect(() => {
    if (!isAdminLoading && !isAdmin && activeTab !== 'reviews') {
      setActiveTab('reviews');
    }
  }, [activeTab, isAdmin, isAdminLoading]);

  const navigationItems = [
    { id: 'reviews' as const, label: 'レビュー', icon: MessageSquareText },
    ...(isAdmin && !isAdminLoading
      ? [
          { id: 'professors' as const, label: '教授管理', icon: Users },
          { id: 'courses' as const, label: '授業管理', icon: BookOpen },
        ]
      : []),
  ];

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

  return (
    <div className="min-h-screen bg-[var(--page)] text-[var(--text)]">
      <header className="sticky top-0 z-30 border-b border-[var(--divider)] bg-[var(--page)]/95 backdrop-blur-sm lg:hidden">
        <div className="flex h-16 items-center justify-between px-4 sm:px-6">
          <div>
            <h1 className="text-[17px] font-semibold leading-tight tracking-[-0.015em]">ClassScope SMC</h1>
            <p className="mt-0.5 text-[10px] leading-4 text-[var(--muted)]">非公式SMC学生レビュー</p>
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
            <h1 className="text-[15px] font-semibold leading-5 tracking-[-0.015em]">ClassScope SMC</h1>
            <p className="mt-1.5 text-[10px] leading-[1.55] text-[var(--muted)]">※ Santa Monica College 公式サイトではありません</p>
          </div>
          <nav aria-label="メインナビゲーション" className="mt-7 grid gap-0.5">
            {navigationItems.map(({ id, label, icon: Icon }, index) => (
              <div key={id} className={index === 1 ? 'mt-5' : undefined}>
                {index === 1 && <p className="mb-1.5 px-3 text-[10px] font-medium leading-4 text-[var(--muted)]">管理</p>}
              <button onClick={() => setActiveTab(id)} aria-pressed={activeTab === id} className={`relative flex min-h-11 items-center gap-3 rounded-md px-3 text-[14px] leading-5 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] motion-reduce:transition-none ${activeTab === id ? 'font-medium text-white before:absolute before:bottom-2 before:left-0 before:top-2 before:w-0.5 before:bg-[var(--accent)]' : 'font-normal text-[var(--secondary)] hover:bg-white/[0.025] hover:text-white'}`}>
                <Icon size={17} aria-hidden="true" /><span>{label}</span>
              </button>
              </div>
            ))}
          </nav>
          <div className="mt-auto border-t border-[var(--divider)] pt-3">
            <button onClick={signOut} aria-label="ログアウト" className="flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-[13px] font-normal leading-5 text-[var(--secondary)] transition-colors duration-150 hover:bg-white/[0.025] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"><LogOut size={16} aria-hidden="true" />ログアウト</button>
          </div>
        </aside>

        <main className="min-w-0 flex-1 px-4 py-8 sm:px-6 sm:py-11 lg:px-10 lg:py-12 xl:px-12">
        <div className="mx-auto max-w-[1180px]">
        <div className="mb-10 flex flex-col gap-7 sm:mb-12 lg:mb-12">
          <div>
            <h2 className="app-page-title text-white">
              {activeTab === 'reviews' ? 'レビューを書く' : activeTab === 'professors' ? '教授管理' : '授業管理'}
            </h2>
            <p className="app-page-description mt-2.5 text-[var(--secondary)]">
              {activeTab === 'reviews'
                ? '受講した経験を、次に授業を選ぶ学生へ共有します。'
                : activeTab === 'professors'
                  ? 'レビューで使用する教授情報を確認し、新しい教授を登録できます。'
                  : '科目コードと授業名を整理し、レビュー投稿に必要な授業情報を管理します。'}
            </p>
          </div>

          <nav
            aria-label="メインナビゲーション"
            className="flex max-w-full items-center gap-1 overflow-hidden border-b border-[var(--divider)] lg:hidden"
          >
          <button
            onClick={() => setActiveTab('reviews')}
            aria-pressed={activeTab === 'reviews'}
            className={`flex min-h-11 shrink-0 items-center justify-center gap-2 border-b-2 px-3 text-[14px] leading-5 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] motion-reduce:transition-none ${
              activeTab === 'reviews'
                ? 'border-[var(--accent)] font-medium text-white'
                : 'border-transparent text-[var(--muted)] hover:text-white'
            }`}
          >
            <MessageSquareText size={16} aria-hidden="true" />
            <span>レビュー</span>
          </button>
          {isAdmin && !isAdminLoading && <button
            onClick={() => setActiveTab('professors')}
            aria-pressed={activeTab === 'professors'}
            className={`ml-4 flex min-h-11 shrink-0 items-center justify-center gap-2 border-b-2 px-2.5 text-[13px] leading-5 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] motion-reduce:transition-none sm:text-[14px] ${
              activeTab === 'professors'
                ? 'border-[var(--accent)] font-medium text-white'
                : 'border-transparent text-[var(--muted)] hover:text-white'
            }`}
          >
            <Users size={16} aria-hidden="true" />
            <span>教授管理</span>
          </button>}
          {isAdmin && !isAdminLoading && <button
            onClick={() => setActiveTab('courses')}
            aria-pressed={activeTab === 'courses'}
            className={`flex min-h-11 shrink-0 items-center justify-center gap-2 border-b-2 px-3 text-[13px] leading-5 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] motion-reduce:transition-none sm:text-[14px] ${
              activeTab === 'courses'
                ? 'border-[var(--accent)] font-medium text-white'
                : 'border-transparent text-[var(--muted)] hover:text-white'
            }`}
          >
            <BookOpen size={16} aria-hidden="true" />
            <span>授業管理</span>
          </button>}
          </nav>
        </div>

        {activeTab === 'reviews' && (
          <div className="grid items-start gap-11 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.65fr)] xl:gap-12">
            <div>
              <ReviewForm onReviewSubmitted={() => setReviewRefresh(prev => prev + 1)} />
            </div>
            <div className="grid gap-8">
              <ProfessorStats refresh={reviewRefresh} />
              <ReviewList refresh={reviewRefresh} />
            </div>
          </div>
        )}

        {isAdmin && activeTab === 'professors' && <ProfessorManager />}

        {isAdmin && activeTab === 'courses' && <CourseManager />}
        </div>
      </main>
      </div>
    </div>
  );
}

export default App;
