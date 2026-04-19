import { Router } from 'express';
import { asyncHandler } from '../../common/utils/async-handler';
import { prisma } from '@gearup/db';
import { requirePermission } from '../../common/middleware/auth';
import { PERMISSIONS } from '@gearup/types';

const router: Router = Router();

router.get('/dashboard', requirePermission(PERMISSIONS.DASHBOARD_VIEW), asyncHandler(async (_req, res) => {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);

  const [todayAppointments, pendingRequests, activeJobs, lowStockCount, unpaidInvoices, todayRevenue] = await Promise.all([
    prisma.appointment.count({ where: { appointmentDate: { gte: today, lt: tomorrow }, status: { notIn: ['CANCELLED', 'NO_SHOW'] } } }),
    prisma.serviceRequest.count({ where: { status: { in: ['SUBMITTED', 'UNDER_REVIEW'] } } }),
    prisma.jobCard.count({ where: { status: { notIn: ['DELIVERED', 'CANCELLED', 'CLOSED'] } } }),
    prisma.$queryRaw<[{count: bigint}]>`SELECT COUNT(*)::int as count FROM "InventoryItem" WHERE "reorderLevel" IS NOT NULL AND "quantityInStock" <= "reorderLevel" AND "isActive" = true`.then((r: any) => Number(r[0]?.count ?? 0)).catch(() => 0),
    prisma.invoice.count({ where: { invoiceStatus: 'FINALIZED', paymentStatus: { in: ['UNPAID', 'PARTIALLY_PAID'] } } }),
    prisma.payment.aggregate({ where: { paymentDate: { gte: today, lt: tomorrow } }, _sum: { amount: true } }),
  ]);

  res.json({
    success: true,
    data: { todayAppointments, pendingRequests, activeJobs, lowStockCount, unpaidInvoices, todayRevenue: Number(todayRevenue._sum.amount ?? 0) },
  });
}));

router.get('/revenue', requirePermission(PERMISSIONS.REPORTS_VIEW), asyncHandler(async (req, res) => {
  const { from, to } = req.query as { from?: string; to?: string };
  const where: Record<string, unknown> = {};
  if (from && to) where.paymentDate = { gte: new Date(from), lte: new Date(to) };
  const payments = await prisma.payment.groupBy({ by: ['paymentMode'], where, _sum: { amount: true }, _count: true });
  const total = await prisma.payment.aggregate({ where, _sum: { amount: true } });
  res.json({ success: true, data: { byMode: payments, total: Number(total._sum.amount ?? 0) } });
}));

router.get('/appointments', requirePermission(PERMISSIONS.REPORTS_VIEW), asyncHandler(async (req, res) => {
  const stats = await prisma.appointment.groupBy({ by: ['status'], _count: true });
  res.json({ success: true, data: stats });
}));

router.get('/jobs', requirePermission(PERMISSIONS.REPORTS_VIEW), asyncHandler(async (_req, res) => {
  const stats = await prisma.jobCard.groupBy({ by: ['status'], _count: true });
  res.json({ success: true, data: stats });
}));

router.get('/inventory', requirePermission(PERMISSIONS.REPORTS_VIEW), asyncHandler(async (_req, res) => {
  const totalItems = await prisma.inventoryItem.count({ where: { isActive: true } });
  const totalValue = await prisma.inventoryItem.aggregate({ where: { isActive: true }, _sum: { quantityInStock: true } });
  res.json({ success: true, data: { totalItems, totalStockUnits: Number(totalValue._sum.quantityInStock ?? 0) } });
}));

router.get('/workers', requirePermission(PERMISSIONS.REPORTS_VIEW), asyncHandler(async (_req, res) => {
  const workers = await prisma.worker.findMany({ where: { status: 'ACTIVE' }, include: { _count: { select: { assignments: true } } } });
  res.json({ success: true, data: workers.map((w: any) => ({ id: w.id, fullName: w.fullName, activeAssignments: w._count.assignments })) });
}));

router.get('/expenses', requirePermission(PERMISSIONS.REPORTS_VIEW), asyncHandler(async (req, res) => {
  const { from, to } = req.query as { from?: string; to?: string };
  const where: Record<string, unknown> = {};
  if (from && to) where.expenseDate = { gte: new Date(from), lte: new Date(to) };
  const byCategory = await prisma.expense.groupBy({ by: ['categoryId'], where, _sum: { amount: true }, _count: true });
  const total = await prisma.expense.aggregate({ where, _sum: { amount: true } });
  res.json({ success: true, data: { byCategory, total: Number(total._sum.amount ?? 0) } });
}));

export default router;
