import { Router } from 'express';
import { asyncHandler } from '../../common/utils/async-handler';
import { prisma } from '@gearup/db';
import { paginate, paginationMeta } from '@gearup/db';
import { requirePermission } from '../../common/middleware/auth';
import { PERMISSIONS } from '@gearup/types';
import { logActivity } from '../../common/utils/activity-logger';
import { generateWorkerCode } from '../../common/utils/id-generators';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';

const router: Router = Router();

const workerSchema = z.object({
  fullName: z.string().min(1),
  phoneNumber: z.string().optional(),
  email: z.string().email().optional(),
  designation: z.string().optional(),
  specialization: z.string().optional(),
  employmentType: z.string().optional(),
  joiningDate: z.string().optional(),
  dailyCapacity: z.number().optional(),
  shiftStart: z.string().optional(),
  shiftEnd: z.string().optional(),
  notes: z.string().optional(),
});

router.get('/', requirePermission(PERMISSIONS.WORKERS_MANAGE), asyncHandler(async (req, res) => {
  const { page, pageSize, status, search } = req.query as Record<string, string>;
  const p = paginate({ page: Number(page) || 1, pageSize: Number(pageSize) || 20 });
  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (search) where.OR = [
    { fullName: { contains: search, mode: 'insensitive' } },
    { workerCode: { contains: search, mode: 'insensitive' } },
  ];
  const [data, total] = await Promise.all([
    prisma.worker.findMany({ where, ...p, orderBy: { createdAt: 'desc' }, include: { _count: { select: { assignments: true } } } }),
    prisma.worker.count({ where }),
  ]);
  res.json({ success: true, data, meta: paginationMeta(total, Number(page) || 1, Number(pageSize) || 20) });
}));

router.post('/', requirePermission(PERMISSIONS.WORKERS_MANAGE), asyncHandler(async (req, res) => {
  const body = workerSchema.parse(req.body);
  const worker = await prisma.worker.create({
    data: { workerCode: generateWorkerCode(), ...body, joiningDate: body.joiningDate ? new Date(body.joiningDate) : undefined } as Prisma.WorkerCreateInput,
  });
  await logActivity({ entityType: 'Worker', entityId: worker.id, action: 'worker.created', newValue: worker, actorType: 'ADMIN', actorId: req.user!.sub, requestId: req.requestId });
  res.status(201).json({ success: true, data: worker });
}));

router.get('/:id', requirePermission(PERMISSIONS.WORKERS_MANAGE), asyncHandler(async (req, res) => {
  const worker = await prisma.worker.findUniqueOrThrow({ where: { id: req.params.id }, include: { assignments: { include: { jobCard: { select: { jobCardNumber: true, status: true } } }, orderBy: { assignedAt: 'desc' }, take: 20 }, leaves: { orderBy: { startDate: 'desc' }, take: 10 } } });
  res.json({ success: true, data: worker });
}));

router.patch('/:id', requirePermission(PERMISSIONS.WORKERS_MANAGE), asyncHandler(async (req, res) => {
  const body = workerSchema.partial().merge(z.object({ status: z.enum(['ACTIVE', 'INACTIVE', 'ON_LEAVE']).optional() })).parse(req.body);
  const worker = await prisma.worker.update({ where: { id: req.params.id }, data: body as Prisma.WorkerUpdateInput });
  await logActivity({ entityType: 'Worker', entityId: worker.id, action: 'worker.updated', newValue: body, actorType: 'ADMIN', actorId: req.user!.sub, requestId: req.requestId });
  res.json({ success: true, data: worker });
}));

router.post('/:id/leave', requirePermission(PERMISSIONS.WORKERS_LEAVES_MANAGE), asyncHandler(async (req, res) => {
  const body = z.object({ leaveType: z.string(), startDate: z.string(), endDate: z.string(), reason: z.string().optional(), partialDay: z.boolean().optional() }).parse(req.body);
  const leave = await prisma.workerLeave.create({
    data: { workerId: req.params.id, ...body, startDate: new Date(body.startDate), endDate: new Date(body.endDate), status: 'APPROVED', approvedByAdminId: req.user!.sub } as unknown as Prisma.WorkerLeaveUncheckedCreateInput,
  });
  res.status(201).json({ success: true, data: leave });
}));

router.get('/:id/schedule', requirePermission(PERMISSIONS.WORKERS_MANAGE), asyncHandler(async (req, res) => {
  const { from, to } = req.query as { from?: string; to?: string };
  const where: Record<string, unknown> = { workerId: req.params.id };
  if (from && to) where.assignedAt = { gte: new Date(from), lte: new Date(to) };
  const assignments = await prisma.workerAssignment.findMany({ where, include: { jobCard: { select: { jobCardNumber: true, status: true, customer: { select: { fullName: true } } } } }, orderBy: { assignedAt: 'desc' } });
  const leaves = await prisma.workerLeave.findMany({ where: { workerId: req.params.id, status: 'APPROVED' }, orderBy: { startDate: 'desc' }, take: 20 });
  res.json({ success: true, data: { assignments, leaves } });
}));

export default router;
