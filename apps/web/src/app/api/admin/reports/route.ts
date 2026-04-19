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
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
      const [todayAppointments, pendingRequests, activeJobs, unpaidInvoices, todayRevenue] = await Promise.all([
        prisma.appointment.count({ where: { appointmentDate: { gte: today, lt: tomorrow }, status: { notIn: ['CANCELLED', 'NO_SHOW'] } } }),
        prisma.serviceRequest.count({ where: { status: { in: ['SUBMITTED', 'UNDER_REVIEW'] } } }),
        prisma.jobCard.count({ where: { status: { notIn: ['DELIVERED', 'CANCELLED', 'CLOSED'] } } }),
        prisma.invoice.count({ where: { invoiceStatus: 'FINALIZED', paymentStatus: { in: ['UNPAID', 'PARTIALLY_PAID'] } } }),
        prisma.payment.aggregate({ where: { paymentDate: { gte: today, lt: tomorrow } }, _sum: { amount: true } }),
      ]);
      return NextResponse.json({ success: true, data: { todayAppointments, pendingRequests, activeJobs, unpaidInvoices, todayRevenue: Number(todayRevenue._sum.amount ?? 0) } });
    }

    if (type === 'revenue') {
      const where: Record<string, unknown> = {};
      if (from && to) where.paymentDate = { gte: new Date(from), lte: new Date(to) };
      const payments = await prisma.payment.groupBy({ by: ['paymentMode'], where, _sum: { amount: true }, _count: true });
      const total = await prisma.payment.aggregate({ where, _sum: { amount: true } });
      return NextResponse.json({ success: true, data: { byMode: payments, total: Number(total._sum.amount ?? 0) } });
    }

    if (type === 'jobs') {
      const stats = await prisma.jobCard.groupBy({ by: ['status'], _count: true });
      return NextResponse.json({ success: true, data: stats });
    }

    return NextResponse.json({ success: true, data: {} });
  } catch (e) { return handleApiError(e); }
}
