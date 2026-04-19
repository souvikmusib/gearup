import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { logActivity } from '@/lib/activity-logger';
import { PERMISSIONS } from '@gearup/types';
import { z } from 'zod';

const updateSchema = z.object({
  notes: z.string().optional(),
  dueDate: z.string().optional(),
  discountType: z.string().optional(),
  discountValue: z.number().optional(),
}).strict();

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    requirePermission(PERMISSIONS.INVOICES_VIEW);
    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: params.id }, include: { lineItems: { orderBy: { sortOrder: 'asc' } }, payments: { orderBy: { paymentDate: 'desc' } }, customer: true, vehicle: true, jobCard: { select: { jobCardNumber: true } } } });
    return NextResponse.json({ success: true, data: invoice });
  } catch (e) { return handleApiError(e); }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = requirePermission(PERMISSIONS.INVOICES_CREATE);
    const body = updateSchema.parse(await req.json());
    const data: Record<string, unknown> = { ...body };
    if (body.dueDate) data.dueDate = new Date(body.dueDate);
    const invoice = await prisma.invoice.update({ where: { id: params.id }, data });
    await logActivity({ entityType: 'Invoice', entityId: invoice.id, action: 'invoice.updated', newValue: body, actorType: 'ADMIN', actorId: user.sub });
    return NextResponse.json({ success: true, data: invoice });
  } catch (e) { return handleApiError(e); }
}
