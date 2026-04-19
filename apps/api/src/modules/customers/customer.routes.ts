import { Router } from 'express';
import { asyncHandler } from '../../common/utils/async-handler';
import { prisma } from '@gearup/db';
import { paginate, paginationMeta } from '@gearup/db';
import { requirePermission } from '../../common/middleware/auth';
import { PERMISSIONS } from '@gearup/types';
import { z } from 'zod';
import { logActivity } from '../../common/utils/activity-logger';
import type { Prisma } from '@prisma/client';

const router: Router = Router();

const createCustomerSchema = z.object({
  fullName: z.string().min(1),
  phoneNumber: z.string().min(5),
  alternatePhone: z.string().optional(),
  email: z.string().email().optional(),
  addressLine1: z.string().optional(),
  addressLine2: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  postalCode: z.string().optional(),
  notes: z.string().optional(),
  source: z.string().optional(),
});

router.get('/', requirePermission(PERMISSIONS.CUSTOMERS_VIEW), asyncHandler(async (req, res) => {
  const { page, pageSize, search } = req.query as Record<string, string>;
  const p = paginate({ page: Number(page) || 1, pageSize: Number(pageSize) || 20 });
  const where = search ? {
    OR: [
      { fullName: { contains: search, mode: 'insensitive' as const } },
      { phoneNumber: { contains: search } },
      { email: { contains: search, mode: 'insensitive' as const } },
    ],
  } : {};
  const [data, total] = await Promise.all([
    prisma.customer.findMany({ where, ...p, orderBy: { createdAt: 'desc' }, include: { _count: { select: { vehicles: true, jobCards: true } } } }),
    prisma.customer.count({ where }),
  ]);
  res.json({ success: true, data, meta: paginationMeta(total, Number(page) || 1, Number(pageSize) || 20) });
}));

router.post('/', requirePermission(PERMISSIONS.CUSTOMERS_EDIT), asyncHandler(async (req, res) => {
  const body = createCustomerSchema.parse(req.body);
  const customer = await prisma.customer.create({ data: body as Prisma.CustomerCreateInput });
  await logActivity({ entityType: 'Customer', entityId: customer.id, action: 'customer.created', newValue: customer, actorType: 'ADMIN', actorId: req.user!.sub, requestId: req.requestId });
  res.status(201).json({ success: true, data: customer });
}));

router.get('/:id', requirePermission(PERMISSIONS.CUSTOMERS_VIEW), asyncHandler(async (req, res) => {
  const customer = await prisma.customer.findUniqueOrThrow({ where: { id: req.params.id }, include: { vehicles: true, serviceRequests: { orderBy: { createdAt: 'desc' }, take: 10 }, invoices: { orderBy: { createdAt: 'desc' }, take: 10 } } });
  res.json({ success: true, data: customer });
}));

router.patch('/:id', requirePermission(PERMISSIONS.CUSTOMERS_EDIT), asyncHandler(async (req, res) => {
  const body = createCustomerSchema.partial().parse(req.body);
  const prev = await prisma.customer.findUniqueOrThrow({ where: { id: req.params.id } });
  const customer = await prisma.customer.update({ where: { id: req.params.id }, data: body as Prisma.CustomerUpdateInput });
  await logActivity({ entityType: 'Customer', entityId: customer.id, action: 'customer.updated', previousValue: prev, newValue: customer, actorType: 'ADMIN', actorId: req.user!.sub, requestId: req.requestId });
  res.json({ success: true, data: customer });
}));

router.get('/:id/history', requirePermission(PERMISSIONS.CUSTOMERS_VIEW), asyncHandler(async (req, res) => {
  const logs = await prisma.activityLog.findMany({ where: { entityType: 'Customer', entityId: req.params.id }, orderBy: { createdAt: 'desc' }, take: 50 });
  res.json({ success: true, data: logs });
}));

export default router;
