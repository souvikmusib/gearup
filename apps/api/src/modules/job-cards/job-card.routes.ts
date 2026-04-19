import { Router } from 'express';
import { asyncHandler } from '../../common/utils/async-handler';
import { prisma } from '@gearup/db';
import { paginate, paginationMeta } from '@gearup/db';
import { requirePermission } from '../../common/middleware/auth';
import { PERMISSIONS } from '@gearup/types';
import { logActivity } from '../../common/utils/activity-logger';
import { generateJobCardNumber } from '../../common/utils/id-generators';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';

const router: Router = Router();

router.get('/', requirePermission(PERMISSIONS.JOB_CARDS_CREATE), asyncHandler(async (req, res) => {
  const { page, pageSize, status, search } = req.query as Record<string, string>;
  const p = paginate({ page: Number(page) || 1, pageSize: Number(pageSize) || 20 });
  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (search) where.OR = [
    { jobCardNumber: { contains: search, mode: 'insensitive' } },
    { customer: { fullName: { contains: search, mode: 'insensitive' } } },
  ];
  const [data, total] = await Promise.all([
    prisma.jobCard.findMany({ where, ...p, orderBy: { createdAt: 'desc' }, include: { customer: { select: { fullName: true, phoneNumber: true } }, vehicle: { select: { registrationNumber: true, brand: true, model: true } }, assignments: { include: { worker: { select: { fullName: true } } } } } }),
    prisma.jobCard.count({ where }),
  ]);
  res.json({ success: true, data, meta: paginationMeta(total, Number(page) || 1, Number(pageSize) || 20) });
}));

const createSchema = z.object({
  appointmentId: z.string().optional(),
  serviceRequestId: z.string().optional(),
  customerId: z.string(),
  vehicleId: z.string(),
  issueSummary: z.string().min(1),
  customerComplaints: z.string().optional(),
  priority: z.string().optional(),
  estimatedDeliveryAt: z.string().optional(),
});

router.post('/', requirePermission(PERMISSIONS.JOB_CARDS_CREATE), asyncHandler(async (req, res) => {
  const body = createSchema.parse(req.body);
  const jc = await prisma.jobCard.create({
    data: {
      jobCardNumber: generateJobCardNumber(),
      ...body,
      intakeDate: new Date(),
      estimatedDeliveryAt: body.estimatedDeliveryAt ? new Date(body.estimatedDeliveryAt) : undefined,
    } as unknown as Prisma.JobCardUncheckedCreateInput,
  });
  if (body.serviceRequestId) {
    await prisma.serviceRequest.update({ where: { id: body.serviceRequestId }, data: { status: 'CONVERTED_TO_JOB' } });
  }
  await logActivity({ entityType: 'JobCard', entityId: jc.id, action: 'job-card.created', newValue: jc, actorType: 'ADMIN', actorId: req.user!.sub, requestId: req.requestId });
  res.status(201).json({ success: true, data: jc });
}));

router.get('/:id', requirePermission(PERMISSIONS.JOB_CARDS_CREATE), asyncHandler(async (req, res) => {
  const jc = await prisma.jobCard.findUniqueOrThrow({
    where: { id: req.params.id },
    include: { customer: true, vehicle: true, appointment: true, serviceRequest: true, assignments: { include: { worker: true } }, tasks: { orderBy: { sortOrder: 'asc' } }, parts: { include: { inventoryItem: true } }, attachments: true, invoices: true },
  });
  res.json({ success: true, data: jc });
}));

router.patch('/:id', requirePermission(PERMISSIONS.JOB_CARDS_UPDATE_STATUS), asyncHandler(async (req, res) => {
  const body = createSchema.partial().merge(z.object({
    diagnosisNotes: z.string().optional(),
    estimateNotes: z.string().optional(),
    customerVisibleNotes: z.string().optional(),
    internalNotes: z.string().optional(),
    estimatedPartsCost: z.number().optional(),
    estimatedLaborCost: z.number().optional(),
    estimatedTotal: z.number().optional(),
    finalPartsCost: z.number().optional(),
    finalLaborCost: z.number().optional(),
    finalTotal: z.number().optional(),
  })).parse(req.body);
  const jc = await prisma.jobCard.update({ where: { id: req.params.id }, data: body as unknown as Prisma.JobCardUncheckedUpdateInput });
  await logActivity({ entityType: 'JobCard', entityId: jc.id, action: 'job-card.updated', newValue: body, actorType: 'ADMIN', actorId: req.user!.sub, requestId: req.requestId });
  res.json({ success: true, data: jc });
}));

router.patch('/:id/status', requirePermission(PERMISSIONS.JOB_CARDS_UPDATE_STATUS), asyncHandler(async (req, res) => {
  const { status, approvalStatus } = z.object({ status: z.string().optional(), approvalStatus: z.string().optional() }).parse(req.body);
  const prev = await prisma.jobCard.findUniqueOrThrow({ where: { id: req.params.id } });
  const data: Record<string, unknown> = {};
  if (status) data.status = status;
  if (approvalStatus) data.approvalStatus = approvalStatus;
  if (status === 'DELIVERED') data.actualDeliveryAt = new Date();
  const jc = await prisma.jobCard.update({ where: { id: req.params.id }, data });
  await logActivity({ entityType: 'JobCard', entityId: jc.id, action: 'job-card.status.changed', previousValue: { status: prev.status }, newValue: { status }, actorType: 'ADMIN', actorId: req.user!.sub, requestId: req.requestId });
  res.json({ success: true, data: jc });
}));

router.post('/:id/assign-workers', requirePermission(PERMISSIONS.JOB_CARDS_ASSIGN_WORKERS), asyncHandler(async (req, res) => {
  const { workerIds, assignmentRole } = z.object({ workerIds: z.array(z.string()), assignmentRole: z.string().optional() }).parse(req.body);
  const assignments = await Promise.all(workerIds.map((workerId) =>
    prisma.workerAssignment.create({ data: { jobCardId: req.params.id, workerId, assignmentRole } }),
  ));
  await logActivity({ entityType: 'JobCard', entityId: req.params.id, action: 'job-card.worker.assigned', newValue: { workerIds }, actorType: 'ADMIN', actorId: req.user!.sub, requestId: req.requestId });
  res.status(201).json({ success: true, data: assignments });
}));

router.post('/:id/tasks', requirePermission(PERMISSIONS.JOB_CARDS_UPDATE_STATUS), asyncHandler(async (req, res) => {
  const body = z.object({ taskName: z.string(), taskDescription: z.string().optional(), assignedWorkerId: z.string().optional(), estimatedMinutes: z.number().optional(), sortOrder: z.number().optional() }).parse(req.body);
  const task = await prisma.jobCardTask.create({ data: { jobCardId: req.params.id, ...body, status: 'PENDING' } as unknown as Prisma.JobCardTaskUncheckedCreateInput });
  res.status(201).json({ success: true, data: task });
}));

router.patch('/:id/tasks/:taskId', requirePermission(PERMISSIONS.JOB_CARDS_UPDATE_STATUS), asyncHandler(async (req, res) => {
  const body = z.object({ status: z.string().optional(), actualMinutes: z.number().optional(), notes: z.string().optional() }).parse(req.body);
  const task = await prisma.jobCardTask.update({ where: { id: req.params.taskId }, data: body });
  res.json({ success: true, data: task });
}));

router.post('/:id/parts', requirePermission(PERMISSIONS.JOB_CARDS_UPDATE_STATUS), asyncHandler(async (req, res) => {
  const body = z.object({ inventoryItemId: z.string(), requiredQty: z.number(), unitPrice: z.number().optional(), notes: z.string().optional() }).parse(req.body);
  const part = await prisma.jobCardPart.create({ data: { jobCardId: req.params.id, ...body } as unknown as Prisma.JobCardPartUncheckedCreateInput });
  await logActivity({ entityType: 'JobCard', entityId: req.params.id, action: 'job-card.part.reserved', newValue: body, actorType: 'ADMIN', actorId: req.user!.sub, requestId: req.requestId });
  res.status(201).json({ success: true, data: part });
}));

export default router;
