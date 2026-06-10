import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { AppError, handleApiError } from '@/lib/errors';
import { PERMISSIONS } from '@gearup/types';

// Dashboard counts don't change second-to-second; cache the response for 30s to
// avoid hammering Customer/Vehicle counts on every navigation. Other report
// types live at their own /reports/<x> endpoints.
export const revalidate = 30;

const D = (v: unknown) => new Prisma.Decimal((v as Prisma.Decimal | number | string | null | undefined) ?? 0);

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const type = sp.get('type') || 'dashboard';

    if (type !== 'dashboard') {
      // The legacy ?type=<x> branches duplicated /reports/<x> with subtly
      // different shapes. Single source of truth is the dedicated route.
      throw new AppError(
        410,
        `Use /api/admin/reports/${type} instead of /api/admin/reports?type=${type}`,
        'GONE',
      );
    }

    requirePermission(PERMISSIONS.DASHBOARD_VIEW);

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
        todayRevenue: D(todayRevenue._sum.amount).toFixed(2),
        totalCustomers,
        totalVehicles,
        activeWorkers,
      },
    });
  } catch (e) { return handleApiError(e); }
}
