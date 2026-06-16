import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Professor, ReviewWithDetails } from '../lib/types';
import { Star, BookOpen } from 'lucide-react';

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
      <div className="bg-white rounded-lg shadow p-6">
        <p className="text-center text-gray-500">読み込み中...</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-bold text-gray-800 mb-4">教授別評価チャート</h2>

      {professors.length === 0 ? (
        <p className="text-gray-500 text-center py-4">
          まだ評価データがありません
        </p>
      ) : (
        <div className="space-y-4">
          {professors.map((professor) => (
            <div
              key={professor.id}
              className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-gray-800 text-lg">
                    {professor.name}
                  </h3>
                  <div className="flex items-center gap-1 text-sm text-gray-600">
                    <BookOpen size={16} />
                    <span>{professor.reviewCount}件のレビュー</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 bg-yellow-100 px-4 py-2 rounded-full">
                  <Star size={20} className="fill-yellow-400 text-yellow-400" />
                  <span className="font-bold text-gray-800 text-xl">
                    {professor.averageRating.toFixed(2)}
                  </span>
                </div>
              </div>

              <div className="relative">
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div
                    className="bg-gradient-to-r from-red-400 via-yellow-400 to-green-400 h-3 rounded-full transition-all"
                    style={{ width: `${(professor.averageRating / 5) * 100}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>1.0</span>
                  <span>2.5</span>
                  <span>5.0</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
