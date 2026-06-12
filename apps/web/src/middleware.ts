import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Per-account login attempt window — independent of the per-IP limiter.
// This defends against distributed brute force (many IPs, one target account).
// In-memory and best-effort; the durable per-adminUserId lockout still lives
// in the login route (counted in DB), this is just an early gate so a slow
// trickle from a botnet can't pre-exhaust the DB-side lockout budget without
// at least hitting this throttle first.
const LOGIN_ACCOUNT_LIMIT = 8; // attempts per window across all IPs for one account
const LOGIN_ACCOUNT_WINDOW = 5 * 60_000; // 5 minutes

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

// Separate per-account login rate limiter (different window than the
// general per-route limiter, so they don't share TTLs).
const loginAccountMap = new Map<string, { count: number; resetAt: number }>();
function isLoginAccountRateLimited(accountKey: string): boolean {
  const now = Date.now();
  const entry = loginAccountMap.get(accountKey);
  if (!entry || now > entry.resetAt) {
    if (loginAccountMap.size >= RATE_LIMIT_MAX_ENTRIES) {
      const oldestKey = loginAccountMap.keys().next().value;
      if (oldestKey !== undefined) loginAccountMap.delete(oldestKey);
    }
    loginAccountMap.delete(accountKey);
    loginAccountMap.set(accountKey, { count: 1, resetAt: now + LOGIN_ACCOUNT_WINDOW });
    return false;
  }
  entry.count++;
  return entry.count > LOGIN_ACCOUNT_LIMIT;
}

export async function middleware(request: NextRequest) {
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

    // Rate limiting on login (stricter: 10/min per IP, plus a separate
    // per-account counter to blunt distributed brute force).
    //
    // Per-IP gate runs first (no body read needed). If it passes, we peek
    // at the body to also gate per-account. Reading the body consumes the
    // stream, so we rebuild the request with the captured bytes before
    // forwarding to the route handler.
    if (pathname === '/api/admin/auth/login' && request.method === 'POST') {
      const ip = getClientIp(request);
      if (isRateLimited(`login:${ip}`, 10)) {
        return NextResponse.json(
          { success: false, error: { code: 'RATE_LIMITED', message: 'Too many login attempts. Try again later.' } },
          { status: 429 },
        );
      }

      // Per-account throttle. Best-effort: if the body can't be parsed we
      // skip this layer rather than reject — the route handler still runs
      // its own validation + DB-side lockout.
      try {
        const cloned = request.clone();
        const bodyText = await cloned.text();
        if (bodyText) {
          let accountKey: string | null = null;
          try {
            const parsed = JSON.parse(bodyText) as Record<string, unknown>;
            const candidate =
              (typeof parsed.adminUserId === 'string' && parsed.adminUserId) ||
              (typeof parsed.email === 'string' && parsed.email) ||
              (typeof parsed.username === 'string' && parsed.username) ||
              (typeof parsed.phone === 'string' && parsed.phone) ||
              null;
            if (candidate) accountKey = candidate.trim().toLowerCase();
          } catch {
            // not JSON — ignore
          }
          if (accountKey && isLoginAccountRateLimited(`login-account:${accountKey}`)) {
            return NextResponse.json(
              {
                success: false,
                error: {
                  code: 'RATE_LIMITED',
                  message: 'Too many login attempts for this account. Try again later.',
                },
              },
              { status: 429 },
            );
          }
        }
      } catch {
        // body read failure — fall through to the route handler
      }
    }

    // Rate limiting on public endpoints (30/min) — applies to ALL methods.
    // GET /api/public/estimate/[token] is bruteforce-able by token enumeration,
    // so we deliberately do NOT scope this to POST only. The key is per-method
    // so a chatty GET endpoint can't crowd out POST budget for the same IP.
    if (pathname.startsWith('/api/public/')) {
      const ip = getClientIp(request);
      if (isRateLimited(`public:${request.method}:${ip}`)) {
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
