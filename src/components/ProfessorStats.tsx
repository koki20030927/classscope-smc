import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Professor } from '../lib/types';
import { useSchool } from '../contexts/SchoolContext';

interface ProfessorWithStats extends Professor {
  averageRating: number;
  reviewCount: number;
}

export function ProfessorStats({ refresh }: { refresh: number }) {
  const { currentSchool } = useSchool();
  const [professors, setProfessors] = useState<ProfessorWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    loadProfessorStats();
  }, [refresh, currentSchool?.id]);

  const loadProfessorStats = async () => {
    setLoading(true);
    setLoadError(null);

    const { data: professorData, error: professorError } = await supabase
      .from('professors')
      .select('*')
      .eq('school_id', currentSchool!.id)
      .order('name');

    const { data: reviewData, error: reviewError } = await supabase
      .from('reviews')
      .select('professor_id, rating')
      .eq('school_id', currentSchool!.id);

    if (!professorError && !reviewError && professorData && reviewData) {
      const statsMap = new Map<string, { totalRating: number; count: number }>();

      reviewData.forEach((review) => {
        const existing = statsMap.get(review.professor_id) || { totalRating: 0, count: 0 };
        statsMap.set(review.professor_id, {
          totalRating: existing.totalRating + review.rating,
          count: existing.count + 1,
        });
      });

      const professorsWithStats: ProfessorWithStats[] = professorData
        .map((professor) => {
          const stats = statsMap.get(professor.id);
          if (stats && stats.count > 0) {
            return {
              ...professor,
              averageRating: stats.totalRating / stats.count,
              reviewCount: stats.count,
            };
          }
          return null;
        })
        .filter((p): p is ProfessorWithStats => p !== null)
        .sort((a, b) => b.averageRating - a.averageRating);

      setProfessors(professorsWithStats);
    } else {
      setLoadError('教授別評価を読み込めませんでした。少し時間をおいて再度お試しください。');
    }

    setLoading(false);
  };

  if (loading) {
    return (
      <div className="py-10" aria-live="polite">
        <p className="text-center text-sm text-[var(--secondary)]">教授別評価を読み込んでいます...</p>
      </div>
    );
  }

  if (loadError) {
    return <p role="alert" className="py-10 text-sm leading-6 text-[var(--danger)]">{loadError}</p>;
  }

  return (
    <section>
      <div className="flex flex-col gap-4 border-b border-[var(--divider)] pb-7 pt-2 sm:flex-row sm:items-end sm:justify-between sm:pb-8 sm:pt-3">
        <div>
          <h2 className="app-section-title text-[var(--text)]">教授別評価</h2>
          <p className="app-section-description mt-1.5 text-[var(--secondary)]">おすすめ度の平均が高い順</p>
        </div>
        <p className="app-metadata tabular-nums text-[var(--muted)]">{professors.length}名</p>
      </div>

      {professors.length === 0 ? (
        <div className="px-1 py-12 text-center">
          <p className="text-[14px] font-medium leading-5 text-[var(--text)]">まだ評価データがありません</p>
          <p className="app-metadata mt-1.5 text-[var(--secondary)]">レビューが投稿されると集計が表示されます。</p>
        </div>
      ) : (
        <div className="divide-y divide-[var(--divider)] border-b border-[var(--divider)]">
          {professors.map((professor) => (
            <div
              key={professor.id}
              className="grid gap-5 px-1 py-6 sm:grid-cols-[minmax(0,1fr)_minmax(220px,0.65fr)] sm:items-center sm:gap-8"
            >
              <div className="min-w-0">
                <h3 className="truncate text-[15px] font-medium leading-6 tracking-[-0.005em] text-[var(--text)]">{professor.name}</h3>
                <p className="app-metadata mt-1.5 text-[var(--muted)]">{professor.reviewCount}件のレビュー</p>
              </div>

              <div>
                <div className="flex items-baseline justify-between gap-4">
                  <span className="app-metadata text-[var(--secondary)]">おすすめ度</span>
                  <span className="text-[17px] font-medium leading-6 tabular-nums text-[var(--text)]">{professor.averageRating.toFixed(2)}</span>
                </div>
                <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-white/[0.08]">
                  <div
                    className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-200 motion-reduce:transition-none"
                    style={{ width: `${(professor.averageRating / 5) * 100}%` }}
                  />
                </div>
                <div className="mt-1.5 flex justify-between text-[10px] tabular-nums text-[var(--muted)]">
                  <span>1.0</span>
                  <span>5.0</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
