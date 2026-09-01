import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { ReviewWithDetails, ReviewVote } from '../lib/types';
import { ThumbsUp, ThumbsDown, Trash2, Search } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useSchool } from '../contexts/SchoolContext';

interface ReviewListProps {
  refresh: number;
  professorId?: string;
  courseId?: string;
  embedded?: boolean;
  onReviewsLoaded?: (reviews: ReviewWithDetails[]) => void;
  onReviewDeleted?: () => void;
}

export function ReviewList({ refresh, professorId, courseId, embedded = false, onReviewsLoaded, onReviewDeleted }: ReviewListProps) {
  const { user, isAdmin } = useAuth();
  const { currentSchool } = useSchool();
  const [reviews, setReviews] = useState<ReviewWithDetails[]>([]);
  const [filteredReviews, setFilteredReviews] = useState<ReviewWithDetails[]>([]);
  const [userVotes, setUserVotes] = useState<Map<string, ReviewVote>>(new Map());
  const [loading, setLoading] = useState(true);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const loadSchoolReviews = async () => {
      const reviewIds = await loadReviews();
      if (user) await loadUserVotes(reviewIds);
      else setUserVotes(new Map());
    };
    void loadSchoolReviews();
  }, [refresh, user, currentSchool?.id, professorId, courseId]);

  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredReviews(reviews);
    } else {
      const query = searchQuery.toLowerCase();
      const filtered = reviews.filter((review) => {
        const professorName = review.professors?.name?.toLowerCase() || '';
        const courseCode = review.courses?.code?.toLowerCase() || '';
        const courseName = review.courses?.name?.toLowerCase() || '';
        return professorName.includes(query) || courseCode.includes(query) || courseName.includes(query);
      });
      setFilteredReviews(filtered);
    }
  }, [searchQuery, reviews]);

  const loadReviews = async (): Promise<string[]> => {
    setLoading(true);
    setLoadError(null);
    let query = supabase
      .from('reviews')
      .select(`
        id,
        school_id,
        user_id,
        professor_id,
        course_id,
        review_schema_version,
        rating,
        difficulty,
        homework_amount,
        support_quality,
        attendance_required,
        professor_quality,
        easy_a,
        course_quality,
        recommendation,
        class_format,
        year_taken,
        semester,
        content,
        is_imported,
        source_type,
        source_row_key,
        imported_at,
        helpful_count,
        not_good_count,
        created_at,
        updated_at,
        professors!reviews_school_professor_fkey(name),
        courses!reviews_school_course_fkey(code, name)
      `)
      .eq('school_id', currentSchool!.id)
      .order('created_at', { ascending: false });

    if (professorId) query = query.eq('professor_id', professorId);
    if (courseId) query = query.eq('course_id', courseId);

    const { data, error } = await query;

    if (!error && data) {
      const reviewRows = data as unknown as ReviewWithDetails[];
      setReviews(reviewRows);
      setFilteredReviews(reviewRows);
      onReviewsLoaded?.(reviewRows);
      setLoading(false);
      return reviewRows.map((review) => review.id);
    } else {
      onReviewsLoaded?.([]);
      setLoadError('レビューを読み込めませんでした。少し時間をおいて再度お試しください。');
    }
    setLoading(false);
    return [];
  };

  const loadUserVotes = async (reviewIds: string[]) => {
    if (!user || reviewIds.length === 0) {
      setUserVotes(new Map());
      return;
    }

    const { data, error } = await supabase
      .from('review_votes')
      .select('id, user_id, review_id, vote_type, created_at')
      .eq('user_id', user.id)
      .in('review_id', reviewIds);

    if (!error && data) {
      const votesMap = new Map<string, ReviewVote>();
      data.forEach((vote) => {
        votesMap.set(vote.review_id, vote);
      });
      setUserVotes(votesMap);
    }
  };

  const handleVote = async (reviewId: string, voteType: 'helpful' | 'not_good') => {
    if (!user) return;

    const existingVote = userVotes.get(reviewId);

    if (existingVote) {
      if (existingVote.vote_type === voteType) {
        await supabase.from('review_votes').delete().eq('id', existingVote.id).eq('user_id', user.id);
        const newVotes = new Map(userVotes);
        newVotes.delete(reviewId);
        setUserVotes(newVotes);
      } else {
        await supabase
          .from('review_votes')
          .update({ vote_type: voteType })
          .eq('id', existingVote.id)
          .eq('user_id', user.id);
        const newVotes = new Map(userVotes);
        newVotes.set(reviewId, { ...existingVote, vote_type: voteType });
        setUserVotes(newVotes);
      }
    } else {
      const { data, error } = await supabase
        .from('review_votes')
        .insert({ user_id: user.id, review_id: reviewId, vote_type: voteType })
        .select()
        .single();

      if (!error && data) {
        const newVotes = new Map(userVotes);
        newVotes.set(reviewId, data);
        setUserVotes(newVotes);
      }
    }

    const reviewIds = await loadReviews();
    await loadUserVotes(reviewIds);
  };

  const handleDelete = async (reviewId: string) => {
    const { error } = await supabase
      .from('reviews')
      .delete()
      .eq('id', reviewId)
      .eq('school_id', currentSchool!.id);

    if (!error) {
      setDeleteConfirmId(null);
      await loadReviews();
      onReviewDeleted?.();
    }
  };

  if (loading) {
    return (
      <div className="py-10" aria-live="polite">
        <p className="text-sm text-[var(--secondary)]">レビューを読み込んでいます...</p>
      </div>
    );
  }

  if (loadError) {
    return <p role="alert" className="py-10 text-sm leading-6 text-[var(--danger)]">{loadError}</p>;
  }

  return (
    <section>
      {!embedded && <div className="border-b border-[var(--divider)] pb-8 pt-2 sm:pb-9 sm:pt-3">
        <div className="mb-5 flex items-end justify-between gap-4">
          <div><h2 className="app-section-title text-white">レビューを探す</h2><p className="app-section-description mt-1.5 text-[var(--secondary)]">教授名または授業コードで絞り込めます。</p></div>
          <span className="app-metadata shrink-0 tabular-nums text-[var(--muted)]">{filteredReviews.length}件</span>
        </div>
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--muted)]" size={17} aria-hidden="true" />
          <input type="search" aria-label="レビューを教授名または授業コードで検索" placeholder="教授名または授業コードを検索" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="h-[50px] w-full rounded-lg border border-[var(--border)] bg-[var(--elevated)] pl-10 pr-4 text-[15px] leading-6 text-[var(--text)] outline-none transition-colors duration-150 placeholder:text-[14px] placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--focus)] motion-reduce:transition-none" />
        </div>
        <p className="app-metadata mt-3.5 max-w-lg text-[var(--muted)]">Review v2は教授・Easy A・授業・おすすめ度をそれぞれ5段階で表示します。</p>
      </div>}

      <div className="divide-y divide-[var(--divider)]">
        {filteredReviews.map((review) => {
          const userVote = userVotes.get(review.id);
          const isOwner = user?.id === review.user_id;
          const canDelete = isOwner || isAdmin;
          const isV2 = review.review_schema_version === 2;
          const classFormatLabel = review.class_format === 'in_person'
            ? '対面'
            : review.class_format === 'online'
              ? 'オンライン'
              : review.class_format === 'hybrid'
                ? 'ハイブリッド'
                : null;
          const semesterLabel = review.semester
            ? review.semester.charAt(0).toUpperCase() + review.semester.slice(1)
            : null;

          return (
            <article key={review.id} className="py-8 first:pt-7 sm:py-9">
              <div className="flex items-start justify-between gap-6">
                <div className="min-w-0">
                  {review.is_imported && <span className="mb-2 inline-flex rounded-full border border-cyan-300/20 bg-cyan-300/[0.06] px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.08em] text-cyan-200">External evaluation</span>}
                  <h3 className="text-[17px] font-semibold leading-[1.35] tracking-[-0.01em] text-white sm:text-[18px]">{review.professors?.name}</h3>
                  <p className="mt-1.5 text-[13px] leading-5 text-[var(--secondary)]"><span className="font-medium text-slate-300">{review.courses?.code}</span>{review.courses?.name ? ` · ${review.courses.name}` : ''}</p>
                </div>
                <div className="shrink-0 text-right">
                  <span className="text-[22px] font-semibold leading-none tabular-nums text-white">{(isV2 ? review.recommendation : review.rating)?.toFixed(1) ?? '—'}</span>
                  {(isV2 ? review.recommendation : review.rating) !== null && <span className="ml-1 text-[11px] font-normal text-[var(--muted)]">/ 5</span>}
                  <p className="mt-1 text-[10px] font-normal leading-4 text-[var(--muted)]">おすすめ度</p>
                </div>
              </div>
              {review.content?.trim() && (
                <p className="mt-6 whitespace-pre-wrap text-[15px] font-normal leading-[1.8] text-slate-300">{review.content}</p>
              )}
              {isV2 ? (
                <div className="app-metadata mt-5 flex flex-wrap gap-x-4 gap-y-2 tabular-nums text-[var(--secondary)]">
                  {review.professor_quality !== null && <span>教授の質 {review.professor_quality.toFixed(1)}</span>}
                  {review.easy_a !== null && <span>Easy A {review.easy_a.toFixed(1)}</span>}
                  {review.course_quality !== null && <span>授業の質 {review.course_quality.toFixed(1)}</span>}
                  {classFormatLabel && <span>{classFormatLabel}</span>}
                  {review.year_taken !== null && semesterLabel && <span>{review.year_taken} {semesterLabel}</span>}
                </div>
              ) : (
                <div className="app-metadata mt-5 flex flex-wrap gap-x-4 gap-y-2 tabular-nums text-[var(--secondary)]">
                  {review.difficulty !== null && <span>難易度 {review.difficulty.toFixed(1)}</span>}
                  {review.homework_amount !== null && <span>宿題 {review.homework_amount.toFixed(1)}</span>}
                  {review.support_quality !== null && <span>サポート {review.support_quality.toFixed(1)}</span>}
                  {review.attendance_required && <span>{review.attendance_required === 'yes' ? '出席あり' : review.attendance_required === 'no' ? '出席なし' : 'オンライン'}</span>}
                </div>
              )}
              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => handleVote(review.id, 'helpful')}
                    disabled={!user}
                    className={`flex min-h-10 items-center gap-2 rounded-md px-2.5 text-[12px] font-normal leading-5 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] motion-reduce:transition-none ${
                      userVote?.vote_type === 'helpful'
                        ? 'font-medium text-[var(--success)]'
                        : 'text-[var(--secondary)] hover:bg-white/[0.025] hover:text-white'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    <ThumbsUp size={18} />
                    <span>Helpful</span>
                    <span className="font-medium">{review.helpful_count}</span>
                  </button>
                  <button
                    onClick={() => handleVote(review.id, 'not_good')}
                    disabled={!user}
                    className={`flex min-h-10 items-center gap-2 rounded-md px-2.5 text-[12px] font-normal leading-5 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] motion-reduce:transition-none ${
                      userVote?.vote_type === 'not_good'
                        ? 'font-medium text-[var(--danger)]'
                        : 'text-[var(--secondary)] hover:bg-white/[0.025] hover:text-white'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    <ThumbsDown size={18} />
                    <span>Not good</span>
                    <span className="font-medium">{review.not_good_count}</span>
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <span className="app-metadata text-[var(--muted)]">
                    {new Date(review.created_at).toLocaleDateString('ja-JP')}
                  </span>
                  {canDelete && (
                    <>
                      {deleteConfirmId === review.id ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs text-[var(--secondary)]">削除しますか?</span>
                          <button
                            onClick={() => handleDelete(review.id)}
                            className="min-h-9 rounded-lg bg-[var(--danger)] px-3 text-xs font-medium text-slate-950 transition hover:brightness-110"
                          >
                            はい
                          </button>
                          <button
                            onClick={() => setDeleteConfirmId(null)}
                            className="min-h-9 rounded-lg bg-white/[0.06] px-3 text-xs font-medium text-[var(--secondary)] transition hover:bg-white/[0.1] hover:text-white"
                          >
                            いいえ
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeleteConfirmId(review.id)}
                          className="min-h-10 min-w-10 rounded-xl p-2 text-[var(--danger)] transition hover:bg-rose-400/10 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rose-400/10"
                          title="削除"
                        >
                          <Trash2 size={18} />
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </article>
          );
        })}
        {filteredReviews.length === 0 && reviews.length > 0 && (
          <div className="py-12 text-center"><p className="text-sm font-medium text-[var(--text)]">該当するレビューがありません</p><p className="app-metadata mt-1.5 text-[var(--secondary)]">教授名または授業コードを変えてお試しください。</p></div>
        )}
        {reviews.length === 0 && (
          <div className="py-12 text-center"><p className="text-sm font-medium text-[var(--text)]">まだレビューがありません</p><p className="app-metadata mt-1.5 text-[var(--secondary)]">最初の受講体験が投稿されると、ここに表示されます。</p></div>
        )}
      </div>
    </section>
  );
}
