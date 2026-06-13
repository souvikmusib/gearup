import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '@/lib/prisma';
import { handleApiError, UnauthorizedError, AppError } from '@/lib/errors';
import { MAX_LOGIN_ATTEMPTS, LOCKOUT_DURATION_MINUTES, JWT_EXPIRY } from '@/lib/constants';
import { logActivity } from '@/lib/activity-logger';
import { ROLE_PERMISSIONS, type RoleKey } from '@gearup/types';
import { ZodError, z } from 'zod';
import { getJwtSecret } from '@/lib/jwt-secret';
import { AUTH_COOKIE_NAME } from '@/lib/auth';

const loginSchema = z.object({ adminUserId: z.string().min(1), password: z.string().min(1) });

// Fixed dummy bcrypt hash used to equalize timing on unknown-user / locked-out
// paths so an attacker can't distinguish "no such adminUserId" from "wrong
// password" by wall-clock time. The plaintext doesn't matter — the comparison
// must always fail.
const DUMMY_BCRYPT_HASH = '$2a$12$CwTycUXWue0Thq9StjUM0uJ8eVf3qB7n3qV3yQ8nQ6f2cTk3WkX/m';

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    let parsedBody: unknown = {};

    if (rawBody.trim()) {
      try {
        parsedBody = JSON.parse(rawBody);
      } catch {
        throw new AppError(400, 'Validation failed', 'VALIDATION_ERROR', {
          _root: ['Request body must be valid JSON'],
        });
      }
    }

    const { adminUserId, password } = loginSchema.parse(parsedBody);
    const user = await prisma.adminUser.findUnique({ where: { adminUserId }, include: { roles: { include: { role: true } } } });

    // Unified-timing path: if the user doesn't exist, is INACTIVE, or is
    // currently LOCKED, we still run a bcrypt.compare against a dummy hash so
    // the response time matches the real-password path. The error message is
    // identical to a bad-password failure to avoid leaking which adminUserIds
    // exist on the system.
    if (!user || user.status === 'INACTIVE' || (user.status === 'LOCKED' && user.lockedUntil && user.lockedUntil > new Date())) {
      await bcrypt.compare(password, DUMMY_BCRYPT_HASH);
      throw new UnauthorizedError('Invalid credentials');
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      const attempts = user.failedLoginAttempts + 1;
      const update: Record<string, unknown> = { failedLoginAttempts: attempts };
      if (attempts >= MAX_LOGIN_ATTEMPTS) { update.status = 'LOCKED'; update.lockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MINUTES * 60_000); }
      await prisma.adminUser.update({ where: { id: user.id }, data: update });
      throw new UnauthorizedError('Invalid credentials');
    }

    await prisma.adminUser.update({ where: { id: user.id }, data: { failedLoginAttempts: 0, status: 'ACTIVE', lockedUntil: null, lastLoginAt: new Date() } });
    const roleKeys = user.roles.map((r: (typeof user)['roles'][number]) => r.role.key as RoleKey);
    const permissions = [...new Set(roleKeys.flatMap((k: RoleKey) => ROLE_PERMISSIONS[k] ?? []))];
    const token = jwt.sign({ sub: user.id, adminUserId: user.adminUserId, roles: roleKeys, permissions }, getJwtSecret(), { expiresIn: JWT_EXPIRY });
    logActivity({ entityType: 'AdminUser', entityId: user.id, action: 'auth.login', actorType: 'ADMIN', actorId: user.id, ipAddress: req.headers.get('x-forwarded-for') ?? undefined, userAgent: req.headers.get('user-agent') ?? undefined });

    const res = NextResponse.json({ success: true, data: { token, adminUser: { id: user.id, adminUserId: user.adminUserId, fullName: user.fullName, roles: roleKeys } } });
    // Also set the token as an httpOnly cookie so the server-side guard in
    // app/admin/layout.tsx can verify the session before any client component
    // renders. The client SPA continues to send Authorization: Bearer for API
    // calls — the cookie is purely for server-component auth.
    // JWT_EXPIRY is a string like '24h' / '7d'; resolve to seconds for maxAge.
    const expiryMs = (() => {
      const m = /^(\d+)([smhd])$/.exec(String(JWT_EXPIRY));
      if (!m) return 24 * 60 * 60; // 1 day fallback
      const n = Number(m[1]);
      const unit = m[2];
      return unit === 's' ? n : unit === 'm' ? n * 60 : unit === 'h' ? n * 3600 : n * 86400;
    })();
    res.cookies.set(AUTH_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: expiryMs,
    });
    return res;
  } catch (e) {
    if (!(e instanceof AppError) && !(e instanceof ZodError)) {
      console.error('Login error:', e);
    }
    return handleApiError(e);
  }
}
