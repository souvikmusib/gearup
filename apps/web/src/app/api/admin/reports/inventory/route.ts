import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { PERMISSIONS } from '@gearup/types';

export async function GET() {
  try {
    requirePermission(PERMISSIONS.REPORTS_VIEW);
    const [totalItems, lowStock, totalValue, categories] = await Promise.all([
      prisma.inventoryItem.count({ where: { isActive: true } }),
      prisma.$queryRawUnsafe<[{count: bigint}]>('SELECT COUNT(*) as count FROM "InventoryItem" WHERE "isActive" = true AND "reorderLevel" IS NOT NULL AND "quantityInStock" <= "reorderLevel"').then((r) => Number(r[0]?.count ?? 0)),
      prisma.inventoryItem.aggregate({ where: { isActive: true }, _sum: { quantityInStock: true } }),
      prisma.inventoryCategory.findMany({ select: { categoryName: true, _count: { select: { items: true } } }, orderBy: { categoryName: 'asc' } }),
    ]);
    return NextResponse.json({ success: true, data: { totalItems, lowStock, totalStock: Number(totalValue._sum.quantityInStock ?? 0), categories: categories.map((c) => ({ name: c.categoryName, items: c._count.items })) } });
  } catch (e) { return handleApiError(e); }
}
