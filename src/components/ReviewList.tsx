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
        *,
        professors(name),
        courses(code, name)
      `)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setReviews(data);
      setFilteredReviews(data);
    }
    setLoading(false);
  };

  const loadUserVotes = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('review_votes')
      .select('*')
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
      <div className="bg-white rounded-lg shadow p-6">
        <p className="text-center text-gray-500">読み込み中...</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-6 max-h-[calc(100vh-12rem)] overflow-y-auto">
      <h2 className="text-xl font-bold text-gray-800 mb-4">レビュー一覧</h2>

      <div className="mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="教授名または科目コードで検索..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
        <h3 className="font-semibold text-gray-800 mb-2">評価ガイド</h3>
        <div className="grid grid-cols-2 gap-2 text-sm text-gray-700">
          <div><span className="font-medium">おすすめ度:</span> 1=悪い / 5=良い </div>
          <div><span className="font-medium">難易度:</span> 1=簡単 / 5=難しい</div>
          <div><span className="font-medium">宿題の多さ:</span> 1=少ない / 5=多い</div>
          <div><span className="font-medium">サポートの良さ:</span> 1=悪い / 5=良い</div>
        </div>
      </div>

      <div className="space-y-4">
        {filteredReviews.map((review) => {
          const userVote = userVotes.get(review.id);
          const isOwner = user?.id === review.user_id;

          return (
            <div key={review.id} className="border border-gray-200 rounded-lg p-5 bg-white hover:shadow-md transition">
              <div className="flex gap-6">
                <div className="flex-shrink-0 w-48 space-y-3">
                  <div className="text-sm">
                    <div className="text-xs text-gray-500 mb-1">おすすめ度</div>
                    <div className="text-2xl font-bold text-blue-600">{review.rating.toFixed(1)}</div>
                  </div>
                  <div className="text-sm">
                    <div className="text-xs text-gray-500 mb-1">難易度</div>
                    <div className="text-lg font-semibold text-gray-700">{review.difficulty.toFixed(1)}</div>
                  </div>
                  <div className="text-sm">
                    <div className="text-xs text-gray-500 mb-1">宿題の多さ</div>
                    <div className="text-lg font-semibold text-gray-700">{review.homework_amount.toFixed(1)}</div>
                  </div>
                  <div className="text-sm">
                    <div className="text-xs text-gray-500 mb-1">サポートの良さ</div>
                    <div className="text-lg font-semibold text-gray-700">{review.support_quality.toFixed(1)}</div>
                  </div>
                  <div className="text-sm">
                    <div className="text-xs text-gray-500 mb-1">出席確認</div>
                    <div className="text-sm font-medium text-gray-700">
                      {review.attendance_required === 'yes' ? 'はい（出席あり）' :
                       review.attendance_required === 'no' ? 'いいえ（出席なし）' :
                       'オンライン'}
                    </div>
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="mb-3">
                    <div className="font-bold text-gray-900 text-lg mb-1">
                      {review.professors?.name}
                    </div>
                    <div className="text-sm text-gray-600">
                      {review.courses?.code} - {review.courses?.name}
                    </div>
                  </div>
                  <div className="text-gray-700 whitespace-pre-wrap leading-relaxed">
                    {review.content}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between mt-4 pt-4 border-t">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => handleVote(review.id, 'helpful')}
                    disabled={!user}
                    className={`flex items-center gap-2 px-4 py-2 rounded transition ${
                      userVote?.vote_type === 'helpful'
                        ? 'bg-green-100 text-green-700 font-medium'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    <ThumbsUp size={18} />
                    <span>Helpful</span>
                    <span className="font-semibold">{review.helpful_count}</span>
                  </button>
                  <button
                    onClick={() => handleVote(review.id, 'not_good')}
                    disabled={!user}
                    className={`flex items-center gap-2 px-4 py-2 rounded transition ${
                      userVote?.vote_type === 'not_good'
                        ? 'bg-red-100 text-red-700 font-medium'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    <ThumbsDown size={18} />
                    <span>Not good</span>
                    <span className="font-semibold">{review.not_good_count}</span>
                  </button>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-500">
                    {new Date(review.created_at).toLocaleDateString('ja-JP')}
                  </span>
                  {isOwner && (
                    <>
                      {deleteConfirmId === review.id ? (
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-600">削除しますか?</span>
                          <button
                            onClick={() => handleDelete(review.id)}
                            className="px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700 transition"
                          >
                            はい
                          </button>
                          <button
                            onClick={() => setDeleteConfirmId(null)}
                            className="px-3 py-1 bg-gray-300 text-gray-700 text-sm rounded hover:bg-gray-400 transition"
                          >
                            いいえ
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeleteConfirmId(review.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded transition"
                          title="削除"
                        >
                          <Trash2 size={18} />
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {filteredReviews.length === 0 && reviews.length > 0 && (
          <p className="text-gray-500 text-center py-8">
            検索結果が見つかりませんでした
          </p>
        )}
        {reviews.length === 0 && (
          <p className="text-gray-500 text-center py-8">
            まだレビューがありません
          </p>
        )}
      </div>
    </div>
  );
}
