import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Professor } from '../lib/types';
import { Plus, X } from 'lucide-react';

export function ProfessorManager() {
  const [professors, setProfessors] = useState<Professor[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [newProfessorName, setNewProfessorName] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadProfessors();
  }, []);

  const loadProfessors = async () => {
    const { data, error } = await supabase
      .from('professors')
      .select('*')
      .order('name');

    if (!error && data) {
      setProfessors(data);
    }
  };

  const handleAddProfessor = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { error } = await supabase
      .from('professors')
      .insert({ name: newProfessorName });

    if (!error) {
      setNewProfessorName('');
      setShowForm(false);
      loadProfessors();
    } else {
      alert('エラーが発生しました');
    }
    setLoading(false);
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold text-gray-800">教授一覧</h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
        >
          {showForm ? <X size={20} /> : <Plus size={20} />}
          {showForm ? 'キャンセル' : '教授を追加'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleAddProfessor} className="mb-4 p-4 bg-gray-50 rounded">
          <input
            type="text"
            value={newProfessorName}
            onChange={(e) => setNewProfessorName(e.target.value)}
            placeholder="教授名を入力"
            required
            className="w-full px-3 py-2 border border-gray-300 rounded mb-2"
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
        {professors.map((professor) => (
          <div key={professor.id} className="p-3 border border-gray-200 rounded hover:bg-gray-50">
            {professor.name}
          </div>
        ))}
        {professors.length === 0 && (
          <p className="text-gray-500 text-center py-4">教授が登録されていません</p>
        )}
      </div>
    </div>
  );
}
