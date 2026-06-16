import { useState } from 'react';
import { useAuth } from './contexts/AuthContext';
import { Auth } from './components/Auth';
import { ProfessorManager } from './components/ProfessorManager';
import { CourseManager } from './components/CourseManager';
import ReviewForm from './components/ReviewForm';

import { ReviewList } from './components/ReviewList';
import { ProfessorStats } from './components/ProfessorStats';
import { LogOut } from 'lucide-react';

function App() {
  const { user, loading, signOut } = useAuth();
  const [reviewRefresh, setReviewRefresh] = useState(0);
  const [activeTab, setActiveTab] = useState<'reviews' | 'professors' | 'courses'>('reviews');

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <p className="text-gray-600">読み込み中...</p>
      </div>
    );
  }

  if (!user) {
    return <Auth />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">ClassScope SMC</h1>
            <p className="text-xs text-gray-600">※ Santa Monica College 公式サイトではありません</p>
          </div>
          <button
            onClick={signOut}
            className="flex items-center gap-2 px-4 py-2 text-gray-700 hover:bg-gray-100 rounded transition"
          >
            <LogOut size={20} />
            ログアウト
          </button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-6 flex gap-2">
          <button
            onClick={() => setActiveTab('reviews')}
            className={`px-4 py-2 rounded transition ${
              activeTab === 'reviews'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            レビュー
          </button>
          <button
            onClick={() => setActiveTab('professors')}
            className={`px-4 py-2 rounded transition ${
              activeTab === 'professors'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            教授管理
          </button>
          <button
            onClick={() => setActiveTab('courses')}
            className={`px-4 py-2 rounded transition ${
              activeTab === 'courses'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            授業管理
          </button>
        </div>

        {activeTab === 'reviews' && (
          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1">
              <ReviewForm onReviewSubmitted={() => setReviewRefresh(prev => prev + 1)} />
            </div>
            <div className="lg:col-span-1">
              <ReviewList refresh={reviewRefresh} />
            </div>
            <div className="lg:col-span-1">
              <ProfessorStats refresh={reviewRefresh} />
            </div>
          </div>
        )}

        {activeTab === 'professors' && <ProfessorManager />}

        {activeTab === 'courses' && <CourseManager />}
      </div>
    </div>
  );
}

export default App;
