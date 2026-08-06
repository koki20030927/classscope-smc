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
  const [courseContextMessage, setCourseContextMessage] = useState<string | null>(null);

  const [rating, setRating] = useState(3);
  const [difficulty, setDifficulty] = useState(3);
  const [homeworkAmount, setHomeworkAmount] = useState(3);
  const [supportQuality, setSupportQuality] = useState(3);
  const [attendanceRequired, setAttendanceRequired] = useState<'yes' | 'no' | 'online' | null>(null);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);

  const ratingMeaning = (value: number, low: string, middle: string, high: string) => {
    if (value <= 2) return low;
    if (value === 3) return middle;
    return high;
  };

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
    setCourseContextMessage(null);
    return;
  }

  setCourseContextMessage('関連する授業を確認しています...');

  // 教授が過去に教えた course_id を取得
  const { data, error } = await supabase
    .from("professor_courses")
    .select("course_id")
    .eq("professor_id", id)
    .limit(200);

  if (error) {
    console.error('教授に対応する授業を取得できませんでした。');
    setCoursePrefix(null);
    setCourseContextMessage('関連する授業を確認できませんでした。全授業から検索できます。');
    return;
  }

  const courseIds = (data ?? []).map((r: { course_id: string | null }) => r.course_id).filter(Boolean);

  if (courseIds.length === 0) {
    setCoursePrefix(null);
    setCourseContextMessage('この教授に登録されている授業がないため、全授業から検索できます。');
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
    setCourseContextMessage('関連する授業を確認できませんでした。全授業から検索できます。');
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
  setCourseContextMessage('選択した教授に関連する科目を優先して表示します。');
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
    <form onSubmit={handleSubmit}>
      <section className="max-w-4xl pb-11 pt-2 sm:pb-14 sm:pt-4">
        <div className="mb-7">
          <h2 className="text-xl font-semibold leading-[1.3] tracking-[-0.015em] text-white">教授と授業</h2>
          <p className="app-metadata mt-2 text-[var(--secondary)]">すべての項目を入力してください。</p>
        </div>
        <div className="grid gap-6 md:grid-cols-2 md:gap-5">
          <AutocompleteInput label="教授" value={professorInput} selectedId={selectedProfessorId} onSearch={searchProfessors} onChange={handleProfessorChange} placeholder="教授を検索" required />
          <div>
            <AutocompleteInput label="授業" value={courseInput} selectedId={selectedCourseId} onSearch={searchCourses} onChange={handleCourseChange} placeholder="授業を検索" required />
            {selectedProfessorId && !selectedCourseId && courseContextMessage && <p className="app-metadata mt-2 text-[var(--secondary)]" aria-live="polite">{courseContextMessage}</p>}
          </div>
        </div>
      </section>

      <section className="max-w-[760px] border-t border-[var(--divider)] pb-8 pt-12 sm:pb-10 sm:pt-14">
        <div className="mb-6">
          <h2 className="text-xl font-semibold leading-[1.3] tracking-[-0.015em] text-white">受講前の学生へ伝えたいこと</h2>
          <p className="app-section-description mt-2 text-[var(--secondary)]">授業の進め方、試験、課題、教授の対応など</p>
        </div>
        <label className="app-field-label mb-2.5 block text-[var(--text)]" htmlFor="review-content">レビュー本文</label>
        <textarea id="review-content" value={content} onChange={(e) => setContent(e.target.value)} required rows={9} className="w-full resize-y rounded-lg border border-slate-500/50 bg-[var(--elevated)] px-4 py-3.5 text-[15px] leading-7 text-[var(--text)] outline-none transition-colors duration-150 placeholder:text-[14px] placeholder:text-[var(--muted)] hover:border-slate-500 focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--focus)] motion-reduce:transition-none" placeholder="受講前に知りたかったことを書いてください" />
        <p className="app-metadata mt-2 text-right tabular-nums text-[var(--muted)]" aria-live="polite">{content.length}文字</p>
      </section>

      <section className="max-w-[720px] py-8 sm:py-10">
        <div className="mb-5">
          <h2 className="text-[18px] font-semibold leading-6 tracking-[-0.008em] text-white">総合的なおすすめ度</h2>
          <p className="app-metadata mt-1.5 text-[var(--secondary)]">この授業を他の学生へすすめたいか</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-[minmax(150px,0.55fr)_minmax(240px,1fr)] sm:items-center sm:gap-8">
          <div>
            <p className="text-[15px] font-medium text-[var(--text)]"><span className="text-[22px] font-semibold tabular-nums text-white">{rating}</span><span className="ml-1 text-[12px] text-[var(--muted)]">/ 5</span></p>
            <p className="app-metadata mt-1 text-[var(--secondary)]">{ratingMeaning(rating, 'おすすめしない', '普通', 'かなりおすすめ')}</p>
          </div>
          <div className="w-full max-w-[480px] sm:justify-self-end">
            <input aria-label="おすすめ度" type="range" min="1" max="5" value={rating} onChange={(e) => setRating(Number(e.target.value))} className="h-2 w-full cursor-pointer accent-[var(--accent)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--focus)]" />
            <div className="mt-2 flex justify-between px-0.5 text-[10px] tabular-nums text-[var(--muted)]" aria-hidden="true"><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span></div>
          </div>
        </div>
      </section>

      <section className="max-w-[820px] py-6 sm:py-8">
        <div className="mb-3">
          <h2 className="text-[15px] font-medium leading-6 text-white">補足評価</h2>
        </div>
        <div className="grid gap-1">
          {[
            { label: '難易度', value: difficulty, setValue: setDifficulty, meaning: ratingMeaning(difficulty, '簡単', '標準', '難しい') },
            { label: '宿題量', value: homeworkAmount, setValue: setHomeworkAmount, meaning: ratingMeaning(homeworkAmount, '少ない', '標準', '多い') },
            { label: 'サポート', value: supportQuality, setValue: setSupportQuality, meaning: ratingMeaning(supportQuality, '良くない', '普通', '良い') },
          ].map((item) => (
            <div key={item.label} className="grid gap-3 py-3 sm:grid-cols-[minmax(140px,0.5fr)_minmax(220px,1fr)] sm:items-center sm:gap-7">
              <div>
                <label className="app-field-label text-[var(--text)]">{item.label} <span className="ml-1.5 font-normal tabular-nums text-[var(--secondary)]">{item.value}/5</span></label>
                <p className="app-metadata mt-0.5 text-[var(--muted)]">{item.meaning}</p>
              </div>
              <div className="w-full max-w-[430px] sm:justify-self-end">
                <input aria-label={item.label} type="range" min="1" max="5" value={item.value} onChange={(e) => item.setValue(Number(e.target.value))} className="h-2 w-full cursor-pointer accent-[var(--accent)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--focus)]" />
                <div className="mt-1.5 flex justify-between px-0.5 text-[9px] tabular-nums text-[var(--muted)]" aria-hidden="true"><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span></div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-[560px] py-7 sm:py-8">
        <fieldset>
          <legend className="text-[14px] font-medium leading-6 text-white">授業形式・出席</legend>
          <div className="mt-3 flex flex-col overflow-hidden rounded-md border border-[var(--border)] sm:flex-row">
            {[
              { value: 'yes', label: '出席あり', help: '確認があります' },
              { value: 'no', label: '出席なし', help: '確認はありません' },
              { value: 'online', label: 'オンライン', help: '該当なし' },
            ].map((option) => (
              <label key={option.value} className="relative min-w-0 flex-1 cursor-pointer border-b border-[var(--divider)] last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
                <input type="radio" name="attendance" checked={attendanceRequired === option.value} onChange={() => setAttendanceRequired(option.value as 'yes' | 'no' | 'online')} className="peer sr-only" />
                <span className="flex min-h-11 items-center justify-between px-3 py-2 pr-8 text-[12px] font-normal leading-5 text-[var(--secondary)] transition-colors duration-150 peer-checked:bg-white/[0.035] peer-checked:font-medium peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-inset peer-focus-visible:ring-[var(--accent)] motion-reduce:transition-none">
                  <span><span className="block">{option.label}</span><span className="mt-1 block text-[12px] font-normal leading-4 text-[var(--muted)]">{option.help}</span></span>
                </span>
                <span aria-hidden="true" className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-[var(--accent)] opacity-0 transition-opacity duration-150 peer-checked:opacity-100 motion-reduce:transition-none">✓</span>
              </label>
            ))}
          </div>
        </fieldset>
      </section>

      <section className="flex max-w-[760px] flex-col gap-4 pb-10 pt-7 sm:flex-row sm:items-center sm:justify-between sm:pb-12">
        <p className="text-[13px] font-normal leading-5 text-[var(--secondary)]">{isFormValid() ? '投稿するとすぐに公開されます。' : '教授・授業・本文・出席形式を入力してください。'}</p>
        <button type="submit" disabled={loading || !isFormValid()} className="h-[50px] w-full rounded-lg bg-[var(--accent)] px-6 text-[14px] font-semibold leading-5 text-slate-950 transition-colors duration-150 hover:bg-[var(--accent-hover)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--focus)] active:translate-y-px disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-500 motion-reduce:transform-none motion-reduce:transition-none sm:w-auto sm:min-w-44">
          {loading ? '投稿中...' : 'レビューを投稿'}
        </button>
      </section>
    </form>
  );
}
