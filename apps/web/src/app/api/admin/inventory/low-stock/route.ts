import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { PERMISSIONS } from '@gearup/types';

export async function GET() {
  try {
    requirePermission(PERMISSIONS.INVENTORY_VIEW);
    const items = await prisma.inventoryItem.findMany({
      where: { isActive: true, reorderLevel: { not: null } },
      include: { category: { select: { categoryName: true } }, supplier: { select: { supplierName: true } } },
      orderBy: { itemName: 'asc' },
    });
    const lowStock = items.filter((item) => Number(item.quantityInStock) <= Number(item.reorderLevel));
    return NextResponse.json({ success: true, data: lowStock });
  } catch (e) {
    return handleApiError(e);
  }
}
