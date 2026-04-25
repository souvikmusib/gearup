import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { logActivity } from '@/lib/activity-logger';
import { PERMISSIONS } from '@gearup/types';
import { z } from 'zod';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    requirePermission(PERMISSIONS.INVENTORY_VIEW);
    const item = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: params.id }, include: { category: true, supplier: true } });
    return NextResponse.json({ success: true, data: item });
  } catch (e) { return handleApiError(e); }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = requirePermission(PERMISSIONS.INVENTORY_EDIT);
    const body = z.object({
      itemName: z.string().min(1).optional(), categoryId: z.string().optional(), supplierId: z.string().nullable().optional(),
      brand: z.string().nullable().optional(), description: z.string().nullable().optional(), unit: z.string().min(1).optional(),
      taxRate: z.number().optional(), costPrice: z.number().optional(), sellingPrice: z.number().optional(),
      reorderLevel: z.number().nullable().optional(), reorderQuantity: z.number().nullable().optional(),
      storageLocation: z.string().nullable().optional(), barcode: z.string().nullable().optional(), isActive: z.boolean().optional(),
    }).parse(await req.json());
    const item = await prisma.inventoryItem.update({ where: { id: params.id }, data: body as any });
    logActivity({ entityType: 'InventoryItem', entityId: item.id, action: 'inventory.item.updated', newValue: body, actorType: 'ADMIN', actorId: user.sub });
    return NextResponse.json({ success: true, data: item });
  } catch (e) { return handleApiError(e); }
}
