import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Professor } from '../lib/types';
import { useSchool } from '../contexts/SchoolContext';

interface ProfessorWithStats extends Professor {
  v2ReviewCount: number;
  legacyReviewCount: number;
  averageProfessorQuality: number | null;
  averageEasyA: number | null;
  averageCourseQuality: number | null;
  averageRecommendation: number | null;
  legacyAverageRating: number | null;
}

interface Accumulator {
  v2Count: number;
  legacyCount: number;
  professorQuality: number;
  easyA: number;
  courseQuality: number;
  recommendation: number;
  recommendationCount: number;
  legacyRating: number;
}

export function ProfessorStats({ refresh }: { refresh: number }) {
  const { currentSchool } = useSchool();
  const [professors, setProfessors] = useState<ProfessorWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    void loadProfessorStats();
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
      .select('professor_id, review_schema_version, rating, professor_quality, easy_a, course_quality, recommendation')
      .eq('school_id', currentSchool!.id);

    if (!professorError && !reviewError && professorData && reviewData) {
      const statsMap = new Map<string, Accumulator>();

      for (const review of reviewData) {
        const stats = statsMap.get(review.professor_id) ?? {
          v2Count: 0,
          legacyCount: 0,
          professorQuality: 0,
          easyA: 0,
          courseQuality: 0,
          recommendation: 0,
          recommendationCount: 0,
          legacyRating: 0,
        };

        if (review.review_schema_version === 2
          && review.professor_quality !== null
          && review.easy_a !== null
          && review.course_quality !== null) {
          stats.v2Count += 1;
          stats.professorQuality += review.professor_quality;
          stats.easyA += review.easy_a;
          stats.courseQuality += review.course_quality;
          if (review.recommendation !== null) {
            stats.recommendation += review.recommendation;
            stats.recommendationCount += 1;
          }
        } else if (review.review_schema_version === 1 && review.rating !== null) {
          stats.legacyCount += 1;
          stats.legacyRating += review.rating;
        }

        statsMap.set(review.professor_id, stats);
      }

      const rows = professorData
        .map((professor): ProfessorWithStats | null => {
          const stats = statsMap.get(professor.id);
          if (!stats || (stats.v2Count === 0 && stats.legacyCount === 0)) return null;
          return {
            ...professor,
            v2ReviewCount: stats.v2Count,
            legacyReviewCount: stats.legacyCount,
            averageProfessorQuality: stats.v2Count ? stats.professorQuality / stats.v2Count : null,
            averageEasyA: stats.v2Count ? stats.easyA / stats.v2Count : null,
            averageCourseQuality: stats.v2Count ? stats.courseQuality / stats.v2Count : null,
            averageRecommendation: stats.recommendationCount ? stats.recommendation / stats.recommendationCount : null,
            legacyAverageRating: stats.legacyCount ? stats.legacyRating / stats.legacyCount : null,
          };
        })
        .filter((professor): professor is ProfessorWithStats => professor !== null)
        .sort((left, right) => {
          const leftScore = left.averageRecommendation ?? left.legacyAverageRating ?? 0;
          const rightScore = right.averageRecommendation ?? right.legacyAverageRating ?? 0;
          return rightScore - leftScore;
        });

      setProfessors(rows);
    } else {
      setLoadError('教授別評価を読み込めませんでした。少し時間をおいて再度お試しください。');
    }

    setLoading(false);
  };

  if (loading) {
    return <div className="py-10" aria-live="polite"><p className="text-center text-sm text-[var(--secondary)]">教授別評価を読み込んでいます...</p></div>;
  }

  if (loadError) {
    return <p role="alert" className="py-10 text-sm leading-6 text-[var(--danger)]">{loadError}</p>;
  }

  return (
    <section>
      <div className="flex flex-col gap-4 border-b border-[var(--divider)] pb-7 pt-2 sm:flex-row sm:items-end sm:justify-between sm:pb-8 sm:pt-3">
        <div>
          <h2 className="app-section-title text-[var(--text)]">教授別評価</h2>
          <p className="app-section-description mt-1.5 text-[var(--secondary)]">学生のレビューをもとにした教授別の評価です。</p>
        </div>
        {professors.length > 0 && (
          <p className="app-metadata shrink-0 whitespace-nowrap tabular-nums text-[var(--muted)]">{professors.length}名</p>
        )}
      </div>

      {professors.length === 0 ? (
        <div className="px-1 py-12 text-center">
          <p className="text-[14px] font-medium leading-5 text-[var(--text)]">まだ教授評価はありません。</p>
          <p className="app-metadata mt-1.5 text-[var(--secondary)]">レビューが投稿されると集計が表示されます。</p>
        </div>
      ) : (
        <div className="divide-y divide-[var(--divider)] border-b border-[var(--divider)]">
          {professors.map((professor) => (
            <div key={professor.id} className="grid gap-5 px-1 py-6 sm:grid-cols-[minmax(0,0.75fr)_minmax(300px,1fr)] sm:items-center sm:gap-8">
              <div className="min-w-0">
                <h3 className="truncate text-[15px] font-medium leading-6 tracking-[-0.005em] text-[var(--text)]">{professor.name}</h3>
                <p className="app-metadata mt-1.5 text-[var(--muted)]">レビュー {professor.v2ReviewCount + professor.legacyReviewCount}件</p>
              </div>
              {professor.v2ReviewCount > 0 ? (
                <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-[12px]">
                  {[
                    ['教授の質', professor.averageProfessorQuality],
                    ['Easy A', professor.averageEasyA],
                    ['授業の質', professor.averageCourseQuality],
                    ['おすすめ', professor.averageRecommendation],
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
                  <span className="text-[17px] font-medium tabular-nums text-[var(--text)]">{professor.legacyAverageRating?.toFixed(1) ?? '—'}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
