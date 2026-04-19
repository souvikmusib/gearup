import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { asyncHandler } from '../../common/utils/async-handler';
import { prisma } from '@gearup/db';
import { paginate, paginationMeta } from '@gearup/db';
import { requirePermission } from '../../common/middleware/auth';
import { PERMISSIONS } from '@gearup/types';
import { logActivity } from '../../common/utils/activity-logger';
import { z } from 'zod';

const router: Router = Router();

const createSchema = z.object({
  adminUserId: z.string().min(1),
  fullName: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  password: z.string().min(8),
});

// List
router.get('/', requirePermission(PERMISSIONS.ADMIN_USERS_MANAGE), asyncHandler(async (req, res) => {
  const { page, pageSize, search, status } = req.query as Record<string, string>;
  const p = paginate({ page: Number(page) || 1, pageSize: Number(pageSize) || 20 });
  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (search) where.OR = [
    { fullName: { contains: search, mode: 'insensitive' } },
    { adminUserId: { contains: search, mode: 'insensitive' } },
    { email: { contains: search, mode: 'insensitive' } },
  ];
  const [data, total] = await Promise.all([
    prisma.adminUser.findMany({ where, ...p, orderBy: { createdAt: 'desc' }, include: { roles: { include: { role: true } } }, select: undefined }),
    prisma.adminUser.count({ where }),
  ]);
  res.json({ success: true, data, meta: paginationMeta(total, Number(page) || 1, Number(pageSize) || 20) });
}));

// Create
router.post('/', requirePermission(PERMISSIONS.ADMIN_USERS_MANAGE), asyncHandler(async (req, res) => {
  const { password, ...body } = createSchema.parse(req.body);
  const user = await prisma.adminUser.create({ data: { ...body, passwordHash: await bcrypt.hash(password, 12) } });
  await logActivity({ entityType: 'AdminUser', entityId: user.id, action: 'admin-user.created', newValue: { ...user, passwordHash: undefined }, actorType: 'ADMIN', actorId: req.user!.sub, requestId: req.requestId });
  res.status(201).json({ success: true, data: user });
}));

// Update
router.patch('/:id', requirePermission(PERMISSIONS.ADMIN_USERS_MANAGE), asyncHandler(async (req, res) => {
  const body = z.object({ fullName: z.string().optional(), email: z.string().email().optional(), phone: z.string().optional() }).parse(req.body);
  const user = await prisma.adminUser.update({ where: { id: req.params.id }, data: body });
  await logActivity({ entityType: 'AdminUser', entityId: user.id, action: 'admin-user.updated', newValue: body, actorType: 'ADMIN', actorId: req.user!.sub, requestId: req.requestId });
  res.json({ success: true, data: user });
}));

// Assign roles
router.put('/:id/roles', requirePermission(PERMISSIONS.ADMIN_USERS_MANAGE), asyncHandler(async (req, res) => {
  const { roleIds } = z.object({ roleIds: z.array(z.string()) }).parse(req.body);
  await prisma.adminUserRole.deleteMany({ where: { adminUserId: req.params.id } });
  await prisma.adminUserRole.createMany({ data: roleIds.map((roleId) => ({ adminUserId: req.params.id, roleId })) });
  const user = await prisma.adminUser.findUniqueOrThrow({ where: { id: req.params.id }, include: { roles: { include: { role: true } } } });
  await logActivity({ entityType: 'AdminUser', entityId: user.id, action: 'admin-user.roles-assigned', newValue: { roleIds }, actorType: 'ADMIN', actorId: req.user!.sub, requestId: req.requestId });
  res.json({ success: true, data: user });
}));

// Activate / Deactivate
router.patch('/:id/status', requirePermission(PERMISSIONS.ADMIN_USERS_MANAGE), asyncHandler(async (req, res) => {
  const { status } = z.object({ status: z.enum(['ACTIVE', 'INACTIVE']) }).parse(req.body);
  const user = await prisma.adminUser.update({ where: { id: req.params.id }, data: { status, lockedUntil: null, failedLoginAttempts: 0 } });
  await logActivity({ entityType: 'AdminUser', entityId: user.id, action: `admin-user.${status.toLowerCase()}`, actorType: 'ADMIN', actorId: req.user!.sub, requestId: req.requestId });
  res.json({ success: true, data: user });
}));

// Reset password
router.post('/:id/reset-password', requirePermission(PERMISSIONS.ADMIN_USERS_MANAGE), asyncHandler(async (req, res) => {
  const { newPassword } = z.object({ newPassword: z.string().min(8) }).parse(req.body);
  await prisma.adminUser.update({ where: { id: req.params.id }, data: { passwordHash: await bcrypt.hash(newPassword, 12) } });
  await logActivity({ entityType: 'AdminUser', entityId: req.params.id, action: 'admin-user.password-reset', actorType: 'ADMIN', actorId: req.user!.sub, requestId: req.requestId });
  res.json({ success: true });
}));

export default router;
