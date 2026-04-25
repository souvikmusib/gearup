'use client';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from '@/lib/api/client';
import type { MeResponse } from '@gearup/types';

interface AuthCtx {
  user: MeResponse | null;
  loading: boolean;
  login: (token: string) => Promise<void>;
  logout: () => void;
  hasPermission: (p: string) => boolean;
}

const AuthContext = createContext<AuthCtx>({ user: null, loading: true, login: async () => {}, logout: () => {}, hasPermission: () => false });
const USER_CACHE_KEY = 'gearup_user';

function readCachedUser(): MeResponse | null {
  try {
    const raw = localStorage.getItem(USER_CACHE_KEY);
    return raw ? (JSON.parse(raw) as MeResponse) : null;
  } catch {
    return null;
  }
}

function writeCachedUser(user: MeResponse | null) {
  if (user) localStorage.setItem(USER_CACHE_KEY, JSON.stringify(user));
  else localStorage.removeItem(USER_CACHE_KEY);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchMe = async ({ keepCurrent = false } = {}) => {
    const token = localStorage.getItem('gearup_token');
    if (!token) {
      writeCachedUser(null);
      setUser(null);
      setLoading(false);
      return;
    }
    if (!keepCurrent) setLoading(true);
    const res = await api.get<MeResponse>('/admin/auth/me');
    if (res.success && res.data) {
      setUser(res.data);
      writeCachedUser(res.data);
    }
    else {
      localStorage.removeItem('gearup_token');
      localStorage.removeItem('gearup_demo');
      writeCachedUser(null);
      setUser(null);
      api.clearCache();
    }
    setLoading(false);
  };

  useEffect(() => {
    const token = localStorage.getItem('gearup_token');
    if (!token) {
      setLoading(false);
      return;
    }

    const cachedUser = readCachedUser();
    if (cachedUser) {
      setUser(cachedUser);
      setLoading(false);
      void fetchMe({ keepCurrent: true });
      return;
    }

    void fetchMe();
  }, []);

  const login = async (token: string) => {
    api.clearCache();
    writeCachedUser(null);
    localStorage.setItem('gearup_token', token);
    await fetchMe();
  };
  const logout = () => {
    localStorage.removeItem('gearup_token');
    localStorage.removeItem('gearup_demo');
    writeCachedUser(null);
    api.clearCache();
    setUser(null);
  };
  const hasPermission = (p: string) => !!user?.permissions.includes(p);

  return <AuthContext.Provider value={{ user, loading, login, logout, hasPermission }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
