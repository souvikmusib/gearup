import { Router } from 'express';
import { asyncHandler } from '../../common/utils/async-handler';
import { prisma } from '@gearup/db';
import { paginate, paginationMeta } from '@gearup/db';
import { requirePermission } from '../../common/middleware/auth';
import { PERMISSIONS } from '@gearup/types';
import { logActivity } from '../../common/utils/activity-logger';
import { z } from 'zod';

const router = Router();

router.get('/', requirePermission(PERMISSIONS.SERVICE_REQUESTS_VIEW), asyncHandler(async (req, res) => {
  const { page, pageSize, search, status } = req.query as Record<string, string>;
  const p = paginate({ page: Number(page) || 1, pageSize: Number(pageSize) || 20 });
  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (search) where.OR = [
    { referenceId: { contains: search, mode: 'insensitive' } },
    { customer: { fullName: { contains: search, mode: 'insensitive' } } },
    { customer: { phoneNumber: { contains: search } } },
  ];
  const [data, total] = await Promise.all([
    prisma.serviceRequest.findMany({ where, ...p, orderBy: { createdAt: 'desc' }, include: { customer: { select: { fullName: true, phoneNumber: true } }, vehicle: { select: { registrationNumber: true, brand: true, model: true } } } }),
    prisma.serviceRequest.count({ where }),
  ]);
  res.json({ success: true, data, meta: paginationMeta(total, Number(page) || 1, Number(pageSize) || 20) });
}));

router.get('/:id', requirePermission(PERMISSIONS.SERVICE_REQUESTS_VIEW), asyncHandler(async (req, res) => {
  const sr = await prisma.serviceRequest.findUniqueOrThrow({
    where: { id: req.params.id },
    include: { customer: true, vehicle: true, appointment: true, jobCards: true, attachments: true },
  });
  res.json({ success: true, data: sr });
}));

router.patch('/:id', requirePermission(PERMISSIONS.SERVICE_REQUESTS_EDIT), asyncHandler(async (req, res) => {
  const body = z.object({ notes: z.string().optional(), urgency: z.string().optional() }).parse(req.body);
  const sr = await prisma.serviceRequest.update({ where: { id: req.params.id }, data: body });
  await logActivity({ entityType: 'ServiceRequest', entityId: sr.id, action: 'service-request.updated', newValue: body, actorType: 'ADMIN', actorId: req.user!.sub, requestId: req.requestId });
  res.json({ success: true, data: sr });
}));

router.patch('/:id/status', requirePermission(PERMISSIONS.SERVICE_REQUESTS_EDIT), asyncHandler(async (req, res) => {
  const { status } = z.object({ status: z.string() }).parse(req.body);
  const prev = await prisma.serviceRequest.findUniqueOrThrow({ where: { id: req.params.id } });
  const sr = await prisma.serviceRequest.update({ where: { id: req.params.id }, data: { status: status as any, closedAt: ['CANCELLED', 'CLOSED'].includes(status) ? new Date() : undefined } });
  await logActivity({ entityType: 'ServiceRequest', entityId: sr.id, action: 'service-request.status.changed', previousValue: { status: prev.status }, newValue: { status }, actorType: 'ADMIN', actorId: req.user!.sub, requestId: req.requestId });
  res.json({ success: true, data: sr });
}));

export default router;
