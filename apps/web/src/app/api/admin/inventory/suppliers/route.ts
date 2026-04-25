import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { logActivity } from '@/lib/activity-logger';
import { PERMISSIONS } from '@gearup/types';
import { z } from 'zod';

export async function GET() {
  try {
    requirePermission(PERMISSIONS.INVENTORY_VIEW);
    const data = await prisma.supplier.findMany({ orderBy: { supplierName: 'asc' }, include: { _count: { select: { items: true } } } });
    return NextResponse.json({ success: true, data });
  } catch (e) { return handleApiError(e); }
}

export async function POST(req: NextRequest) {
  try {
    const user = requirePermission(PERMISSIONS.INVENTORY_EDIT);
    const body = z.object({
      supplierName: z.string().min(1), phone: z.string().optional(), email: z.string().optional(),
      address: z.string().optional(), contactPerson: z.string().optional(), notes: z.string().optional(),
    }).parse(await req.json());
    const sup = await prisma.supplier.create({ data: body });
    logActivity({ entityType: 'Supplier', entityId: sup.id, action: 'supplier.created', newValue: sup, actorType: 'ADMIN', actorId: user.sub });
    return NextResponse.json({ success: true, data: sup }, { status: 201 });
  } catch (e) { return handleApiError(e); }
}
