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
    const data = await prisma.inventoryCategory.findMany({ orderBy: { categoryName: 'asc' }, include: { _count: { select: { items: true } } } });
    return NextResponse.json({ success: true, data });
  } catch (e) { return handleApiError(e); }
}

export async function POST(req: NextRequest) {
  try {
    const user = requirePermission(PERMISSIONS.INVENTORY_EDIT);
    const body = z.object({ categoryName: z.string().min(1), description: z.string().optional() }).parse(await req.json());
    const cat = await prisma.inventoryCategory.create({ data: body });
    logActivity({ entityType: 'InventoryCategory', entityId: cat.id, action: 'inventory.category.created', newValue: cat, actorType: 'ADMIN', actorId: user.sub });
    return NextResponse.json({ success: true, data: cat }, { status: 201 });
  } catch (e) { return handleApiError(e); }
}
