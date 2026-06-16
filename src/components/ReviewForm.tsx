import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { AutocompleteInput } from './AutocompleteInput';

export default function ReviewForm({ onReviewSubmitted }: { onReviewSubmitted: () => void }) {

  const { user } = useAuth();

  const [professorInput, setProfessorInput] = useState('');
  const [selectedProfessorId, setSelectedProfessorId] = useState<string | null>(null);

  const [courseInput, setCourseInput] = useState('');
  const [coursePrefix, setCoursePrefix] = useState<string | null>(null);

  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);

  const [rating, setRating] = useState(3);
  const [difficulty, setDifficulty] = useState(3);
  const [homeworkAmount, setHomeworkAmount] = useState(3);
  const [supportQuality, setSupportQuality] = useState(3);
  const [attendanceRequired, setAttendanceRequired] = useState<'yes' | 'no' | 'online' | null>(null);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);

  const searchProfessors = async (query: string) => {
    console.log('query', query);
    console.log('VITE_SUPABASE_URL', import.meta.env.VITE_SUPABASE_URL);
    console.log('VITE_SUPABASE_ANON_KEY', import.meta.env.VITE_SUPABASE_ANON_KEY);

    const { data, error } = await supabase
      .from('professors')
      .select('id, name')
      .ilike('name', `%${query}%`)
      .order('name')
      .limit(10);

    console.log({ dataLen: data?.length, error });

    if (error) {
      console.error('Professor search error:', error);
      throw new Error(`教授検索エラー: ${error.message}`);
    }

    return (data || []).map((p) => ({
      id: p.id,
      label: p.name,
    }));
  };

  const searchCourses = async (query: string) => {
  console.log("query", query);

  const q = query.trim();

  // ✅ 教授が選ばれて prefix が取れてたら、その科目カテゴリだけ出す
  const pattern =
    coursePrefix
      ? (q ? `${coursePrefix}%${q}%` : `${coursePrefix}%`)
      : (q ? `%${q}%` : "%");

  const { data, error } = await supabase
    .from("courses")
    .select("id, code")
    .ilike("code", pattern)
   
    .limit(30);

  console.log({ dataLen: data?.length, error, coursePrefix, pattern });

  if (error) {
    console.error("Course search error:", error);
    throw new Error(`科目検索エラー: ${error.message}`);
  }

  const parseCourse = (code: string) => {
  const m = code.trim().match(/^([A-Za-z&]+)\s*(\d+)(.*)$/);
  if (!m) return { subject: code.trim().toUpperCase(), num: Number.MAX_SAFE_INTEGER, tail: "" };
  return { subject: m[1].toUpperCase(), num: parseInt(m[2], 10), tail: (m[3] || "").trim().toUpperCase() };
};

const sorted = (data ?? []).slice().sort((a, b) => {
  const A = parseCourse(a.code);
  const B = parseCourse(b.code);

  if (A.subject !== B.subject) return A.subject.localeCompare(B.subject);
  if (A.num !== B.num) return A.num - B.num;
  return A.tail.localeCompare(B.tail);
});

return sorted.map((c) => ({
  id: c.id,
  label: c.code,
}));
};

  const handleProfessorChange = async (value: string, id: string | null) => {
  setProfessorInput(value);
  setSelectedProfessorId(id);

  if (!id) {
    setCoursePrefix(null);
    return;
  }

  // 教授が過去に教えた course_id を取得
  const { data, error } = await supabase
    .from("professor_course_pairs")
    .select("course_id")
    .eq("professor_id", id)
    .limit(200);

  if (error) {
    console.error("prefix detect error:", error);
    setCoursePrefix(null);
    return;
  }

  const courseIds = (data ?? []).map((r: any) => r.course_id).filter(Boolean);

  if (courseIds.length === 0) {
    setCoursePrefix(null);
    return;
  }

  // course_id から courses.code を取得
  const { data: courseRows, error: courseErr } = await supabase
    .from("courses")
    .select("code")
    .in("id", courseIds);

  if (courseErr) {
    console.error("prefix detect (courses) error:", courseErr);
    setCoursePrefix(null);
    return;
  }

  const codes = (courseRows ?? []).map((r: any) => r.code).filter(Boolean) as string[];

  // "MATH 13" → "MATH"
  const prefixes = codes.map((c) => c.split(" ")[0]);

  const count = new Map<string, number>();
  for (const p of prefixes) count.set(p, (count.get(p) ?? 0) + 1);

  let best: string | null = null;
  let max = 0;
  for (const [p, n] of count.entries()) {
    if (n > max) {
      best = p;
      max = n;
    }
  }

  setCoursePrefix(best);
};

  const handleCourseChange = (value: string, id: string | null) => {
    setCourseInput(value);
    setSelectedCourseId(id);
  };

  const isFormValid = (): boolean => {
  return (
    selectedProfessorId !== null &&
    selectedCourseId !== null &&
    attendanceRequired !== null &&
    content.trim().length > 0
  );
};



  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !isFormValid()) return;

    setLoading(true);

    const { error } = await supabase.from('reviews').insert({
      user_id: user.id,
      professor_id: selectedProfessorId,
      course_id: selectedCourseId,
      rating,
      difficulty,
      homework_amount: homeworkAmount,
      support_quality: supportQuality,
      attendance_required: attendanceRequired,
      content,
    });

    if (!error) {
      setProfessorInput('');
      setSelectedProfessorId(null);
      setCourseInput('');
      setSelectedCourseId(null);
      setRating(3);
      setDifficulty(3);
      setHomeworkAmount(3);
      setSupportQuality(3);
      setAttendanceRequired(null);
      setContent('');
      alert('レビューを投稿しました');
      onReviewSubmitted();
    } else {
      alert('エラーが発生しました');
    }
    setLoading(false);
  };

  return (
    <div className="bg-white rounded-lg shadow p-6 max-h-[calc(100vh-12rem)] overflow-y-auto">
      <h2 className="text-xl font-bold text-gray-800 mb-4">レビューを投稿</h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        <AutocompleteInput
          label="教授名"
          value={professorInput}
          selectedId={selectedProfessorId}
          onSearch={searchProfessors}
          onChange={handleProfessorChange}
          placeholder="教授名を入力（2文字以上）"
          required
        />

        <AutocompleteInput
          label="授業コード"
          value={courseInput}
          selectedId={selectedCourseId}
          onSearch={searchCourses}
          onChange={handleCourseChange}
          placeholder="授業コードを入力（2文字以上）"
          required
        />

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            おすすめ度: {rating} / 5 <span className="text-red-500">*</span>
          </label>
          <div className="text-xs text-gray-500 mb-1">1: おすすめしない → 5: かなりおすすめ</div>
          <input
            type="range"
            min="1"
            max="5"
            value={rating}
            onChange={(e) => setRating(Number(e.target.value))}
            className="w-full"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            難易度: {difficulty} / 5 <span className="text-red-500">*</span>
          </label>
          <div className="text-xs text-gray-500 mb-1">1: 簡単 → 5: 難しい</div>
          <input
            type="range"
            min="1"
            max="5"
            value={difficulty}
            onChange={(e) => setDifficulty(Number(e.target.value))}
            className="w-full"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            宿題の多さ: {homeworkAmount} / 5 <span className="text-red-500">*</span>
          </label>
          <div className="text-xs text-gray-500 mb-1">1: 少ない → 5: 多い</div>
          <input
            type="range"
            min="1"
            max="5"
            value={homeworkAmount}
            onChange={(e) => setHomeworkAmount(Number(e.target.value))}
            className="w-full"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            サポートの良さ: {supportQuality} / 5 <span className="text-red-500">*</span>
          </label>
          <div className="text-xs text-gray-500 mb-1">1: 悪い → 5: 良い</div>
          <input
            type="range"
            min="1"
            max="5"
            value={supportQuality}
            onChange={(e) => setSupportQuality(Number(e.target.value))}
            className="w-full"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            出席確認 <span className="text-red-500">*</span>
          </label>
          <div className="flex gap-4">
            <label className="flex items-center">
              <input
                type="radio"
                name="attendance"
                checked={attendanceRequired === 'yes'}
                onChange={() => setAttendanceRequired('yes')}
                className="mr-2"
              />
              はい（出席あり）
            </label>
            <label className="flex items-center">
              <input
                type="radio"
                name="attendance"
                checked={attendanceRequired === 'no'}
                onChange={() => setAttendanceRequired('no')}
                className="mr-2"
              />
              いいえ（出席なし）
            </label>
            <label className="flex items-center">
              <input
                type="radio"
                name="attendance"
                checked={attendanceRequired === 'online'}
                onChange={() => setAttendanceRequired('online')}
                className="mr-2"
              />
              オンライン（出席確認なし / 該当なし）
            </label>
          </div>
        </div>

       <div>
  <label className="block text-sm font-medium text-gray-700 mb-1">
    レビューコメント <span className="text-red-500">*</span>
  </label>

  <textarea
    value={content}
    onChange={(e) => setContent(e.target.value)}
    required
    rows={4}
    className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
    placeholder="授業の感想や教授の教え方などを記入してください"
  />
</div>


        

        <button
  type="submit"
  disabled={loading || !isFormValid()}
  className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
>
  {loading ? '投稿中...' : 'レビューを投稿'}
</button>

      </form>
    </div>
  );
}

