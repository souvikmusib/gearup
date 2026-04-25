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
    const body = z.object({ categoryName: z.string().min(1).optional(), description: z.string().nullable().optional() }).parse(await req.json());
    const cat = await prisma.inventoryCategory.update({ where: { id: params.id }, data: body });
    logActivity({ entityType: 'InventoryCategory', entityId: cat.id, action: 'inventory.category.updated', newValue: body, actorType: 'ADMIN', actorId: user.sub });
    return NextResponse.json({ success: true, data: cat });
  } catch (e) { return handleApiError(e); }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = requirePermission(PERMISSIONS.INVENTORY_EDIT);
    await prisma.inventoryCategory.delete({ where: { id: params.id } });
    logActivity({ entityType: 'InventoryCategory', entityId: params.id, action: 'inventory.category.deleted', actorType: 'ADMIN', actorId: user.sub });
    return NextResponse.json({ success: true });
  } catch (e) { return handleApiError(e); }
}
