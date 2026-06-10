import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import jwt from 'jsonwebtoken';
import { AUTH_COOKIE_NAME } from '@/lib/auth';
import { getJwtSecret } from '@/lib/jwt-secret';
import { AdminShell } from './admin-shell';

/**
 * Server-side perimeter for the entire /admin/* tree.
 *
 * Previously this was a `'use client'` layout whose only auth was a
 * `useEffect` redirect, which meant unauthenticated users still received
 * the admin HTML/JS bundle and the full route map leaked to bots. We now
 * verify the JWT cookie on the server BEFORE any client component renders
 * and `redirect()` to `/admin/login` when it's missing or invalid.
 *
 * The public login page lives at `/admin/login`; we identify it via the
 * `x-pathname` header injected by `middleware.ts` so the redirect can't
 * loop on the login page itself.
 *
 * The interactive UI (sidebar, breadcrumbs, live auth-context updates) is
 * delegated to `AdminShell`, a client component.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = headers().get('x-pathname') ?? '';
  const isLoginPage = pathname === '/admin/login';

  if (!isLoginPage) {
    const token = cookies().get(AUTH_COOKIE_NAME)?.value;
    let authed = false;
    if (token) {
      try {
        jwt.verify(token, getJwtSecret());
        authed = true;
      } catch {
        authed = false;
      }
    }
    if (!authed) {
      redirect('/admin/login');
    }
  }

  return <AdminShell>{children}</AdminShell>;
}
