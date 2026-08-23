import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from 'react';
import type { User } from '../types';
import { getStoredUser, setStoredUser, removeStoredUser, removeSessionItem } from '../lib/storage';
import { isAdminRole } from '../lib/chords';

interface AuthContextValue {
  user: User | null;
  isAdmin: boolean;
  login: (user: User) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => getStoredUser());

  const login = useCallback((u: User) => {
    setUser(u);
    setStoredUser(u);
    removeSessionItem('cv_browse_query');
    removeSessionItem('cv_browse_lang');
    removeSessionItem('cv_browse_show_filters');
    removeSessionItem('cv_browse_page');
    removeSessionItem('cv_mysongs_query');
    removeSessionItem('cv_mysongs_page');
    removeSessionItem('cv_publicsetlists_query');
    removeSessionItem('cv_publicsetlists_date_from');
    removeSessionItem('cv_publicsetlists_date_to');
    removeSessionItem('cv_publicsetlists_show_dates');
    removeSessionItem('cv_publicsetlists_page');
    removeSessionItem('cv_setlists_query');
    removeSessionItem('cv_setlists_date_from');
    removeSessionItem('cv_setlists_date_to');
    removeSessionItem('cv_setlists_show_dates');
    removeSessionItem('cv_setlists_page');
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    removeStoredUser();
    removeSessionItem('cv_browse_query');
    removeSessionItem('cv_browse_lang');
    removeSessionItem('cv_browse_show_filters');
    removeSessionItem('cv_browse_page');
    removeSessionItem('cv_mysongs_query');
    removeSessionItem('cv_mysongs_page');
    removeSessionItem('cv_publicsetlists_query');
    removeSessionItem('cv_publicsetlists_date_from');
    removeSessionItem('cv_publicsetlists_date_to');
    removeSessionItem('cv_publicsetlists_show_dates');
    removeSessionItem('cv_publicsetlists_page');
    removeSessionItem('cv_setlists_query');
    removeSessionItem('cv_setlists_date_from');
    removeSessionItem('cv_setlists_date_to');
    removeSessionItem('cv_setlists_show_dates');
    removeSessionItem('cv_setlists_page');
  }, []);

  const isAdmin = useMemo(() => (user ? isAdminRole(user.role) : false), [user]);

  const value = useMemo(() => ({ user, isAdmin, login, logout }), [user, isAdmin, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
