import type { ApiResponse } from '@gearup/types';

const BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000/api';

async function request<T>(path: string, opts: RequestInit = {}): Promise<ApiResponse<T>> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('gearup_token') : null;
  try {
    const res = await fetch(`${BASE}${path}`, {
      ...opts,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...opts.headers,
      },
    });
    if (res.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem('gearup_token');
      localStorage.removeItem('gearup_demo');
      window.location.href = '/admin/login';
      return { success: false, error: { code: 'UNAUTHORIZED', message: 'Session expired' } };
    }
    return await res.json();
  } catch {
    return { success: false, error: { code: 'NETWORK_ERROR', message: 'Unable to reach server' } };
  }
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) => request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) => request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
