import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Course } from '../lib/types';
import { Plus, X } from 'lucide-react';

export function CourseManager() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [newCourseCode, setNewCourseCode] = useState('');
  const [newCourseName, setNewCourseName] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadCourses();
  }, []);

  const loadCourses = async () => {
    const { data, error } = await supabase
      .from('courses')
      .select('*')
      .order('code');

    if (!error && data) {
      setCourses(data);
    }
  };

  const handleAddCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { error } = await supabase
      .from('courses')
      .insert({ code: newCourseCode, name: newCourseName });

    if (!error) {
      setNewCourseCode('');
      setNewCourseName('');
      setShowForm(false);
      loadCourses();
    } else {
      alert('エラーが発生しました');
    }
    setLoading(false);
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold text-gray-800">授業一覧</h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
        >
          {showForm ? <X size={20} /> : <Plus size={20} />}
          {showForm ? 'キャンセル' : '授業を追加'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleAddCourse} className="mb-4 p-4 bg-gray-50 rounded space-y-2">
          <input
            type="text"
            value={newCourseCode}
            onChange={(e) => setNewCourseCode(e.target.value)}
            placeholder="授業コード（例: MATH 8）"
            required
            className="w-full px-3 py-2 border border-gray-300 rounded"
          />
          <input
            type="text"
            value={newCourseName}
            onChange={(e) => setNewCourseName(e.target.value)}
            placeholder="授業名"
            required
            className="w-full px-3 py-2 border border-gray-300 rounded"
          />
          <button
            type="submit"
            disabled={loading}
            className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition disabled:opacity-50"
          >
            {loading ? '追加中...' : '追加'}
          </button>
        </form>
      )}

      <div className="space-y-2">
        {courses.map((course) => (
          <div key={course.id} className="p-3 border border-gray-200 rounded hover:bg-gray-50">
            <div className="font-semibold">{course.code}</div>
            <div className="text-sm text-gray-600">{course.name}</div>
          </div>
        ))}
        {courses.length === 0 && (
          <p className="text-gray-500 text-center py-4">授業が登録されていません</p>
        )}
      </div>
    </div>
  );
}
