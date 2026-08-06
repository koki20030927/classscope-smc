import { createContext, useContext, useEffect, useState } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  isAdminLoading: boolean;
  signUp: (email: string, password: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isAdminLoading, setIsAdminLoading] = useState(false);

  useEffect(() => {
    let active = true;
    let roleRequestId = 0;

    const updateAdminStatus = async (nextUser: User | null) => {
      const requestId = ++roleRequestId;
      setIsAdmin(false);

      if (!nextUser) {
        setIsAdminLoading(false);
        return;
      }

      setIsAdminLoading(true);
      const { data, error } = await supabase.rpc('is_admin');

      if (!active || requestId !== roleRequestId) return;

      if (error) {
        console.error('管理者権限を確認できませんでした。');
      }
      setIsAdmin(!error && data === true);
      setIsAdminLoading(false);
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!active) return;
      const nextUser = session?.user ?? null;
      setUser(nextUser);
      setLoading(false);
      void updateAdminStatus(nextUser);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      const nextUser = session?.user ?? null;
      setUser(nextUser);
      void updateAdminStatus(nextUser);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const signUp = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  return (
    <AuthContext.Provider value={{ user, loading, isAdmin, isAdminLoading, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
