import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { AutocompleteInput } from './AutocompleteInput';
import { useSchool } from '../contexts/SchoolContext';
import type { ClassFormat, Semester } from '../lib/types';

interface RatingFieldProps {
  label: string;
  description: string;
  value: number;
  onChange: (value: number) => void;
}

function RatingField({ label, description, value, onChange }: RatingFieldProps) {
  return (
    <section className="max-w-[760px] border-t border-[var(--divider)] py-8 sm:py-10">
      <div className="grid gap-4 sm:grid-cols-[minmax(180px,0.7fr)_minmax(240px,1fr)] sm:items-center sm:gap-8">
        <div>
          <label className="text-[16px] font-medium leading-6 text-white" htmlFor={`review-${label}`}>
            {label}
          </label>
          <p className="app-metadata mt-1.5 text-[var(--secondary)]">{description}</p>
          <p className="mt-3 text-[15px] font-medium text-[var(--text)]">
            <span className="text-[22px] font-semibold tabular-nums text-white">{value}</span>
            <span className="ml-1 text-[12px] text-[var(--muted)]">/ 5</span>
          </p>
        </div>
        <div className="w-full max-w-[480px] sm:justify-self-end">
          <input
            id={`review-${label}`}
            aria-label={label}
            type="range"
            min="1"
            max="5"
            value={value}
            onChange={(event) => onChange(Number(event.target.value))}
            className="h-11 w-full cursor-pointer accent-[var(--accent)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--focus)]"
          />
          <div className="mt-2 flex justify-between px-0.5 text-[10px] tabular-nums text-[var(--muted)]" aria-hidden="true">
            <span>1</span><span>2</span><span>3</span><span>4</span><span>5</span>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function ReviewForm({ onReviewSubmitted }: { onReviewSubmitted: () => void }) {
  const { user } = useAuth();
  const { currentSchool } = useSchool();
  const currentYear = new Date().getFullYear();

  const [professorInput, setProfessorInput] = useState('');
  const [selectedProfessorId, setSelectedProfessorId] = useState<string | null>(null);
  const [courseInput, setCourseInput] = useState('');
  const [coursePrefix, setCoursePrefix] = useState<string | null>(null);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [courseContextMessage, setCourseContextMessage] = useState<string | null>(null);
  const [professorQuality, setProfessorQuality] = useState(3);
  const [easyA, setEasyA] = useState(3);
  const [courseQuality, setCourseQuality] = useState(3);
  const [recommendation, setRecommendation] = useState(3);
  const [classFormat, setClassFormat] = useState<ClassFormat | null>(null);
  const [yearTaken, setYearTaken] = useState(currentYear);
  const [semester, setSemester] = useState<Semester | null>(null);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);

  const searchProfessors = async (query: string) => {
    const { data, error } = await supabase
      .from('professors')
      .select('id, name')
      .eq('school_id', currentSchool!.id)
      .ilike('name', `%${query}%`)
      .order('name')
      .limit(10);

    if (error) {
      console.error('教授を検索できませんでした。');
      throw new Error('教授を検索できませんでした。');
    }

    return (data || []).map((professor) => ({ id: professor.id, label: professor.name }));
  };

  const searchCourses = async (query: string) => {
    const normalizedQuery = query.trim();
    const pattern = coursePrefix
      ? (!normalizedQuery
          ? `${coursePrefix}%`
          : normalizedQuery.toUpperCase().startsWith(coursePrefix.toUpperCase())
            ? `${normalizedQuery}%`
            : `${coursePrefix}%${normalizedQuery}%`)
      : (normalizedQuery ? `%${normalizedQuery}%` : '%');

    const { data, error } = await supabase
      .from('courses')
      .select('id, code')
      .eq('school_id', currentSchool!.id)
      .ilike('code', pattern)
      .limit(30);

    if (error) {
      console.error('授業を検索できませんでした。');
      throw new Error('授業を検索できませんでした。');
    }

    const parseCourse = (code: string) => {
      const match = code.trim().match(/^([A-Za-z&]+)\s*(\d+)(.*)$/);
      if (!match) return { subject: code.trim().toUpperCase(), number: Number.MAX_SAFE_INTEGER, tail: '' };
      return {
        subject: match[1].toUpperCase(),
        number: Number.parseInt(match[2], 10),
        tail: (match[3] || '').trim().toUpperCase(),
      };
    };

    return (data ?? [])
      .slice()
      .sort((left, right) => {
        const a = parseCourse(left.code);
        const b = parseCourse(right.code);
        if (a.subject !== b.subject) return a.subject.localeCompare(b.subject);
        if (a.number !== b.number) return a.number - b.number;
        return a.tail.localeCompare(b.tail);
      })
      .map((course) => ({ id: course.id, label: course.code }));
  };

  const handleProfessorChange = async (value: string, id: string | null) => {
    setProfessorInput(value);
    setSelectedProfessorId(id);
    setCourseInput('');
    setSelectedCourseId(null);
    setCoursePrefix(null);

    if (!id) {
      setCourseContextMessage(null);
      return;
    }

    setCourseContextMessage('関連する授業を確認しています...');
    const { data, error } = await supabase
      .from('professor_courses')
      .select('course_id')
      .eq('school_id', currentSchool!.id)
      .eq('professor_id', id)
      .limit(200);

    if (error) {
      console.error('教授に対応する授業を取得できませんでした。');
      setCourseContextMessage('関連する授業を確認できませんでした。全授業から検索できます。');
      return;
    }

    const courseIds = (data ?? [])
      .map((row: { course_id: string | null }) => row.course_id)
      .filter((courseId): courseId is string => Boolean(courseId));

    if (courseIds.length === 0) {
      setCourseContextMessage('この教授に登録されている授業がないため、全授業から検索できます。');
      return;
    }

    const { data: courseRows, error: courseError } = await supabase
      .from('courses')
      .select('code')
      .eq('school_id', currentSchool!.id)
      .in('id', courseIds);

    if (courseError) {
      setCourseContextMessage('関連する授業を確認できませんでした。全授業から検索できます。');
      return;
    }

    const prefixCounts = new Map<string, number>();
    for (const course of courseRows ?? []) {
      const prefix = course.code?.split(' ')[0];
      if (prefix) prefixCounts.set(prefix, (prefixCounts.get(prefix) ?? 0) + 1);
    }
    setCoursePrefix([...prefixCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null);
    setCourseContextMessage('選択した教授に関連する科目を優先して表示します。');
  };

  const isFormValid = () => Boolean(
    selectedProfessorId
    && selectedCourseId
    && classFormat
    && semester
    && content.trim(),
  );

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user || !currentSchool || !selectedProfessorId || !selectedCourseId || !classFormat || !semester || !isFormValid()) return;

    setLoading(true);
    const { error } = await supabase.from('reviews').insert({
      school_id: currentSchool.id,
      user_id: user.id,
      professor_id: selectedProfessorId,
      course_id: selectedCourseId,
      review_schema_version: 2,
      rating: null,
      difficulty: null,
      homework_amount: null,
      support_quality: null,
      attendance_required: null,
      professor_quality: professorQuality,
      easy_a: easyA,
      course_quality: courseQuality,
      recommendation,
      class_format: classFormat,
      year_taken: yearTaken,
      semester,
      content: content.trim(),
    });

    if (!error) {
      setProfessorInput('');
      setSelectedProfessorId(null);
      setCourseInput('');
      setSelectedCourseId(null);
      setCoursePrefix(null);
      setProfessorQuality(3);
      setEasyA(3);
      setCourseQuality(3);
      setRecommendation(3);
      setClassFormat(null);
      setYearTaken(currentYear);
      setSemester(null);
      setContent('');
      alert('レビューを投稿しました');
      onReviewSubmitted();
    } else {
      console.error('レビューを投稿できませんでした。');
      alert('エラーが発生しました');
    }
    setLoading(false);
  };

  return (
    <form onSubmit={handleSubmit}>
      <section className="max-w-4xl pb-11 pt-2 sm:pb-14 sm:pt-4">
        <div className="mb-7">
          <h2 className="text-xl font-semibold leading-[1.3] tracking-[-0.015em] text-white">教授と授業</h2>
          <p className="app-metadata mt-2 text-[var(--secondary)]">受講した教授と授業を候補から選択してください。</p>
        </div>
        <div className="grid gap-6 md:grid-cols-2 md:gap-5">
          <AutocompleteInput label="教授" value={professorInput} selectedId={selectedProfessorId} onSearch={searchProfessors} onChange={handleProfessorChange} placeholder="教授を検索" required />
          <div>
            <AutocompleteInput label="授業" value={courseInput} selectedId={selectedCourseId} onSearch={searchCourses} onChange={(value, id) => { setCourseInput(value); setSelectedCourseId(id); }} placeholder="授業を検索" required />
            {selectedProfessorId && !selectedCourseId && courseContextMessage && <p className="app-metadata mt-2 text-[var(--secondary)]" aria-live="polite">{courseContextMessage}</p>}
          </div>
        </div>
      </section>

      <RatingField label="教授の質" description="教え方・説明・対応を含めて評価" value={professorQuality} onChange={setProfessorQuality} />
      <RatingField label="Easy A度" description="5に近いほどAを取りやすい" value={easyA} onChange={setEasyA} />
      <RatingField label="授業の質" description="授業内容・構成・学びやすさ" value={courseQuality} onChange={setCourseQuality} />
      <RatingField label="おすすめ度" description="他の学生におすすめしたいか" value={recommendation} onChange={setRecommendation} />

      <section className="max-w-[760px] border-t border-[var(--divider)] py-8 sm:py-10">
        <fieldset>
          <legend className="text-[16px] font-medium leading-6 text-white">授業形式</legend>
          <div className="mt-4 grid overflow-hidden rounded-md border border-[var(--border)] sm:grid-cols-3">
            {([
              ['in_person', '対面'],
              ['online', 'オンライン'],
              ['hybrid', 'ハイブリッド'],
            ] as const).map(([value, label]) => (
              <label key={value} className="relative cursor-pointer border-b border-[var(--divider)] last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
                <input type="radio" name="class-format" checked={classFormat === value} onChange={() => setClassFormat(value)} className="peer sr-only" />
                <span className="flex min-h-12 items-center justify-center px-4 text-[13px] text-[var(--secondary)] peer-checked:bg-white/[0.045] peer-checked:font-medium peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-inset peer-focus-visible:ring-[var(--accent)]">{label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </section>

      <section className="max-w-[760px] border-t border-[var(--divider)] py-8 sm:py-10">
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="review-year" className="app-field-label mb-2.5 block text-[var(--text)]">受講年</label>
            <select id="review-year" value={yearTaken} onChange={(event) => setYearTaken(Number(event.target.value))} className="h-[50px] w-full rounded-lg border border-[var(--border)] bg-[var(--elevated)] px-4 text-[15px] text-[var(--text)] outline-none focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--focus)]">
              {Array.from({ length: 15 }, (_, index) => currentYear - index).map((year) => <option key={year} value={year}>{year}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="review-semester" className="app-field-label mb-2.5 block text-[var(--text)]">Semester</label>
            <select id="review-semester" value={semester ?? ''} onChange={(event) => setSemester((event.target.value || null) as Semester | null)} required className="h-[50px] w-full rounded-lg border border-[var(--border)] bg-[var(--elevated)] px-4 text-[15px] text-[var(--text)] outline-none focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--focus)]">
              <option value="">選択してください</option>
              <option value="spring">Spring</option>
              <option value="summer">Summer</option>
              <option value="fall">Fall</option>
              <option value="winter">Winter</option>
            </select>
          </div>
        </div>
      </section>

      <section className="max-w-[760px] border-t border-[var(--divider)] pb-8 pt-10 sm:pb-10 sm:pt-12">
        <label className="text-[16px] font-medium leading-6 text-white" htmlFor="review-content">コメント</label>
        <p className="app-section-description mb-5 mt-1.5 text-[var(--secondary)]">授業の進め方、試験、課題、教授の対応など</p>
        <textarea id="review-content" value={content} onChange={(event) => setContent(event.target.value)} required rows={9} className="w-full resize-y rounded-lg border border-slate-500/50 bg-[var(--elevated)] px-4 py-3.5 text-[15px] leading-7 text-[var(--text)] outline-none placeholder:text-[14px] placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--focus)]" placeholder="受講前に知りたかったことを書いてください" />
        <p className="app-metadata mt-2 text-right tabular-nums text-[var(--muted)]" aria-live="polite">{content.length}文字</p>
      </section>

      <section className="flex max-w-[760px] flex-col gap-4 pb-10 pt-4 sm:flex-row sm:items-center sm:justify-between sm:pb-12">
        <p className="text-[13px] leading-5 text-[var(--secondary)]">{isFormValid() ? '投稿するとすぐに公開されます。' : '教授・授業・授業形式・Semester・コメントを入力してください。'}</p>
        <button type="submit" disabled={loading || !isFormValid()} className="h-[50px] w-full rounded-lg bg-[var(--accent)] px-6 text-[14px] font-semibold text-slate-950 transition-colors hover:bg-[var(--accent-hover)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--focus)] disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-500 sm:w-auto sm:min-w-44">
          {loading ? '投稿中...' : 'レビューを投稿'}
        </button>
      </section>
    </form>
  );
}
