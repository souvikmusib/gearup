import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '@/lib/prisma';
import { handleApiError, UnauthorizedError } from '@/lib/errors';
import { MAX_LOGIN_ATTEMPTS, LOCKOUT_DURATION_MINUTES, JWT_EXPIRY } from '@/lib/constants';
import { logActivity } from '@/lib/activity-logger';
import { ROLE_PERMISSIONS, type RoleKey } from '@gearup/types';
import { z } from 'zod';

const loginSchema = z.object({ adminUserId: z.string().min(1), password: z.string().min(1) });

export async function POST(req: NextRequest) {
  try {
    const { adminUserId, password } = loginSchema.parse(await req.json());
    const user = await prisma.adminUser.findUnique({ where: { adminUserId }, include: { roles: { include: { role: true } } } });
    if (!user || user.status === 'INACTIVE') throw new UnauthorizedError('Invalid credentials');
    if (user.status === 'LOCKED' && user.lockedUntil && user.lockedUntil > new Date()) throw new UnauthorizedError('Account locked. Try again later.');

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      const attempts = user.failedLoginAttempts + 1;
      const update: Record<string, unknown> = { failedLoginAttempts: attempts };
      if (attempts >= MAX_LOGIN_ATTEMPTS) { update.status = 'LOCKED'; update.lockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MINUTES * 60_000); }
      await prisma.adminUser.update({ where: { id: user.id }, data: update });
      throw new UnauthorizedError('Invalid credentials');
    }

    await prisma.adminUser.update({ where: { id: user.id }, data: { failedLoginAttempts: 0, status: 'ACTIVE', lockedUntil: null, lastLoginAt: new Date() } });
    const roleKeys = user.roles.map((r: any) => r.role.key as RoleKey);
    const permissions = [...new Set(roleKeys.flatMap((k: RoleKey) => ROLE_PERMISSIONS[k] ?? []))];
    const token = jwt.sign({ sub: user.id, adminUserId: user.adminUserId, roles: roleKeys, permissions }, process.env.JWT_SECRET!, { expiresIn: JWT_EXPIRY });
    await logActivity({ entityType: 'AdminUser', entityId: user.id, action: 'auth.login', actorType: 'ADMIN', actorId: user.id, ipAddress: req.headers.get('x-forwarded-for') ?? undefined, userAgent: req.headers.get('user-agent') ?? undefined });

    return NextResponse.json({ success: true, data: { token, adminUser: { id: user.id, adminUserId: user.adminUserId, fullName: user.fullName, roles: roleKeys } } });
  } catch (e: any) {
    console.error('Login error:', e?.message, e?.stack);
    return handleApiError(e);
  }
}
