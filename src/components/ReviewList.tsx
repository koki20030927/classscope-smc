import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { ReviewWithDetails, ReviewVote } from '../lib/types';
import { ThumbsUp, ThumbsDown, Trash2, Search } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export function ReviewList({ refresh }: { refresh: number }) {
  const { user } = useAuth();
  const [reviews, setReviews] = useState<ReviewWithDetails[]>([]);
  const [filteredReviews, setFilteredReviews] = useState<ReviewWithDetails[]>([]);
  const [userVotes, setUserVotes] = useState<Map<string, ReviewVote>>(new Map());
  const [loading, setLoading] = useState(true);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadReviews();
    if (user) {
      loadUserVotes();
    }
  }, [refresh, user]);

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

  const loadReviews = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('reviews')
      .select(`
        id,
        user_id,
        professor_id,
        course_id,
        rating,
        difficulty,
        homework_amount,
        support_quality,
        attendance_required,
        content,
        helpful_count,
        not_good_count,
        created_at,
        updated_at,
        professors(name),
        courses(code, name)
      `)
      .order('created_at', { ascending: false });

    if (!error && data) {
      const reviewRows = data as unknown as ReviewWithDetails[];
      setReviews(reviewRows);
      setFilteredReviews(reviewRows);
    }
    setLoading(false);
  };

  const loadUserVotes = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('review_votes')
      .select('id, user_id, review_id, vote_type, created_at')
      .eq('user_id', user.id);

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
        await supabase.from('review_votes').delete().eq('id', existingVote.id);
        const newVotes = new Map(userVotes);
        newVotes.delete(reviewId);
        setUserVotes(newVotes);
      } else {
        await supabase
          .from('review_votes')
          .update({ vote_type: voteType })
          .eq('id', existingVote.id);
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

    await loadReviews();
  };

  const handleDelete = async (reviewId: string) => {
    const { error } = await supabase.from('reviews').delete().eq('id', reviewId);

    if (!error) {
      setDeleteConfirmId(null);
      await loadReviews();
    }
  };

  if (loading) {
    return (
      <div className="border-y border-[var(--divider)] py-10">
        <p className="text-sm text-[var(--secondary)]">読み込み中...</p>
      </div>
    );
  }

  return (
    <section>
      <div className="border-y border-[var(--divider)] py-6">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div><h2 className="text-lg font-medium text-white">レビューを探す</h2><p className="mt-1 text-sm text-[var(--secondary)]">教授名または授業コードで絞り込めます。</p></div>
          <span className="shrink-0 text-xs tabular-nums text-[var(--muted)]">{filteredReviews.length}件</span>
        </div>
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--muted)]" size={17} aria-hidden="true" />
          <input type="text" placeholder="教授名または授業コードを検索" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="h-[50px] w-full rounded-lg border border-[var(--border)] bg-[var(--elevated)] pl-10 pr-4 text-base text-[var(--text)] outline-none transition-colors duration-150 placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--focus)] motion-reduce:transition-none" />
        </div>
        <p className="mt-3 text-xs leading-5 text-[var(--muted)]">評価は5段階です。おすすめ度・サポートは5が高評価、難易度・宿題量は5が高負荷です。</p>
      </div>

      <div className="divide-y divide-[var(--divider)]">
        {filteredReviews.map((review) => {
          const userVote = userVotes.get(review.id);
          const isOwner = user?.id === review.user_id;

          return (
            <article key={review.id} className="py-7 first:pt-6 sm:py-8">
              <div className="flex items-start justify-between gap-5">
                <div className="min-w-0">
                  <h3 className="text-base font-semibold text-white sm:text-lg">{review.professors?.name}</h3>
                  <p className="mt-1 text-sm text-[var(--secondary)]"><span className="font-medium text-slate-300">{review.courses?.code}</span>{review.courses?.name ? ` · ${review.courses.name}` : ''}</p>
                </div>
                <div className="shrink-0 text-right"><span className="text-2xl font-semibold tabular-nums text-white">{review.rating.toFixed(1)}</span><span className="ml-1 text-xs text-[var(--muted)]">/ 5</span><p className="mt-0.5 text-[10px] text-[var(--muted)]">おすすめ度</p></div>
              </div>
              <p className="mt-5 whitespace-pre-wrap text-[15px] leading-7 text-slate-300">{review.content}</p>
              <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-xs tabular-nums text-[var(--secondary)]">
                <span>難易度 {review.difficulty.toFixed(1)}</span><span>宿題 {review.homework_amount.toFixed(1)}</span><span>サポート {review.support_quality.toFixed(1)}</span><span>{review.attendance_required === 'yes' ? '出席あり' : review.attendance_required === 'no' ? '出席なし' : 'オンライン'}</span>
              </div>
              <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => handleVote(review.id, 'helpful')}
                    disabled={!user}
                    className={`flex min-h-10 items-center gap-2 rounded-md px-2.5 text-xs transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] motion-reduce:transition-none ${
                      userVote?.vote_type === 'helpful'
                        ? 'font-medium text-[var(--success)]'
                        : 'text-[var(--secondary)] hover:bg-white/[0.025] hover:text-white'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    <ThumbsUp size={18} />
                    <span>Helpful</span>
                    <span className="font-semibold">{review.helpful_count}</span>
                  </button>
                  <button
                    onClick={() => handleVote(review.id, 'not_good')}
                    disabled={!user}
                    className={`flex min-h-10 items-center gap-2 rounded-md px-2.5 text-xs transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] motion-reduce:transition-none ${
                      userVote?.vote_type === 'not_good'
                        ? 'font-medium text-[var(--danger)]'
                        : 'text-[var(--secondary)] hover:bg-white/[0.025] hover:text-white'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    <ThumbsDown size={18} />
                    <span>Not good</span>
                    <span className="font-semibold">{review.not_good_count}</span>
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-xs text-[var(--muted)]">
                    {new Date(review.created_at).toLocaleDateString('ja-JP')}
                  </span>
                  {isOwner && (
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
          <p className="py-12 text-center text-sm text-[var(--secondary)]">
            検索結果が見つかりませんでした
          </p>
        )}
        {reviews.length === 0 && (
          <p className="py-12 text-center text-sm text-[var(--secondary)]">
            まだレビューがありません
          </p>
        )}
      </div>
    </section>
  );
}
