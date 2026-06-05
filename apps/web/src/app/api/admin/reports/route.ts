import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { PERMISSIONS } from '@gearup/types';

export async function GET(req: NextRequest) {
  try {
    requirePermission(PERMISSIONS.REPORTS_VIEW);
    const sp = req.nextUrl.searchParams;
    const type = sp.get('type') || 'dashboard';
    const from = sp.get('from'); const to = sp.get('to');

    if (type === 'dashboard') {
      // Use IST (UTC+5:30) for "today" boundaries
      const now = new Date();
      const istOffset = 5.5 * 60 * 60 * 1000;
      const istNow = new Date(now.getTime() + istOffset);
      const today = new Date(istNow.toISOString().slice(0, 10) + 'T00:00:00+05:30');
      const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
      const [
        todayAppointments,
        pendingRequests,
        activeJobs,
        unpaidInvoices,
        todayRevenue,
        totalCustomers,
        totalVehicles,
        activeWorkers,
      ] = await Promise.all([
        prisma.appointment.count({ where: { appointmentDate: { gte: today, lt: tomorrow }, status: { notIn: ['CANCELLED', 'NO_SHOW'] } } }),
        prisma.serviceRequest.count({ where: { status: { in: ['SUBMITTED', 'UNDER_REVIEW'] } } }),
        prisma.jobCard.count({ where: { status: { notIn: ['DELIVERED', 'CANCELLED', 'CLOSED'] } } }),
        prisma.invoice.count({ where: { invoiceStatus: 'FINALIZED', paymentStatus: { in: ['UNPAID', 'PARTIALLY_PAID'] } } }),
        prisma.payment.aggregate({ where: { paymentDate: { gte: today, lt: tomorrow } }, _sum: { amount: true } }),
        prisma.customer.count(),
        prisma.vehicle.count(),
        prisma.worker.count({ where: { status: 'ACTIVE' } }),
      ]);
      return NextResponse.json({
        success: true,
        data: {
          todayAppointments,
          pendingRequests,
          activeJobs,
          unpaidInvoices,
          todayRevenue: Number(todayRevenue._sum.amount ?? 0),
          totalCustomers,
          totalVehicles,
          activeWorkers,
        },
      });
    }

    if (type === 'revenue') {
      const where: Record<string, unknown> = {};
      if (from && to) where.paymentDate = { gte: new Date(from + 'T00:00:00+05:30'), lte: new Date(to + 'T23:59:59+05:30') };
      const [payments, total, dailyRaw] = await Promise.all([
        prisma.payment.groupBy({ by: ['paymentMode'], where, _sum: { amount: true }, _count: true }),
        prisma.payment.aggregate({ where, _sum: { amount: true } }),
        prisma.payment.findMany({ where, select: { amount: true, paymentDate: true }, orderBy: { paymentDate: 'asc' } }),
      ]);
      // Aggregate daily in IST
      const dailyMap: Record<string, number> = {};
      dailyRaw.forEach((p) => { const istDate = new Date(new Date(p.paymentDate).getTime() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10); dailyMap[istDate] = (dailyMap[istDate] || 0) + Number(p.amount); });
      const daily = Object.entries(dailyMap).map(([date, amount]) => ({ date, amount }));
      return NextResponse.json({
        success: true,
        data: {
          byMode: payments.map((p) => ({ mode: p.paymentMode, _count: p._count, _sum: Number(p._sum.amount ?? 0) })),
          totalRevenue: Number(total._sum.amount ?? 0),
          daily,
        },
      });
    }

    if (type === 'jobs') {
      const stats = await prisma.jobCard.groupBy({ by: ['status'], _count: true });
      return NextResponse.json({ success: true, data: stats.map((s) => ({ status: s.status, _count: s._count })) });
    }

    if (type === 'appointments') {
      const stats = await prisma.appointment.groupBy({ by: ['status'], _count: true });
      return NextResponse.json({ success: true, data: stats.map((s) => ({ status: s.status, _count: s._count })) });
    }

    if (type === 'inventory') {
      const [totalItems, stock] = await Promise.all([
        prisma.inventoryItem.count({ where: { isActive: true } }),
        prisma.inventoryItem.aggregate({ where: { isActive: true }, _sum: { quantityInStock: true } }),
      ]);
      return NextResponse.json({ success: true, data: { totalItems, totalStockUnits: Number(stock._sum.quantityInStock ?? 0) } });
    }

    if (type === 'workers') {
      const workers = await prisma.worker.findMany({
        orderBy: { fullName: 'asc' },
        select: {
          id: true,
          fullName: true,
          _count: { select: { assignments: { where: { unassignedAt: null, jobCard: { status: { notIn: ['DELIVERED', 'CANCELLED'] } } } } } },
        },
      });
      const totals = await prisma.workerAssignment.groupBy({ by: ['workerId'], _count: true });
      const totalMap = Object.fromEntries(totals.map((t) => [t.workerId, t._count]));
      return NextResponse.json({ success: true, data: workers.map((w) => ({ id: w.id, fullName: w.fullName, activeAssignments: w._count.assignments, totalAssignments: totalMap[w.id] || 0 })) });
    }

    if (type === 'expenses') {
      const where: Record<string, unknown> = {};
      if (from && to) where.expenseDate = { gte: new Date(from), lte: new Date(to) };
      const [expenses, total] = await Promise.all([
        prisma.expense.groupBy({ by: ['categoryId'], where, _sum: { amount: true }, _count: true }),
        prisma.expense.aggregate({ where, _sum: { amount: true } }),
      ]);
      return NextResponse.json({
        success: true,
        data: {
          byCategory: expenses.map((e) => ({ categoryId: e.categoryId, _count: e._count, _sum: Number(e._sum.amount ?? 0) })),
          totalExpenses: Number(total._sum.amount ?? 0),
        },
      });
    }

    return NextResponse.json({ success: true, data: {} });
  } catch (e) { return handleApiError(e); }
}
