import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { PERMISSIONS } from '@gearup/types';

/**
 * GET /api/admin/inventory/items/[id]/batches
 *
 * List all stock batches for an inventory item.
 * Shows batch-wise stock breakdown, age, cost, and expiry info.
 *
 * Query params:
 *   - includeExhausted: "true" to include batches with 0 remaining (default: false)
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    requirePermission(PERMISSIONS.INVENTORY_VIEW);

    const includeExhausted = req.nextUrl.searchParams.get('includeExhausted') === 'true';

    const batches = await prisma.stockBatch.findMany({
      where: {
        inventoryItemId: params.id,
        ...(includeExhausted ? {} : { remainingQty: { gt: 0 } }),
      },
      orderBy: { purchaseDate: 'asc' },
      include: {
        supplier: { select: { id: true, supplierName: true } },
      },
    });

    // Compute summary stats
    const totalRemaining = batches.reduce((sum, b) => sum + Number(b.remainingQty), 0);
    const totalValue = batches.reduce(
      (sum, b) => sum + Number(b.remainingQty) * Number(b.costPrice),
      0,
    );
    const weightedAvgCost = totalRemaining > 0 ? totalValue / totalRemaining : 0;

    // Find expired/near-expiry batches
    const now = new Date();
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const batchesWithAge = batches.map((b) => {
      const ageDays = Math.floor((now.getTime() - b.purchaseDate.getTime()) / (1000 * 60 * 60 * 24));
      const isExpired = b.expiryDate ? b.expiryDate < now : false;
      const isNearExpiry = b.expiryDate ? b.expiryDate < thirtyDaysFromNow && !isExpired : false;

      return {
        ...b,
        costPrice: Number(b.costPrice),
        initialQty: Number(b.initialQty),
        remainingQty: Number(b.remainingQty),
        ageDays,
        isExpired,
        isNearExpiry,
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        batches: batchesWithAge,
        summary: {
          totalBatches: batches.length,
          totalRemaining,
          totalValue: Math.round(totalValue * 100) / 100,
          weightedAvgCost: Math.round(weightedAvgCost * 100) / 100,
          expiredBatches: batchesWithAge.filter((b) => b.isExpired).length,
          nearExpiryBatches: batchesWithAge.filter((b) => b.isNearExpiry).length,
        },
      },
    });
  } catch (e) {
    return handleApiError(e);
  }
}
