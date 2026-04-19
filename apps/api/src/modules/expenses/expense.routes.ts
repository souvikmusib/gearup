import { Router } from 'express';
import { asyncHandler } from '../../common/utils/async-handler';
import { prisma } from '@gearup/db';
import { paginate, paginationMeta } from '@gearup/db';
import { requirePermission } from '../../common/middleware/auth';
import { PERMISSIONS } from '@gearup/types';
import { logActivity } from '../../common/utils/activity-logger';
import { z } from 'zod';

const router: Router = Router();

// Categories — MUST be before /:id to avoid route conflict
router.get('/categories', requirePermission(PERMISSIONS.EXPENSES_VIEW), asyncHandler(async (_req, res) => {
  const data = await prisma.expenseCategory.findMany({ include: { _count: { select: { expenses: true } } }, orderBy: { categoryName: 'asc' } });
  res.json({ success: true, data });
}));

router.post('/categories', requirePermission(PERMISSIONS.EXPENSES_MANAGE), asyncHandler(async (req, res) => {
  const { categoryName, description } = z.object({ categoryName: z.string(), description: z.string().optional() }).parse(req.body);
  const cat = await prisma.expenseCategory.create({ data: { categoryName, description } });
  res.status(201).json({ success: true, data: cat });
}));

router.get('/', requirePermission(PERMISSIONS.EXPENSES_VIEW), asyncHandler(async (req, res) => {
  const { page, pageSize, categoryId } = req.query as Record<string, string>;
  const p = paginate({ page: Number(page) || 1, pageSize: Number(pageSize) || 20 });
  const where: Record<string, unknown> = {};
  if (categoryId) where.categoryId = categoryId;
  const [data, total] = await Promise.all([
    prisma.expense.findMany({ where, ...p, orderBy: { expenseDate: 'desc' }, include: { category: { select: { categoryName: true } }, createdBy: { select: { fullName: true } } } }),
    prisma.expense.count({ where }),
  ]);
  res.json({ success: true, data, meta: paginationMeta(total, Number(page) || 1, Number(pageSize) || 20) });
}));

router.post('/', requirePermission(PERMISSIONS.EXPENSES_MANAGE), asyncHandler(async (req, res) => {
  const body = z.object({
    expenseDate: z.string(), categoryId: z.string(), title: z.string(), amount: z.number(),
    vendorName: z.string().optional(), paymentMode: z.string().optional(), referenceNumber: z.string().optional(),
    notes: z.string().optional(), attachmentUrl: z.string().optional(),
  }).parse(req.body);
  const expense = await prisma.expense.create({ data: { ...body, expenseDate: new Date(body.expenseDate), paymentMode: body.paymentMode as any, createdByAdminId: req.user!.sub } });
  await logActivity({ entityType: 'Expense', entityId: expense.id, action: 'expense.created', newValue: expense, actorType: 'ADMIN', actorId: req.user!.sub, requestId: req.requestId });
  res.status(201).json({ success: true, data: expense });
}));

router.get('/:id', requirePermission(PERMISSIONS.EXPENSES_VIEW), asyncHandler(async (req, res) => {
  const expense = await prisma.expense.findUniqueOrThrow({ where: { id: req.params.id }, include: { category: true, createdBy: { select: { fullName: true } } } });
  res.json({ success: true, data: expense });
}));

router.patch('/:id', requirePermission(PERMISSIONS.EXPENSES_MANAGE), asyncHandler(async (req, res) => {
  const expense = await prisma.expense.update({ where: { id: req.params.id }, data: req.body });
  res.json({ success: true, data: expense });
}));

router.delete('/:id', requirePermission(PERMISSIONS.EXPENSES_MANAGE), asyncHandler(async (req, res) => {
  await prisma.expense.delete({ where: { id: req.params.id } });
  await logActivity({ entityType: 'Expense', entityId: req.params.id, action: 'expense.deleted', actorType: 'ADMIN', actorId: req.user!.sub, requestId: req.requestId });
  res.json({ success: true });
}));

export default router;
