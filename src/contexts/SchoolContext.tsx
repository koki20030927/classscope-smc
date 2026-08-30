import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { School } from '../lib/types';
import { useAuth } from './AuthContext';

interface SchoolContextType {
  schools: School[];
  currentSchool: School | null;
  loading: boolean;
  error: string | null;
  selectSchool: (school: School) => void;
  clearSchool: () => void;
  reloadSchools: () => Promise<void>;
}

const SchoolContext = createContext<SchoolContextType | undefined>(undefined);

export function SchoolProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [schools, setSchools] = useState<School[]>([]);
  const [currentSchool, setCurrentSchool] = useState<School | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reloadSchools = async () => {
    if (!user) return;

    setLoading(true);
    setError(null);
    const { data, error: schoolsError } = await supabase
      .from('schools')
      .select('id, name, slug, short_name, is_active, created_at')
      .order('name');

    if (schoolsError) {
      setSchools([]);
      setError('大学一覧を読み込めませんでした。少し時間をおいて再度お試しください。');
    } else {
      setSchools((data ?? []) as School[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    setCurrentSchool(null);
    if (!user) {
      setSchools([]);
      setError(null);
      setLoading(false);
      return;
    }
    void reloadSchools();
  }, [user]);

  const selectSchool = (school: School) => {
    if (school.is_active) setCurrentSchool(school);
  };

  return (
    <SchoolContext.Provider
      value={{
        schools,
        currentSchool,
        loading,
        error,
        selectSchool,
        clearSchool: () => setCurrentSchool(null),
        reloadSchools,
      }}
    >
      {children}
    </SchoolContext.Provider>
  );
}

export function useSchool() {
  const context = useContext(SchoolContext);
  if (!context) throw new Error('useSchool must be used within a SchoolProvider');
  return context;
}
