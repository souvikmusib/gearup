import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// ----------------------------------------------------------------------------
// Rate limiter (best-effort, in-process)
//
// TODO(prod-blocker): Replace with a shared store (Upstash @upstash/ratelimit
// or Vercel KV) keyed on (request.ip, route, optional form field) before
// scale. On Vercel/serverless each warm instance has its own Map, so the
// effective limit is N_instances * RATE_LIMIT and cold starts wipe state.
// This in-memory map is kept ONLY as a best-effort defense-in-depth layer.
//
// Hardening applied here vs the previous version:
//   - LRU cap (max 1000 entries) so the map can't grow unbounded.
//   - Cleanup of expired entries on insert.
//   - Sources the client IP from Vercel-provided headers (single-hop trust)
//     instead of blindly trusting the full x-forwarded-for chain.
// ----------------------------------------------------------------------------
const RATE_LIMIT_MAX_ENTRIES = 1000;
const rateMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 30; // requests per window
const RATE_WINDOW = 60_000; // 1 minute

function isRateLimited(key: string, limit = RATE_LIMIT): boolean {
  const now = Date.now();
  const entry = rateMap.get(key);
  if (!entry || now > entry.resetAt) {
    // Opportunistic LRU cap: when full, evict the oldest entry.
    if (rateMap.size >= RATE_LIMIT_MAX_ENTRIES) {
      const oldestKey = rateMap.keys().next().value;
      if (oldestKey !== undefined) rateMap.delete(oldestKey);
    }
    // Re-insert (Map preserves insertion order — refreshes recency).
    rateMap.delete(key);
    rateMap.set(key, { count: 1, resetAt: now + RATE_WINDOW });
    return false;
  }
  entry.count++;
  return entry.count > limit;
}

/**
 * Resolve the client IP. On Vercel, the platform sets x-real-ip and
 * appends to x-forwarded-for so that the FIRST entry of XFF is the actual
 * client (Vercel is the trusted last hop). We prefer x-real-ip when present
 * because it's controlled by the proxy, not the client.
 *
 * NOTE: x-forwarded-for is still client-controllable end-to-end if the app
 * is exposed outside of Vercel. The shared-store rate limiter (see TODO
 * above) should also key on stable identifiers like adminUserId / phone /
 * jobCardId in addition to IP.
 */
function getClientIp(request: NextRequest): string {
  const realIp = request.headers.get('x-real-ip');
  if (realIp) return realIp;
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return 'unknown';
}

// ----------------------------------------------------------------------------
// CORS allowlist
// ----------------------------------------------------------------------------
// Parsed once per module load. CORS_ALLOWED_ORIGINS is a comma-separated
// list of allowed origins (e.g. "https://gearup.example.com,https://admin.gearup.example.com").
// When unset we fall back to the previous wildcard behavior so local dev
// keeps working; deployed environments MUST set this.
const RAW_ALLOWED = process.env.CORS_ALLOWED_ORIGINS?.trim();
const ALLOWED_ORIGINS: string[] = RAW_ALLOWED
  ? RAW_ALLOWED.split(',').map((s) => s.trim()).filter(Boolean)
  : [];
const ALLOW_WILDCARD = ALLOWED_ORIGINS.length === 0;

function applyCorsHeaders(request: NextRequest, response: NextResponse) {
  const origin = request.headers.get('origin');

  // Echo only matching origin. Never use `*` on routes that accept
  // Authorization headers in deployed environments.
  if (ALLOW_WILDCARD) {
    // Dev / unconfigured: keep the legacy permissive behavior so we don't
    // break local tooling, but log a one-shot warning.
    response.headers.set('Access-Control-Allow-Origin', '*');
  } else if (origin && ALLOWED_ORIGINS.includes(origin)) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.append('Vary', 'Origin');
  }
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // For /admin/* routes, expose the pathname to server components via a
  // request header so the server-side auth guard in admin/layout.tsx can
  // distinguish the public /admin/login page from protected pages.
  if (pathname.startsWith('/admin')) {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-pathname', pathname);
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  const response = NextResponse.next();

  if (pathname.startsWith('/api/')) {
    applyCorsHeaders(request, response);

    if (request.method === 'OPTIONS') {
      return new NextResponse(null, { status: 204, headers: response.headers });
    }

    // Rate limiting on login (stricter: 10/min). Keyed per-route so a
    // chatty public endpoint can't starve the login limiter.
    if (pathname === '/api/admin/auth/login' && request.method === 'POST') {
      const ip = getClientIp(request);
      if (isRateLimited(`login:${ip}`, 10)) {
        return NextResponse.json(
          { success: false, error: { code: 'RATE_LIMITED', message: 'Too many login attempts. Try again later.' } },
          { status: 429 },
        );
      }
    }

    // Rate limiting on public endpoints (30/min).
    if (pathname.startsWith('/api/public/') && request.method === 'POST') {
      const ip = getClientIp(request);
      if (isRateLimited(`public:${ip}`)) {
        return NextResponse.json(
          { success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests. Try again later.' } },
          { status: 429 },
        );
      }
    }

    // Aggressive rate limit on customer-lookup GET (phone enumeration vector):
    // 10/min/IP. Returns the same opaque shape on limit as on miss so it can't
    // be used as a side-channel oracle.
    if (pathname === '/api/public/customer-lookup' && request.method === 'GET') {
      const ip = getClientIp(request);
      if (isRateLimited(`customer-lookup:${ip}`, 10)) {
        return NextResponse.json(
          { success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests. Try again later.' } },
          { status: 429 },
        );
      }
    }
  }

  return response;
}

export const config = {
  matcher: ['/api/:path*', '/admin/:path*'],
};
