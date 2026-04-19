import { Router } from 'express';
import { asyncHandler } from '../../common/utils/async-handler';
import { prisma } from '@gearup/db';
import { paginate, paginationMeta } from '@gearup/db';
import { requirePermission } from '../../common/middleware/auth';
import { PERMISSIONS } from '@gearup/types';
import { z } from 'zod';

const router = Router();

router.get('/', requirePermission(PERMISSIONS.NOTIFICATIONS_VIEW), asyncHandler(async (req, res) => {
  const { page, pageSize, channel, eventType, sendStatus } = req.query as Record<string, string>;
  const p = paginate({ page: Number(page) || 1, pageSize: Number(pageSize) || 20 });
  const where: Record<string, unknown> = {};
  if (channel) where.channel = channel;
  if (eventType) where.eventType = eventType;
  if (sendStatus) where.sendStatus = sendStatus;
  const [data, total] = await Promise.all([
    prisma.notification.findMany({ where, ...p, orderBy: { createdAt: 'desc' } }),
    prisma.notification.count({ where }),
  ]);
  res.json({ success: true, data, meta: paginationMeta(total, Number(page) || 1, Number(pageSize) || 20) });
}));

router.post('/retry/:id', requirePermission(PERMISSIONS.NOTIFICATIONS_VIEW), asyncHandler(async (req, res) => {
  const notif = await prisma.notification.update({ where: { id: req.params.id }, data: { sendStatus: 'QUEUED', retryCount: { increment: 1 } } });
  res.json({ success: true, data: notif });
}));

// Templates
router.get('/templates', requirePermission(PERMISSIONS.NOTIFICATIONS_VIEW), asyncHandler(async (_req, res) => {
  const data = await prisma.notificationTemplate.findMany({ orderBy: { eventType: 'asc' } });
  res.json({ success: true, data });
}));

router.patch('/templates/:id', requirePermission(PERMISSIONS.NOTIFICATIONS_TEMPLATES_MANAGE), asyncHandler(async (req, res) => {
  const body = z.object({ subject: z.string().optional(), messageBody: z.string().optional(), isActive: z.boolean().optional() }).parse(req.body);
  const tmpl = await prisma.notificationTemplate.update({ where: { id: req.params.id }, data: body });
  res.json({ success: true, data: tmpl });
}));

export default router;
