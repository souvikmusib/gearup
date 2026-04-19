import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Simple in-memory rate limiter (per-IP, resets on cold start)
const rateMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 30; // requests per window
const RATE_WINDOW = 60_000; // 1 minute

function isRateLimited(ip: string, limit = RATE_LIMIT): boolean {
  const now = Date.now();
  const entry = rateMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW });
    return false;
  }
  entry.count++;
  return entry.count > limit;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const response = NextResponse.next();

  // CORS headers for API routes
  if (pathname.startsWith('/api/')) {
    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (request.method === 'OPTIONS') {
      return new NextResponse(null, { status: 204, headers: response.headers });
    }

    // Rate limiting on login (stricter: 10/min)
    if (pathname === '/api/admin/auth/login' && request.method === 'POST') {
      const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
      if (isRateLimited(ip, 10)) {
        return NextResponse.json({ success: false, error: { code: 'RATE_LIMITED', message: 'Too many login attempts. Try again later.' } }, { status: 429 });
      }
    }

    // Rate limiting on public endpoints (30/min)
    if (pathname.startsWith('/api/public/') && request.method === 'POST') {
      const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
      if (isRateLimited(ip)) {
        return NextResponse.json({ success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests. Try again later.' } }, { status: 429 });
      }
    }
  }

  return response;
}

export const config = {
  matcher: ['/admin/:path*', '/api/:path*'],
};
