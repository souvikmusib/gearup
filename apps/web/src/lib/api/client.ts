import type { ApiResponse } from '@gearup/types';

const BASE = '/api';
const GET_CACHE_TTL_MS = 120_000;

type CacheEntry = {
  data: ApiResponse<unknown>;
  expiresAt: number;
};

const responseCache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<ApiResponse<unknown>>>();

function now() {
  return Date.now();
}

function normalizePath(path: string) {
  return path.endsWith('?') ? path.slice(0, -1) : path;
}

function cacheKey(path: string) {
  // Auth identity now lives in an httpOnly cookie the browser cannot read, so
  // the cache key is scoped per-path. The cache is cleared on login/logout and
  // on any 401 response, which prevents cross-session bleed.
  return `GET:${path}`;
}

function clearGetCache() {
  responseCache.clear();
}

function isAdminSurface() {
  if (typeof window === 'undefined') return false;
  return window.location.pathname.startsWith('/admin');
}

function handleUnauthorized() {
  if (typeof window === 'undefined') return;
  // Best-effort cleanup of legacy localStorage entries; the real session lives
  // in an httpOnly cookie that only the server can clear via Set-Cookie.
  try {
    localStorage.removeItem('gearup_token');
    localStorage.removeItem('gearup_demo');
  } catch {
    // ignore storage access errors (private mode, etc.)
  }
  clearGetCache();
  // Only hijack navigation when the caller is actually on an admin page.
  // Public booking surfaces that hit a protected endpoint should receive the
  // 401 inline rather than being redirected to admin login.
  if (isAdminSurface()) {
    window.location.href = '/admin/login';
  }
}

async function request<T>(rawPath: string, opts: RequestInit = {}): Promise<ApiResponse<T>> {
  const path = normalizePath(rawPath);
  const method = (opts.method ?? 'GET').toUpperCase();
  const isGet = method === 'GET';
  const key = cacheKey(path);

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
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        ...opts.headers,
      },
    });
    if (res.status === 401) {
      handleUnauthorized();
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

function peek<T>(rawPath: string): { data: ApiResponse<T>; stale: boolean } | null {
  const path = normalizePath(rawPath);
  const entry = responseCache.get(cacheKey(path));
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

async function fetchAndStore<T>(rawPath: string): Promise<ApiResponse<T>> {
  const path = normalizePath(rawPath);
  const key = cacheKey(path);
  const pending = inFlight.get(key);
  if (pending) return (await pending) as ApiResponse<T>;

  const run = async (): Promise<ApiResponse<T>> => {
    const res = await fetch(`${BASE}${path}`, {
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    if (res.status === 401) {
      handleUnauthorized();
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
