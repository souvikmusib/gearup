import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // Admin routes (except login) — client-side auth handles the actual check,
  // but we can add basic redirect logic here if needed
  const { pathname } = request.nextUrl;

  // Skip public routes and login
  if (!pathname.startsWith('/admin') || pathname === '/admin/login') {
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*'],
};
