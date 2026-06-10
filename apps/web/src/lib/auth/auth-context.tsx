'use client';
// SECURITY NOTE (audit 2026-06-10, finding `token-in-localstorage-xss`):
// JWT is stored in localStorage so XSS anywhere in the SPA can exfiltrate
// the token (24h lifetime, no server-side revocation). The lib/auth.ts on
// the server now reads an `gearup_token` httpOnly cookie as a fallback, so
// the migration path is:
//   1. Update /api/admin/auth/login to also Set-Cookie: gearup_token=...
//      with httpOnly + Secure + SameSite=Strict (+ explicit Max-Age).
//   2. Add a /api/admin/auth/logout that clears the cookie.
//   3. Stop sending Authorization: Bearer from the api client and drop the
//      localStorage reads/writes below.
//   4. Add a CSRF token (or Origin check) on cookie-authed mutations.
// This is tracked as a cascading change and must land before public launch.
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
    // Fire-and-forget: clear the httpOnly cookie that the server-side
    // admin guard reads. Without this, a refresh of /admin/* after logout
    // would still be considered authenticated by the server layout.
    try { void fetch('/api/admin/auth/logout', { method: 'POST', credentials: 'same-origin' }); } catch { /* noop */ }
  };
  const hasPermission = (p: string) => !!user?.permissions.includes(p);

  return <AuthContext.Provider value={{ user, loading, login, logout, hasPermission }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
