import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { PERMISSIONS } from '@gearup/types';

export async function GET() {
  try {
    requirePermission(PERMISSIONS.INVENTORY_VIEW);
    // Filter low-stock rows in SQL (column-to-column comparison) rather than fetching
    // every active reorder-tracked item and filtering in JS. Prisma's `where` cannot
    // express column-to-column comparisons, so we resolve matching ids via $queryRaw
    // and then load them through the typed client to preserve the include shape.
    const rows = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM "InventoryItem"
      WHERE "isActive" = true
        AND "reorderLevel" IS NOT NULL
        AND "quantityInStock" <= "reorderLevel"
    `;
    const ids = rows.map((r) => r.id);
    if (ids.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }
    const lowStock = await prisma.inventoryItem.findMany({
      where: { id: { in: ids } },
      include: { category: { select: { categoryName: true } }, supplier: { select: { supplierName: true } } },
      orderBy: { itemName: 'asc' },
    });
    return NextResponse.json({ success: true, data: lowStock });
  } catch (e) {
    return handleApiError(e);
  }
}
