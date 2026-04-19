import { Router } from 'express';
import { asyncHandler } from '../../common/utils/async-handler';
import { prisma } from '@gearup/db';
import { paginate, paginationMeta } from '@gearup/db';
import { requirePermission } from '../../common/middleware/auth';
import { PERMISSIONS } from '@gearup/types';

const router = Router();

router.get('/activity', requirePermission(PERMISSIONS.LOGS_VIEW), asyncHandler(async (req, res) => {
  const { page, pageSize, entityType, actorType, action } = req.query as Record<string, string>;
  const p = paginate({ page: Number(page) || 1, pageSize: Number(pageSize) || 50 });
  const where: Record<string, unknown> = {};
  if (entityType) where.entityType = entityType;
  if (actorType) where.actorType = actorType;
  if (action) where.action = { contains: action };
  const [data, total] = await Promise.all([
    prisma.activityLog.findMany({ where, ...p, orderBy: { createdAt: 'desc' }, include: { adminUser: { select: { fullName: true, adminUserId: true } } } }),
    prisma.activityLog.count({ where }),
  ]);
  res.json({ success: true, data, meta: paginationMeta(total, Number(page) || 1, Number(pageSize) || 50) });
}));

export default router;
