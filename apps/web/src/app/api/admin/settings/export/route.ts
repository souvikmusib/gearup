import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { PERMISSIONS } from '@gearup/types';

export async function GET() {
  try {
    requirePermission(PERMISSIONS.SETTINGS_MANAGE);
    const [customers, vehicles, workers, serviceRequests, appointments, jobCards, invoices, payments, expenses, inventoryItems, inventoryCategories, suppliers, settings] = await Promise.all([
      prisma.customer.findMany(),
      prisma.vehicle.findMany(),
      prisma.worker.findMany(),
      prisma.serviceRequest.findMany(),
      prisma.appointment.findMany(),
      prisma.jobCard.findMany({ include: { tasks: true, parts: true, assignments: true } }),
      prisma.invoice.findMany({ include: { lineItems: true } }),
      prisma.payment.findMany(),
      prisma.expense.findMany(),
      prisma.inventoryItem.findMany(),
      prisma.inventoryCategory.findMany(),
      prisma.supplier.findMany(),
      prisma.setting.findMany(),
    ]);

    const backup = {
      exportedAt: new Date().toISOString(),
      customers, vehicles, workers, serviceRequests, appointments,
      jobCards, invoices, payments, expenses,
      inventoryItems, inventoryCategories, suppliers, settings,
    };

    return new NextResponse(JSON.stringify(backup, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="gearup-backup-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    });
  } catch (e) { return handleApiError(e); }
}
