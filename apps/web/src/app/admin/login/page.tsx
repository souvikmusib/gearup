'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api/client';
import { useAuth } from '@/lib/auth/auth-context';
import { Eye, EyeOff } from 'lucide-react';

export default function AdminLoginPage() {
  const [adminUserId, setAdminUserId] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const router = useRouter();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setLoading(true);

    // Try real API first, fall back to demo mode if backend is unreachable
    try {
      const res = await api.post<{ token: string }>('/admin/auth/login', { adminUserId, password });
      setLoading(false);
      if (res.success && res.data) { login(res.data.token); router.push('/admin/dashboard'); return; }
      else setError(res.error?.message || 'Login failed');
    } catch {
      // Backend unreachable — use demo mode
      if (adminUserId === 'superadmin' && password === 'admin123') {
        const demoToken = 'demo-token';
        localStorage.setItem('gearup_token', demoToken);
        localStorage.setItem('gearup_demo', 'true');
        router.push('/admin/dashboard');
      } else {
        setError('Backend unavailable. Demo login: superadmin / admin123');
      }
      setLoading(false);
    }
  };

  const inputCls = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white';

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-950 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">⚙️ GearUp Admin</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Sign in to manage your garage</p>
        </div>

        {error && <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">{error}</div>}

        <form onSubmit={submit} className="space-y-4">
          <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Admin User ID</label><input className={inputCls} required value={adminUserId} onChange={(e) => setAdminUserId(e.target.value)} /></div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Password</label>
            <div className="relative">
              <input type={showPw ? 'text' : 'password'} className={inputCls} required value={password} onChange={(e) => setPassword(e.target.value)} />
              <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-2.5 text-gray-400">{showPw ? <EyeOff size={16} /> : <Eye size={16} />}</button>
            </div>
          </div>
          <button type="submit" disabled={loading} className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white shadow hover:bg-blue-700 disabled:opacity-50">
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
