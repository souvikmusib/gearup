import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { logActivity } from '@/lib/activity-logger';
import { PERMISSIONS } from '@gearup/types';
import { z } from 'zod';

const updateSchema = z.object({
  fullName: z.string().optional(), phoneNumber: z.string().optional(), alternatePhone: z.string().optional(),
  email: z.string().email().optional(), addressLine1: z.string().optional(), addressLine2: z.string().optional(),
  city: z.string().optional(), state: z.string().optional(), postalCode: z.string().optional(),
  notes: z.string().optional(), source: z.string().optional(),
});

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    requirePermission(PERMISSIONS.CUSTOMERS_VIEW);
    const customer = await prisma.customer.findUniqueOrThrow({ where: { id: params.id }, include: { vehicles: true, serviceRequests: { orderBy: { createdAt: 'desc' }, take: 10 }, invoices: { orderBy: { createdAt: 'desc' }, take: 10 } } });
    return NextResponse.json({ success: true, data: customer });
  } catch (e) { return handleApiError(e); }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = requirePermission(PERMISSIONS.CUSTOMERS_EDIT);
    const body = updateSchema.parse(await req.json());
    const prev = await prisma.customer.findUniqueOrThrow({ where: { id: params.id } });
    const customer = await prisma.customer.update({ where: { id: params.id }, data: body as any });
    logActivity({ entityType: 'Customer', entityId: customer.id, action: 'customer.updated', previousValue: prev, newValue: customer, actorType: 'ADMIN', actorId: user.sub });
    return NextResponse.json({ success: true, data: customer });
  } catch (e) { return handleApiError(e); }
}
