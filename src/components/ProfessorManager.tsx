import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Professor } from '../lib/types';
import { Plus, Search, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useSchool } from '../contexts/SchoolContext';
import { fetchAllPages } from '../lib/fetchAllPages';

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
  const { currentSchool } = useSchool();
  const [professors, setProfessors] = useState<Professor[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [newProfessorName, setNewProfessorName] = useState('');
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const currentSchoolId = currentSchool?.id;

  useEffect(() => {
    if (!isAdmin || !currentSchoolId) return;

    let cancelled = false;
    const schoolId = currentSchoolId;

    const loadProfessors = async () => {
      setListLoading(true);
      setErrorMessage(null);
      const { data, error } = await fetchAllPages<Professor, { code?: string; message?: string }>(
        async (from, to) => supabase
          .from('professors')
          .select('*')
          .eq('school_id', schoolId)
          .order('name')
          .order('id')
          .range(from, to),
      );

      if (cancelled) return;
      if (!error && data) {
        setProfessors(data);
      } else if (error) {
        setErrorMessage(getProfessorErrorMessage(error));
      }
      setListLoading(false);
    };

    void loadProfessors();
    return () => {
      cancelled = true;
    };
  }, [isAdmin, currentSchoolId, reloadKey]);

  const handleAddProfessor = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage(null);

    const { error } = await supabase
      .from('professors')
      .insert({ school_id: currentSchool!.id, name: newProfessorName });

    if (!error) {
      setNewProfessorName('');
      setShowForm(false);
      setReloadKey((current) => current + 1);
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
      <section className="border-b border-[var(--divider)] pb-8 pt-2 sm:pb-9 sm:pt-3">
        {errorMessage && <p role="alert" className="mb-5 rounded-lg border border-rose-400/20 bg-rose-400/[0.06] px-4 py-3 text-sm text-[var(--danger)]">{errorMessage}</p>}
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div><h2 className="app-section-title text-white">教授ディレクトリ</h2><p className="app-section-description mt-1.5 text-[var(--secondary)]">教授情報を名前順に表示</p></div>
          <button onClick={() => setShowForm(!showForm)} aria-expanded={showForm} className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[var(--border)] px-4 text-[14px] font-medium leading-5 text-[var(--text)] transition-colors duration-150 hover:bg-white/[0.035] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] motion-reduce:transition-none">
            {showForm ? <X size={17} aria-hidden="true" /> : <Plus size={17} aria-hidden="true" />}{showForm ? 'キャンセル' : '教授を追加'}
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleAddProfessor} className="mt-7 flex flex-col gap-4 border-t border-[var(--divider)] pt-7 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1"><label htmlFor="new-professor-name" className="app-field-label mb-2.5 block text-[var(--text)]">教授名</label><input id="new-professor-name" type="text" value={newProfessorName} onChange={(e) => setNewProfessorName(e.target.value)} placeholder="教授名を入力" required className="h-[50px] w-full rounded-lg border border-[var(--border)] bg-[var(--elevated)] px-4 text-[15px] leading-6 text-[var(--text)] outline-none transition-colors duration-150 placeholder:text-[14px] placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--focus)] motion-reduce:transition-none" /></div>
            <button type="submit" disabled={loading} className="h-[50px] rounded-lg bg-[var(--accent)] px-6 text-[14px] font-semibold leading-5 text-slate-950 transition-colors duration-150 hover:bg-[var(--accent-hover)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--focus)] disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-500 motion-reduce:transition-none">{loading ? '追加中...' : '追加'}</button>
          </form>
        )}

        <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1"><Search size={17} aria-hidden="true" className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--muted)]" /><input type="search" aria-label="教授名を検索" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="教授名を検索" className="h-[50px] w-full rounded-lg border border-[var(--border)] bg-[var(--elevated)] pl-10 pr-4 text-[15px] leading-6 text-[var(--text)] outline-none transition-colors duration-150 placeholder:text-[14px] placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--focus)] motion-reduce:transition-none" /></div>
          <p className="app-metadata shrink-0 tabular-nums text-[var(--muted)]">{searchQuery ? `${filteredProfessors.length} / ${professors.length}名` : `${professors.length}名`}</p>
        </div>
      </section>

      <section aria-label="教授一覧" className="divide-y divide-[var(--divider)]">
        {listLoading && <p className="py-10 text-sm text-[var(--secondary)]" aria-live="polite">教授一覧を読み込んでいます...</p>}
        {!listLoading && filteredProfessors.map((professor) => <div key={professor.id} className="flex min-h-12 items-center px-1 py-2.5 text-[14px] font-normal leading-6 text-[var(--text)] transition-colors duration-150 hover:bg-white/[0.02] motion-reduce:transition-none">{professor.name}</div>)}
        {!listLoading && professors.length === 0 && !errorMessage && <p className="py-12 text-center text-sm text-[var(--secondary)]">教授が登録されていません</p>}
        {!listLoading && professors.length > 0 && filteredProfessors.length === 0 && <p className="py-12 text-center text-sm text-[var(--secondary)]">該当する教授が見つかりません。</p>}
      </section>
    </div>
  );
}
