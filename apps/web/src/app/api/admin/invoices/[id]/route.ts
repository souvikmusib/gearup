import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { logActivity } from '@/lib/activity-logger';
import { PERMISSIONS } from '@gearup/types';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    requirePermission(PERMISSIONS.INVOICES_VIEW);
    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: params.id }, include: { lineItems: { orderBy: { sortOrder: 'asc' } }, payments: { orderBy: { paymentDate: 'desc' } }, customer: true, vehicle: true, jobCard: { select: { jobCardNumber: true } } } });
    return NextResponse.json({ success: true, data: invoice });
  } catch (e) { return handleApiError(e); }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    requirePermission(PERMISSIONS.INVOICES_CREATE);
    const invoice = await prisma.invoice.update({ where: { id: params.id }, data: await req.json() });
    return NextResponse.json({ success: true, data: invoice });
  } catch (e) { return handleApiError(e); }
}
