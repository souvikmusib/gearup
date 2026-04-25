import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { logActivity } from '@/lib/activity-logger';
import { PERMISSIONS } from '@gearup/types';
import { z } from 'zod';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = requirePermission(PERMISSIONS.INVENTORY_EDIT);
    const body = z.object({
      supplierName: z.string().min(1).optional(), phone: z.string().nullable().optional(),
      email: z.string().nullable().optional(), address: z.string().nullable().optional(),
      contactPerson: z.string().nullable().optional(), notes: z.string().nullable().optional(),
    }).parse(await req.json());
    const sup = await prisma.supplier.update({ where: { id: params.id }, data: body });
    logActivity({ entityType: 'Supplier', entityId: sup.id, action: 'supplier.updated', newValue: body, actorType: 'ADMIN', actorId: user.sub });
    return NextResponse.json({ success: true, data: sup });
  } catch (e) { return handleApiError(e); }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = requirePermission(PERMISSIONS.INVENTORY_EDIT);
    await prisma.supplier.delete({ where: { id: params.id } });
    logActivity({ entityType: 'Supplier', entityId: params.id, action: 'supplier.deleted', actorType: 'ADMIN', actorId: user.sub });
    return NextResponse.json({ success: true });
  } catch (e) { return handleApiError(e); }
}
