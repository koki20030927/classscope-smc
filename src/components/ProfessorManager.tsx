import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Professor } from '../lib/types';
import { Plus, Search, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

function getProfessorErrorMessage(error: { code?: string; message?: string }) {
  const message = error.message?.toLowerCase() ?? '';
  if (error.code === '42501' || message.includes('row-level security') || message.includes('permission')) {
    return 'この操作を実行する権限がありません。';
  }
  if (error.code === '23505') return '同じ教授がすでに登録されています。';
  if (error.code === '23502' || error.code === '23514' || error.code === '22001') {
    return '入力内容を確認してください。';
  }
  if (message.includes('fetch') || message.includes('network')) {
    return '通信に失敗しました。接続を確認してもう一度お試しください。';
  }
  return '処理を完了できませんでした。もう一度お試しください。';
}

export function ProfessorManager() {
  const { isAdmin, isAdminLoading } = useAuth();
  const [professors, setProfessors] = useState<Professor[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [newProfessorName, setNewProfessorName] = useState('');
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isAdmin) {
      void loadProfessors();
    }
  }, [isAdmin]);

  const loadProfessors = async () => {
    setErrorMessage(null);
    const { data, error } = await supabase
      .from('professors')
      .select('*')
      .order('name');

    if (!error && data) {
      setProfessors(data);
    } else if (error) {
      setErrorMessage(getProfessorErrorMessage(error));
    }
  };

  const handleAddProfessor = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage(null);

    const { error } = await supabase
      .from('professors')
      .insert({ name: newProfessorName });

    if (!error) {
      setNewProfessorName('');
      setShowForm(false);
      loadProfessors();
    } else {
      setErrorMessage(getProfessorErrorMessage(error));
    }
    setLoading(false);
  };

  const filteredProfessors = professors.filter((professor) =>
    professor.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (isAdminLoading) {
    return <p className="py-10 text-sm text-[var(--secondary)]">権限を確認しています...</p>;
  }

  if (!isAdmin) {
    return <p role="alert" className="border-y border-[var(--divider)] py-10 text-sm text-[var(--danger)]">この画面を表示する権限がありません。</p>;
  }

  return (
    <div>
      <section className="border-y border-[var(--divider)] py-6 sm:py-7">
        {errorMessage && <p role="alert" className="mb-5 rounded-lg border border-rose-400/20 bg-rose-400/[0.06] px-4 py-3 text-sm text-[var(--danger)]">{errorMessage}</p>}
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div><h2 className="text-lg font-medium text-white">教授ディレクトリ</h2><p className="mt-1 text-sm text-[var(--secondary)]">レビューで使用する教授情報を名前順に表示します。</p></div>
          <button onClick={() => setShowForm(!showForm)} aria-expanded={showForm} className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[var(--border)] px-4 text-sm font-medium text-[var(--text)] transition-colors duration-150 hover:bg-white/[0.035] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] motion-reduce:transition-none">
            {showForm ? <X size={17} aria-hidden="true" /> : <Plus size={17} aria-hidden="true" />}{showForm ? 'キャンセル' : '教授を追加'}
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleAddProfessor} className="mt-6 flex flex-col gap-3 border-t border-[var(--divider)] pt-6 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1"><label className="mb-2 block text-sm font-medium text-[var(--text)]">教授名</label><input type="text" value={newProfessorName} onChange={(e) => setNewProfessorName(e.target.value)} placeholder="教授名を入力" required className="h-[50px] w-full rounded-lg border border-[var(--border)] bg-[var(--elevated)] px-4 text-base text-[var(--text)] outline-none transition-colors duration-150 placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--focus)] motion-reduce:transition-none" /></div>
            <button type="submit" disabled={loading} className="h-[50px] rounded-lg bg-[var(--accent)] px-6 text-sm font-semibold text-slate-950 transition-colors duration-150 hover:bg-[var(--accent-hover)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--focus)] disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-500 motion-reduce:transition-none">{loading ? '追加中...' : '追加'}</button>
          </form>
        )}

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1"><Search size={17} aria-hidden="true" className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--muted)]" /><input type="search" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="教授名を検索" className="h-[50px] w-full rounded-lg border border-[var(--border)] bg-[var(--elevated)] pl-10 pr-4 text-base text-[var(--text)] outline-none transition-colors duration-150 placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--focus)] motion-reduce:transition-none" /></div>
          <p className="shrink-0 text-xs tabular-nums text-[var(--muted)]">{searchQuery ? `${filteredProfessors.length} / ${professors.length}名` : `${professors.length}名`}</p>
        </div>
      </section>

      <section aria-label="教授一覧" className="divide-y divide-[var(--divider)]">
        {filteredProfessors.map((professor) => <div key={professor.id} className="flex min-h-14 items-center px-1 py-3 text-sm text-[var(--text)] transition-colors duration-150 hover:bg-white/[0.02] motion-reduce:transition-none">{professor.name}</div>)}
        {professors.length === 0 && <p className="py-12 text-center text-sm text-[var(--secondary)]">教授が登録されていません</p>}
        {professors.length > 0 && filteredProfessors.length === 0 && <p className="py-12 text-center text-sm text-[var(--secondary)]">検索結果が見つかりませんでした</p>}
      </section>
    </div>
  );
}
