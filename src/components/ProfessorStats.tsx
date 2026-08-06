import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Professor } from '../lib/types';

interface ProfessorWithStats extends Professor {
  averageRating: number;
  reviewCount: number;
}

export function ProfessorStats({ refresh }: { refresh: number }) {
  const [professors, setProfessors] = useState<ProfessorWithStats[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProfessorStats();
  }, [refresh]);

  const loadProfessorStats = async () => {
    setLoading(true);

    const { data: professorData, error: professorError } = await supabase
      .from('professors')
      .select('*')
      .order('name');

    const { data: reviewData, error: reviewError } = await supabase
      .from('reviews')
      .select('professor_id, rating');

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
    }

    setLoading(false);
  };

  if (loading) {
    return (
      <div className="border-y border-[var(--divider)] py-10">
        <p className="text-center text-sm text-[var(--secondary)]">読み込み中...</p>
      </div>
    );
  }

  return (
    <section>
      <div className="flex flex-col gap-3 border-y border-[var(--divider)] py-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-[-0.02em] text-[var(--text)]">教授別評価</h2>
          <p className="mt-1.5 text-sm leading-6 text-[var(--secondary)]">投稿されたおすすめ度の平均が高い順に表示します。</p>
        </div>
        <p className="text-sm tabular-nums text-[var(--muted)]">{professors.length}名</p>
      </div>

      {professors.length === 0 ? (
        <div className="border-b border-[var(--divider)] px-1 py-12 text-center">
          <p className="text-sm font-medium text-[var(--text)]">まだ評価データがありません</p>
          <p className="mt-1 text-xs text-[var(--secondary)]">レビューが投稿されると集計が表示されます。</p>
        </div>
      ) : (
        <div className="divide-y divide-[var(--divider)] border-b border-[var(--divider)]">
          {professors.map((professor) => (
            <div
              key={professor.id}
              className="grid gap-4 px-1 py-5 sm:grid-cols-[minmax(0,1fr)_minmax(220px,0.65fr)] sm:items-center sm:gap-8"
            >
              <div className="min-w-0">
                <h3 className="truncate text-base font-medium text-[var(--text)]">{professor.name}</h3>
                <p className="mt-1 text-xs text-[var(--muted)]">{professor.reviewCount}件のレビュー</p>
              </div>

              <div>
                <div className="flex items-baseline justify-between gap-4">
                  <span className="text-xs text-[var(--secondary)]">おすすめ度</span>
                  <span className="text-lg font-semibold tabular-nums text-[var(--text)]">{professor.averageRating.toFixed(2)}</span>
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
