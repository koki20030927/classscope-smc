import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Professor, ReviewWithDetails } from '../lib/types';
import { calculateProfessorReviewMetrics, ProfessorReviewMetrics } from '../lib/professorReviewMetrics';
import { useSchool } from '../contexts/SchoolContext';
import { ProfessorDetail } from './ProfessorDetail';

interface ProfessorWithStats extends Professor {
  metrics: ProfessorReviewMetrics;
}

export function ProfessorStats({ refresh }: { refresh: number }) {
  const { currentSchool } = useSchool();
  const currentSchoolId = currentSchool?.id;
  const [professors, setProfessors] = useState<ProfessorWithStats[]>([]);
  const [selectedProfessor, setSelectedProfessor] = useState<ProfessorWithStats | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadProfessorStats = async () => {
      if (!currentSchoolId) return;
      setLoading(true);
      setLoadError(null);

      const { data, error } = await supabase
        .from('reviews')
        .select(`
          professor_id,
          review_schema_version,
          rating,
          professor_quality,
          easy_a,
          course_quality,
          recommendation,
          professors!reviews_school_professor_fkey(id, school_id, name, created_at, updated_at)
        `)
        .eq('school_id', currentSchoolId);

      if (cancelled) return;

      if (error || !data) {
        setLoadError('教授別評価を読み込めませんでした。少し時間をおいて再度お試しください。');
        setLoading(false);
        return;
      }

      const groupedReviews = new Map<string, { professor: Professor; reviews: ReviewWithDetails[] }>();
      (data as unknown as ReviewWithDetails[]).forEach((review) => {
        const professor = Array.isArray(review.professors) ? review.professors[0] : review.professors;
        if (!professor || professor.school_id !== currentSchoolId) return;
        const group: { professor: Professor; reviews: ReviewWithDetails[] } = groupedReviews.get(professor.id) ?? { professor, reviews: [] };
        group.reviews.push(review);
        groupedReviews.set(professor.id, group);
      });

      const rows = [...groupedReviews.values()]
        .map(({ professor, reviews }) => ({
          ...professor,
          metrics: calculateProfessorReviewMetrics(reviews),
        }))
        .sort((left, right) => {
          const leftScore = left.metrics.recommendationAverage ?? left.metrics.legacyAverageRating ?? 0;
          const rightScore = right.metrics.recommendationAverage ?? right.metrics.legacyAverageRating ?? 0;
          return rightScore - leftScore || left.name.localeCompare(right.name);
        });

      setProfessors(rows);
      setLoading(false);
    };

    void loadProfessorStats();
    return () => {
      cancelled = true;
    };
  }, [refresh, currentSchoolId]);

  useEffect(() => {
    setSelectedProfessor(null);
    setSearchQuery('');
  }, [currentSchoolId]);

  const filteredProfessors = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase();
    if (!query) return professors;
    return professors.filter((professor) => professor.name.toLocaleLowerCase().includes(query));
  }, [professors, searchQuery]);

  if (selectedProfessor) {
    return (
      <ProfessorDetail
        professor={selectedProfessor}
        initialReviewCount={selectedProfessor.metrics.totalReviewCount}
        refresh={refresh}
        onBack={() => setSelectedProfessor(null)}
      />
    );
  }

  if (loading) {
    return <div className="py-10" aria-live="polite"><p className="text-center text-sm text-[var(--secondary)]">教授別評価を読み込んでいます...</p></div>;
  }

  if (loadError) {
    return <p role="alert" className="py-10 text-sm leading-6 text-[var(--danger)]">{loadError}</p>;
  }

  return (
    <section>
      <div className="border-b border-[var(--divider)] pb-7 pt-2 sm:pb-8 sm:pt-3">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="app-section-title text-[var(--text)]">教授別評価</h2>
            <p className="app-section-description mt-1.5 text-[var(--secondary)]">学生のレビューをもとにした教授別の評価です。</p>
          </div>
          {professors.length > 0 && <p className="app-metadata shrink-0 whitespace-nowrap tabular-nums text-[var(--muted)]">{professors.length}名</p>}
        </div>
        {professors.length > 0 && (
          <div className="relative mt-5">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--muted)]" size={17} aria-hidden="true" />
            <input
              type="search"
              aria-label="教授名を検索"
              placeholder="教授名を検索"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="h-[50px] w-full rounded-lg border border-[var(--border)] bg-[var(--elevated)] pl-10 pr-4 text-[15px] leading-6 text-[var(--text)] outline-none transition-colors duration-150 placeholder:text-[14px] placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--focus)] motion-reduce:transition-none"
            />
          </div>
        )}
      </div>

      {professors.length === 0 ? (
        <div className="px-1 py-12 text-center">
          <p className="text-[14px] font-medium leading-5 text-[var(--text)]">まだ教授評価はありません。</p>
          <p className="app-metadata mt-1.5 text-[var(--secondary)]">レビューが投稿されると集計が表示されます。</p>
        </div>
      ) : filteredProfessors.length === 0 ? (
        <div className="px-1 py-12 text-center">
          <p className="text-[14px] font-medium leading-5 text-[var(--text)]">該当する教授が見つかりません。</p>
          <p className="app-metadata mt-1.5 text-[var(--secondary)]">教授名を変えてお試しください。</p>
        </div>
      ) : (
        <div className="divide-y divide-[var(--divider)] border-b border-[var(--divider)]">
          {filteredProfessors.map((professor) => (
            <button
              key={professor.id}
              type="button"
              onClick={() => setSelectedProfessor(professor)}
              aria-label={`${professor.name}の教授詳細を表示`}
              className="grid w-full gap-5 px-1 py-6 text-left transition-colors duration-150 hover:bg-white/[0.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] motion-reduce:transition-none sm:grid-cols-[minmax(0,0.75fr)_minmax(300px,1fr)] sm:items-center sm:gap-8"
            >
              <div className="min-w-0">
                <h3 className="truncate text-[15px] font-medium leading-6 tracking-[-0.005em] text-[var(--text)]">{professor.name}</h3>
                <p className="app-metadata mt-1.5 text-[var(--muted)]">レビュー {professor.metrics.totalReviewCount}件</p>
              </div>
              {professor.metrics.v2ReviewCount > 0 ? (
                <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-[12px]">
                  {[
                    ['教授の質', professor.metrics.professorQualityAverage],
                    ['Easy A', professor.metrics.easyAAverage],
                    ['授業の質', professor.metrics.courseQualityAverage],
                    ['おすすめ', professor.metrics.recommendationAverage],
                  ].map(([label, value]) => (
                    <div key={label as string} className="flex items-baseline justify-between gap-3 border-b border-[var(--divider)] pb-2">
                      <span className="text-[var(--secondary)]">{label}</span>
                      <span className="font-medium tabular-nums text-[var(--text)]">{typeof value === 'number' ? value.toFixed(1) : '—'}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-baseline justify-between gap-4">
                  <span className="app-metadata text-[var(--secondary)]">おすすめ度</span>
                  <span className="text-[17px] font-medium tabular-nums text-[var(--text)]">{professor.metrics.legacyAverageRating?.toFixed(1) ?? '—'}</span>
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
