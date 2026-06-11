import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { paginate, paginationMeta } from '@/lib/pagination';
import { requirePermission } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { PERMISSIONS } from '@gearup/types';
import { z } from 'zod';

const querySchema = z.object({
  movementType: z.preprocess(v => v === '' ? undefined : v, z.enum(['STOCK_IN', 'STOCK_OUT', 'ADJUSTMENT_INCREASE', 'ADJUSTMENT_DECREASE', 'RESERVED', 'CONSUMED']).optional()),
  inventoryItemId: z.string().optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().min(1).max(200).optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
});

export async function GET(req: NextRequest) {
  try {
    requirePermission(PERMISSIONS.INVENTORY_VIEW);
    const sp = req.nextUrl.searchParams;
    const parsed = querySchema.parse(Object.fromEntries(sp));
    const page = parsed.page ?? 1;
    const pageSize = parsed.pageSize ?? 50;
    const p = paginate({ page, pageSize });
    const where: Prisma.StockMovementWhereInput = {};
    if (parsed.movementType) where.movementType = parsed.movementType;
    if (parsed.inventoryItemId) where.inventoryItemId = parsed.inventoryItemId;
    if (parsed.dateFrom || parsed.dateTo) {
      where.createdAt = {};
      if (parsed.dateFrom) (where.createdAt as Prisma.DateTimeFilter).gte = parsed.dateFrom;
      if (parsed.dateTo) (where.createdAt as Prisma.DateTimeFilter).lte = parsed.dateTo;
    }
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
