import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '@gearup/db';
import { env } from '../../config/env';
import { MAX_LOGIN_ATTEMPTS, LOCKOUT_DURATION_MINUTES, JWT_EXPIRY } from '../../config/constants';
import { UnauthorizedError } from '../../common/errors';
import { asyncHandler } from '../../common/utils/async-handler';
import { authenticate } from '../../common/middleware/auth';
import { logActivity } from '../../common/utils/activity-logger';
import { ROLE_PERMISSIONS, type RoleKey } from '@gearup/types';
import { z } from 'zod';

const router: Router = Router();

const loginSchema = z.object({
  adminUserId: z.string().min(1),
  password: z.string().min(1),
});

router.post('/login', asyncHandler(async (req, res) => {
  const { adminUserId, password } = loginSchema.parse(req.body);

  const user = await prisma.adminUser.findUnique({
    where: { adminUserId },
    include: { roles: { include: { role: true } } },
  });

  if (!user || user.status === 'INACTIVE') throw new UnauthorizedError('Invalid credentials');

  // Check lockout
  if (user.status === 'LOCKED' && user.lockedUntil && user.lockedUntil > new Date()) {
    throw new UnauthorizedError('Account locked. Try again later.');
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    const attempts = user.failedLoginAttempts + 1;
    const update: Record<string, unknown> = { failedLoginAttempts: attempts };
    if (attempts >= MAX_LOGIN_ATTEMPTS) {
      update.status = 'LOCKED';
      update.lockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MINUTES * 60_000);
    }
    await prisma.adminUser.update({ where: { id: user.id }, data: update });
    throw new UnauthorizedError('Invalid credentials');
  }

  // Reset failed attempts on success
  await prisma.adminUser.update({
    where: { id: user.id },
    data: { failedLoginAttempts: 0, status: 'ACTIVE', lockedUntil: null, lastLoginAt: new Date() },
  });

  const roleKeys = user.roles.map((r: any) => r.role.key as RoleKey);
  const permissions = [...new Set(roleKeys.flatMap((k: RoleKey) => ROLE_PERMISSIONS[k] ?? []))];

  const token = jwt.sign(
    { sub: user.id, adminUserId: user.adminUserId, roles: roleKeys, permissions },
    env.JWT_SECRET,
    { expiresIn: JWT_EXPIRY },
  );

  await logActivity({ entityType: 'AdminUser', entityId: user.id, action: 'auth.login', actorType: 'ADMIN', actorId: user.id, requestId: req.requestId, ipAddress: req.ip, userAgent: req.headers['user-agent'] });

  res.json({
    success: true,
    data: {
      token,
      adminUser: { id: user.id, adminUserId: user.adminUserId, fullName: user.fullName, roles: roleKeys },
    },
  });
}));

router.post('/logout', authenticate, asyncHandler(async (req, res) => {
  await logActivity({ entityType: 'AdminUser', entityId: req.user!.sub, action: 'auth.logout', actorType: 'ADMIN', actorId: req.user!.sub, requestId: req.requestId });
  res.json({ success: true });
}));

router.get('/me', authenticate, asyncHandler(async (req, res) => {
  const user = await prisma.adminUser.findUniqueOrThrow({
    where: { id: req.user!.sub },
    include: { roles: { include: { role: true } } },
  });
  const roleKeys = user.roles.map((r: any) => r.role.key as RoleKey);
  const permissions = [...new Set(roleKeys.flatMap((k: RoleKey) => ROLE_PERMISSIONS[k] ?? []))];
  res.json({
    success: true,
    data: { id: user.id, adminUserId: user.adminUserId, fullName: user.fullName, email: user.email, roles: roleKeys, permissions },
  });
}));

router.post('/change-password', authenticate, asyncHandler(async (req, res) => {
  const schema = z.object({ currentPassword: z.string(), newPassword: z.string().min(8) });
  const { currentPassword, newPassword } = schema.parse(req.body);
  const user = await prisma.adminUser.findUniqueOrThrow({ where: { id: req.user!.sub } });
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) throw new UnauthorizedError('Current password incorrect');
  await prisma.adminUser.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(newPassword, 12) } });
  await logActivity({ entityType: 'AdminUser', entityId: user.id, action: 'auth.password-changed', actorType: 'ADMIN', actorId: user.id, requestId: req.requestId });
  res.json({ success: true });
}));

export default router;
