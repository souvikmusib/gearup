import type { ApiResponse } from '@gearup/types';

const BASE = '/api';
const GET_CACHE_TTL_MS = 45_000;

type CacheEntry = {
  data: ApiResponse<unknown>;
  expiresAt: number;
};

const responseCache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<ApiResponse<unknown>>>();

function now() {
  return Date.now();
}

function cacheKey(path: string, token: string | null) {
  return `GET:${token ?? 'public'}:${path}`;
}

function clearGetCache() {
  responseCache.clear();
}

async function request<T>(path: string, opts: RequestInit = {}): Promise<ApiResponse<T>> {
  const method = (opts.method ?? 'GET').toUpperCase();
  const isGet = method === 'GET';
  const token = typeof window !== 'undefined' ? localStorage.getItem('gearup_token') : null;
  const key = cacheKey(path, token);

  if (isGet) {
    const cached = responseCache.get(key);
    if (cached && cached.expiresAt > now()) {
      return cached.data as ApiResponse<T>;
    }
    const pending = inFlight.get(key);
    if (pending) return (await pending) as ApiResponse<T>;
  }

  const run = async (): Promise<ApiResponse<T>> => {
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
      clearGetCache();
      window.location.href = '/admin/login';
      return { success: false, error: { code: 'UNAUTHORIZED', message: 'Session expired' } };
    }
    const payload = (await res.json()) as ApiResponse<T>;
    if (isGet && payload.success) {
      responseCache.set(key, { data: payload as ApiResponse<unknown>, expiresAt: now() + GET_CACHE_TTL_MS });
    }
    if (!isGet && payload.success) {
      clearGetCache();
    }
    return payload;
  };

  if (isGet) {
    const pending = run().catch(() => ({ success: false, error: { code: 'NETWORK_ERROR', message: 'Unable to reach server' } } as ApiResponse<T>));
    inFlight.set(key, pending as Promise<ApiResponse<unknown>>);
    try {
      return await pending;
    } finally {
      inFlight.delete(key);
    }
  }

  try {
    return await run();
  } catch {
    return { success: false, error: { code: 'NETWORK_ERROR', message: 'Unable to reach server' } };
  }
}

function peek<T>(path: string): { data: ApiResponse<T>; stale: boolean } | null {
  const token = typeof window !== 'undefined' ? localStorage.getItem('gearup_token') : null;
  const entry = responseCache.get(cacheKey(path, token));
  if (!entry) return null;
  return {
    data: entry.data as ApiResponse<T>,
    stale: entry.expiresAt <= now(),
  };
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) => request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) => request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  getSWR: <T>(path: string) => {
    const cached = peek<T>(path);
    const promise = cached?.stale ? fetchAndStore<T>(path) : request<T>(path);
    return { cached: cached?.data ?? null, promise };
  },
  prefetch: (path: string) => request(path).then(() => undefined),
  clearCache: () => clearGetCache(),
};

async function fetchAndStore<T>(path: string): Promise<ApiResponse<T>> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('gearup_token') : null;
  const key = cacheKey(path, token);
  const pending = inFlight.get(key);
  if (pending) return (await pending) as ApiResponse<T>;

  const run = async (): Promise<ApiResponse<T>> => {
    const res = await fetch(`${BASE}${path}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    if (res.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem('gearup_token');
      localStorage.removeItem('gearup_demo');
      clearGetCache();
      window.location.href = '/admin/login';
      return { success: false, error: { code: 'UNAUTHORIZED', message: 'Session expired' } };
    }
    const payload = (await res.json()) as ApiResponse<T>;
    if (payload.success) {
      responseCache.set(key, { data: payload as ApiResponse<unknown>, expiresAt: now() + GET_CACHE_TTL_MS });
    }
    return payload;
  };

  const req = run().catch(
    () => ({ success: false, error: { code: 'NETWORK_ERROR', message: 'Unable to reach server' } } as ApiResponse<T>),
  );
  inFlight.set(key, req as Promise<ApiResponse<unknown>>);
  try {
    return await req;
  } finally {
    inFlight.delete(key);
  }
}
