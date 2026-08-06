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
    const { data, error } = await supabase
      .from('professors')
      .select('id, name')
      .ilike('name', `%${query}%`)
      .order('name')
      .limit(10);

    if (error) {
      console.error('教授を検索できませんでした。');
      throw new Error('教授を検索できませんでした。');
    }

    return (data || []).map((p) => ({
      id: p.id,
      label: p.name,
    }));
  };

  const searchCourses = async (query: string) => {
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

  if (error) {
    console.error('授業を検索できませんでした。');
    throw new Error('授業を検索できませんでした。');
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
    .from("professor_courses")
    .select("course_id")
    .eq("professor_id", id)
    .limit(200);

  if (error) {
    console.error('教授に対応する授業を取得できませんでした。');
    setCoursePrefix(null);
    return;
  }

  const courseIds = (data ?? []).map((r: { course_id: string | null }) => r.course_id).filter(Boolean);

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
    console.error('授業情報を取得できませんでした。');
    setCoursePrefix(null);
    return;
  }

  const codes = (courseRows ?? []).map((r: { code: string | null }) => r.code).filter(Boolean) as string[];

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
    <form onSubmit={handleSubmit} className="border-y border-[var(--divider)]">
      <section className="py-7 sm:py-9">
        <div className="mb-6">
          <h2 className="text-lg font-medium text-white">教授と授業</h2>
          <p className="mt-1.5 text-sm leading-6 text-[var(--secondary)]">レビューする対象を候補から選択してください。</p>
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          <AutocompleteInput label="教授名" value={professorInput} selectedId={selectedProfessorId} onSearch={searchProfessors} onChange={handleProfessorChange} placeholder="教授名を入力（2文字以上）" required />
          <AutocompleteInput label="授業コード" value={courseInput} selectedId={selectedCourseId} onSearch={searchCourses} onChange={handleCourseChange} placeholder="授業コードを入力（2文字以上）" required />
        </div>
      </section>

      <section className="border-t border-[var(--divider)] py-7 sm:py-9">
        <div className="mb-2">
          <h2 className="text-lg font-medium text-white">授業を評価</h2>
          <p className="mt-1.5 text-sm leading-6 text-[var(--secondary)]">1から5の範囲で、実際に受講した印象を選んでください。</p>
        </div>
        <div className="divide-y divide-[var(--divider)]">
          {[
            { label: 'おすすめ度', help: 'おすすめしない → かなりおすすめ', value: rating, setValue: setRating },
            { label: '難易度', help: '簡単 → 難しい', value: difficulty, setValue: setDifficulty },
            { label: '宿題の多さ', help: '少ない → 多い', value: homeworkAmount, setValue: setHomeworkAmount },
            { label: 'サポートの良さ', help: '悪い → 良い', value: supportQuality, setValue: setSupportQuality },
          ].map((item) => (
            <div key={item.label} className="grid gap-4 py-5 sm:grid-cols-[minmax(150px,0.55fr)_minmax(220px,1fr)] sm:items-center sm:gap-8">
              <div>
                <label className="text-sm font-medium text-[var(--text)]">{item.label} <span className="ml-1 tabular-nums text-[var(--secondary)]">{item.value}/5</span></label>
                <p className="mt-1 text-xs leading-5 text-[var(--muted)]">{item.help}</p>
              </div>
              <div>
                <input type="range" min="1" max="5" value={item.value} onChange={(e) => item.setValue(Number(e.target.value))} className="h-2 w-full cursor-pointer accent-[var(--accent)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--focus)]" />
                <div className="mt-1.5 flex justify-between px-0.5 text-[10px] tabular-nums text-[var(--muted)]" aria-hidden="true"><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span></div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-[var(--divider)] py-7 sm:py-9">
        <fieldset>
          <legend className="text-lg font-medium text-white">授業形式・出席 <span className="ml-1 text-sm font-normal text-[var(--secondary)]">必須</span></legend>
          <div className="mt-5 grid overflow-hidden rounded-lg border border-[var(--border)] sm:grid-cols-3 sm:divide-x sm:divide-[var(--divider)]">
            {[
              { value: 'yes', label: '出席あり', help: '確認があります' },
              { value: 'no', label: '出席なし', help: '確認はありません' },
              { value: 'online', label: 'オンライン', help: '該当なし' },
            ].map((option) => (
              <label key={option.value} className="relative cursor-pointer border-b border-[var(--divider)] last:border-b-0 sm:border-b-0">
                <input type="radio" name="attendance" checked={attendanceRequired === option.value} onChange={() => setAttendanceRequired(option.value as 'yes' | 'no' | 'online')} className="peer sr-only" />
                <span className="flex min-h-14 items-center justify-between px-4 py-3 pr-10 text-sm text-[var(--secondary)] transition-colors duration-150 peer-checked:bg-white/[0.035] peer-checked:font-medium peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-inset peer-focus-visible:ring-[var(--accent)] motion-reduce:transition-none">
                  <span><span className="block">{option.label}</span><span className="mt-0.5 block text-xs font-normal text-[var(--muted)]">{option.help}</span></span>
                </span>
                <span aria-hidden="true" className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-[var(--accent)] opacity-0 transition-opacity duration-150 peer-checked:opacity-100 motion-reduce:transition-none">✓</span>
              </label>
            ))}
          </div>
        </fieldset>
      </section>

      <section className="border-t border-[var(--divider)] py-8 sm:py-10">
        <div className="mb-5">
          <h2 className="text-lg font-medium text-white">受講した経験を書く</h2>
          <p className="mt-1.5 text-sm leading-6 text-[var(--secondary)]">授業の雰囲気や教授の教え方を、次の学生へ共有してください。</p>
        </div>
        <label className="mb-2 block text-sm font-medium text-[var(--text)]">コメント <span className="text-[var(--secondary)]">必須</span></label>
        <textarea value={content} onChange={(e) => setContent(e.target.value)} required rows={8} className="w-full resize-y rounded-lg border border-[var(--border)] bg-[var(--elevated)] px-4 py-3 text-base leading-7 text-[var(--text)] outline-none transition-colors duration-150 placeholder:text-[var(--muted)] hover:border-slate-500 focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--focus)] motion-reduce:transition-none" placeholder="授業の感想や教授の教え方などを記入してください" />
      </section>

      <section className="flex flex-col gap-4 border-t border-[var(--divider)] py-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-[var(--secondary)]">投稿後はレビュー一覧へすぐに反映されます。</p>
        <button type="submit" disabled={loading || !isFormValid()} className="h-[50px] w-full rounded-lg bg-[var(--accent)] px-6 text-sm font-semibold text-slate-950 transition-colors duration-150 hover:bg-[var(--accent-hover)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--focus)] active:translate-y-px disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-500 motion-reduce:transform-none motion-reduce:transition-none sm:w-auto sm:min-w-44">
          {loading ? '投稿中...' : 'レビューを投稿'}
        </button>
      </section>
    </form>
  );
}
