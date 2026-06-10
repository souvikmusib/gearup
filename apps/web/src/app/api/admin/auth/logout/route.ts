import { NextResponse } from 'next/server';
import { AUTH_COOKIE_NAME } from '@/lib/auth';

/**
 * Clears the httpOnly auth cookie. The client-side logout flow in
 * `auth-context.tsx` already wipes localStorage and in-memory state;
 * this endpoint is what evicts the cookie that the server-side guard
 * in `app/admin/layout.tsx` reads.
 *
 * Intentionally unauthenticated: a stale token shouldn't block logout.
 */
export async function POST() {
  const res = NextResponse.json({ success: true });
  res.cookies.set(AUTH_COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return res;
}
