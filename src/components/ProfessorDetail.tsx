import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Course, Professor, ReviewWithDetails } from '../lib/types';
import { calculateProfessorReviewMetrics } from '../lib/professorReviewMetrics';
import { useSchool } from '../contexts/SchoolContext';
import { ReviewList } from './ReviewList';

interface ProfessorDetailProps {
  professor: Professor;
  initialReviewCount: number;
  refresh: number;
  onBack: () => void;
}

interface CourseJoinRow {
  courses: Course | Course[] | null;
}

const getJoinedCourse = (value: CourseJoinRow['courses']) => Array.isArray(value) ? value[0] : value;

export function ProfessorDetail({ professor, initialReviewCount, refresh, onBack }: ProfessorDetailProps) {
  const { currentSchool } = useSchool();
  const currentSchoolId = currentSchool?.id;
  const currentSchoolName = currentSchool?.name;
  const [verifiedProfessor, setVerifiedProfessor] = useState<Professor | null>(professor);
  const [relatedCourses, setRelatedCourses] = useState<Course[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [visibleReviews, setVisibleReviews] = useState<ReviewWithDetails[]>([]);
  const [totalReviewCount, setTotalReviewCount] = useState(initialReviewCount);
  const [metadataLoading, setMetadataLoading] = useState(true);
  const [metadataError, setMetadataError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadProfessorMetadata = async () => {
      if (!currentSchoolId) return;
      setMetadataLoading(true);
      setMetadataError(null);
      setSelectedCourseId('');
      setVisibleReviews([]);

      const [professorResult, relationshipResult, reviewCourseResult] = await Promise.all([
        supabase
          .from('professors')
          .select('*')
          .eq('school_id', currentSchoolId)
          .eq('id', professor.id)
          .maybeSingle(),
        supabase
          .from('professor_courses')
          .select('courses!professor_courses_school_course_fkey(id, school_id, code, name, created_at, updated_at)')
          .eq('school_id', currentSchoolId)
          .eq('professor_id', professor.id),
        supabase
          .from('reviews')
          .select('course_id, courses!reviews_school_course_fkey(id, school_id, code, name, created_at, updated_at)')
          .eq('school_id', currentSchoolId)
          .eq('professor_id', professor.id),
      ]);

      if (cancelled) return;

      if (professorResult.error || relationshipResult.error || reviewCourseResult.error || !professorResult.data) {
        setVerifiedProfessor(null);
        setRelatedCourses([]);
        setMetadataError('教授情報を読み込めませんでした。少し時間をおいて再度お試しください。');
        setMetadataLoading(false);
        return;
      }

      const courseMap = new Map<string, Course>();
      const addCourses = (rows: CourseJoinRow[]) => {
        rows.forEach((row) => {
          const course = getJoinedCourse(row.courses);
          if (course && course.school_id === currentSchoolId) courseMap.set(course.id, course);
        });
      };

      addCourses(relationshipResult.data as unknown as CourseJoinRow[]);
      addCourses(reviewCourseResult.data as unknown as CourseJoinRow[]);

      setVerifiedProfessor(professorResult.data as Professor);
      setRelatedCourses([...courseMap.values()].sort((left, right) => left.code.localeCompare(right.code)));
      setTotalReviewCount(reviewCourseResult.data.length);
      setMetadataLoading(false);
    };

    void loadProfessorMetadata();
    return () => {
      cancelled = true;
    };
  }, [currentSchoolId, professor.id, refresh]);

  const metrics = useMemo(() => calculateProfessorReviewMetrics(visibleReviews), [visibleReviews]);
  const handleReviewsLoaded = useCallback((reviews: ReviewWithDetails[]) => {
    setVisibleReviews(reviews);
  }, []);
  const handleReviewDeleted = useCallback(() => {
    setTotalReviewCount((count) => Math.max(0, count - 1));
  }, []);
  const handleCourseChange = (courseId: string) => {
    setVisibleReviews([]);
    setSelectedCourseId(courseId);
  };

  if (metadataError || !verifiedProfessor) {
    return (
      <section>
        <button onClick={onBack} className="inline-flex min-h-10 items-center gap-2 text-[13px] font-medium text-[var(--accent)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]">
          <ArrowLeft size={16} aria-hidden="true" />教授別評価へ戻る
        </button>
        <p role="alert" className="py-10 text-sm leading-6 text-[var(--danger)]">{metadataError}</p>
      </section>
    );
  }

  return (
    <section>
      <button onClick={onBack} className="inline-flex min-h-10 items-center gap-2 text-[13px] font-medium text-[var(--accent)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]">
        <ArrowLeft size={16} aria-hidden="true" />教授別評価へ戻る
      </button>

      <header className="mt-5 border-b border-[var(--divider)] pb-8">
        <p className="app-metadata text-[var(--accent)]">{currentSchoolName}</p>
        <h2 className="mt-2 text-[28px] font-semibold leading-tight tracking-[-0.025em] text-white sm:text-[34px]">{verifiedProfessor.name}</h2>
        <div className="mt-5 grid gap-3 text-[13px] leading-6 text-[var(--secondary)] sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start sm:gap-8">
          <p className="min-w-0">
            <span className="text-[var(--muted)]">関連Course</span><br />
            <span className="break-words text-slate-300">{relatedCourses.length > 0 ? relatedCourses.map((course) => course.code).join(' · ') : '—'}</span>
          </p>
          <p className="whitespace-nowrap tabular-nums text-slate-300">レビュー {totalReviewCount}件</p>
        </div>
      </header>

      <div className="grid gap-9 border-b border-[var(--divider)] py-8 lg:grid-cols-[minmax(220px,0.7fr)_minmax(300px,1.3fr)] lg:gap-12">
        <div>
          <p className="text-[13px] font-medium text-[var(--secondary)]">おすすめ度</p>
          {metrics.recommendationAverage !== null ? (
            <>
              <p className="mt-3 text-[42px] font-semibold leading-none tracking-[-0.035em] tabular-nums text-white">
                {metrics.recommendationAverage.toFixed(1)} <span className="text-[16px] font-normal tracking-normal text-[var(--muted)]">/ 5</span>
              </p>
              <p className="app-metadata mt-3 tabular-nums text-[var(--secondary)]">{metrics.recommendationCount}件の評価</p>
            </>
          ) : (
            <>
              <p className="mt-3 text-[42px] font-semibold leading-none text-white">—</p>
              <p className="app-metadata mt-3 text-[var(--secondary)]">おすすめ度の評価はまだありません。</p>
            </>
          )}

          <div className="mt-7 grid grid-cols-3 gap-3 border-t border-[var(--divider)] pt-5">
            {[
              ['教授の質', metrics.professorQualityAverage],
              ['Easy A', metrics.easyAAverage],
              ['授業の質', metrics.courseQualityAverage],
            ].map(([label, value]) => (
              <div key={label as string} className="min-w-0">
                <p className="text-[11px] leading-4 text-[var(--muted)]">{label}</p>
                <p className="mt-1.5 text-[18px] font-medium tabular-nums text-[var(--text)]">{typeof value === 'number' ? value.toFixed(1) : '—'}</p>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h3 className="text-[15px] font-medium text-[var(--text)]">おすすめ度の分布</h3>
          {metrics.recommendationCount > 0 ? (
            <div className="mt-5 grid gap-3" aria-label="おすすめ度の分布">
              {[5, 4, 3, 2, 1].map((score) => {
                const count = metrics.recommendationDistribution[score as 1 | 2 | 3 | 4 | 5];
                const width = (count / metrics.recommendationCount) * 100;
                return (
                  <div key={score} aria-label={`${score}点 ${count}件`} className="grid grid-cols-[16px_minmax(0,1fr)_28px] items-center gap-3 text-[12px] tabular-nums">
                    <span className="text-[var(--secondary)]">{score}</span>
                    <div className="h-2 overflow-hidden rounded-full bg-white/[0.05]">
                      <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${width}%` }} />
                    </div>
                    <span className="text-right text-[var(--secondary)]">{count}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="app-metadata mt-5 text-[var(--secondary)]">おすすめ度の評価はまだありません。</p>
          )}
        </div>
      </div>

      <div className="border-b border-[var(--divider)] py-7">
        <label htmlFor="professor-course-filter" className="app-field-label text-[var(--text)]">授業で絞り込む</label>
        <select
          id="professor-course-filter"
          value={selectedCourseId}
          onChange={(event) => handleCourseChange(event.target.value)}
          disabled={metadataLoading}
          className="mt-3 h-12 w-full max-w-sm rounded-lg border border-[var(--border)] bg-[var(--elevated)] px-3.5 text-[14px] text-[var(--text)] outline-none focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--focus)] disabled:opacity-50"
        >
          <option value="">すべての授業</option>
          {relatedCourses.map((course) => <option key={course.id} value={course.id}>{course.code} · {course.name}</option>)}
        </select>
        <p className="app-metadata mt-2 text-[var(--muted)]">選択した授業に合わせて、評価概要とレビューを切り替えます。</p>
      </div>

      <div className="pt-8">
        <div className="mb-1">
          <h3 className="app-section-title text-[var(--text)]">この教授のレビュー</h3>
          <p className="app-section-description mt-1.5 text-[var(--secondary)]">{selectedCourseId ? '選択した授業' : 'すべての授業'}のレビューを表示しています。</p>
        </div>
        <ReviewList
          refresh={refresh}
          professorId={verifiedProfessor.id}
          courseId={selectedCourseId || undefined}
          embedded
          onReviewsLoaded={handleReviewsLoaded}
          onReviewDeleted={handleReviewDeleted}
        />
      </div>
    </section>
  );
}
