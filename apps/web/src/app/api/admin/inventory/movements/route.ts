import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { paginate, paginationMeta } from '@/lib/pagination';
import { requirePermission } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { PERMISSIONS } from '@gearup/types';

export async function GET(req: NextRequest) {
  try {
    requirePermission(PERMISSIONS.INVENTORY_VIEW);
    const sp = req.nextUrl.searchParams;
    const page = Number(sp.get('page')) || 1;
    const pageSize = Number(sp.get('pageSize')) || 50;
    const p = paginate({ page, pageSize });
    const where: Record<string, unknown> = {};
    const movementType = sp.get('movementType');
    const inventoryItemId = sp.get('inventoryItemId');
    if (movementType) where.movementType = movementType;
    if (inventoryItemId) where.inventoryItemId = inventoryItemId;
    const [data, total] = await Promise.all([
      prisma.stockMovement.findMany({
        where,
        ...p,
        orderBy: { createdAt: 'desc' },
        include: { inventoryItem: { select: { itemName: true, sku: true } } },
      }),
      prisma.stockMovement.count({ where }),
    ]);
    return NextResponse.json({ success: true, data, meta: paginationMeta(total, page, pageSize) });
  } catch (e) {
    return handleApiError(e);
  }
}
