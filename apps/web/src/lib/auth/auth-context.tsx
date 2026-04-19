'use client';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from '@/lib/api/client';
import type { MeResponse } from '@gearup/types';

interface AuthCtx {
  user: MeResponse | null;
  loading: boolean;
  login: (token: string) => void;
  logout: () => void;
  hasPermission: (p: string) => boolean;
}

const AuthContext = createContext<AuthCtx>({ user: null, loading: true, login: () => {}, logout: () => {}, hasPermission: () => false });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchMe = async () => {
    const token = localStorage.getItem('gearup_token');
    if (!token) { setLoading(false); return; }

    // Demo mode — no backend needed
    if (localStorage.getItem('gearup_demo') === 'true') {
      setUser({ id: 'demo', adminUserId: 'superadmin', fullName: 'Super Admin', email: 'admin@gearupservicing.com', roles: ['SUPER_ADMIN'], permissions: [] });
      setLoading(false);
      return;
    }

    const res = await api.get<MeResponse>('/admin/auth/me');
    if (res.success && res.data) setUser(res.data);
    else localStorage.removeItem('gearup_token');
    setLoading(false);
  };

  useEffect(() => { fetchMe(); }, []);

  const login = async (token: string) => { localStorage.setItem('gearup_token', token); await fetchMe(); };
  const logout = () => { localStorage.removeItem('gearup_token'); localStorage.removeItem('gearup_demo'); setUser(null); };
  const hasPermission = (p: string) => !!user?.permissions.includes(p);

  return <AuthContext.Provider value={{ user, loading, login, logout, hasPermission }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
