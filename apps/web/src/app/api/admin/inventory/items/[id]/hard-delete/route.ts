import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { logActivity } from '@/lib/activity-logger';
import { PERMISSIONS } from '@gearup/types';

/**
 * POST /api/admin/inventory/items/[id]/hard-delete
 *
 * Permanently removes an inventory item and ALL related records (stock movements,
 * job card parts, model associations). This is irreversible and restricted to
 * SUPER_ADMIN only.
 *
 * Use case: cleaning up test data or correcting duplicate/erroneous entries that
 * should never have existed.
 */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = requirePermission(PERMISSIONS.INVENTORY_HARD_DELETE);

    const item = await prisma.inventoryItem.findUniqueOrThrow({
      where: { id: params.id },
      select: { id: true, sku: true, itemName: true },
    });

    await prisma.$transaction(async (tx) => {
      // Remove model associations (would cascade, but explicit for clarity)
      await tx.inventoryItemModel.deleteMany({ where: { inventoryItemId: params.id } });
      // Remove all stock movement history
      await tx.stockMovement.deleteMany({ where: { inventoryItemId: params.id } });
      // Remove job card part references
      await tx.jobCardPart.deleteMany({ where: { inventoryItemId: params.id } });
      // Finally delete the item itself
      await tx.inventoryItem.delete({ where: { id: params.id } });
    });

    logActivity({
      entityType: 'InventoryItem',
      entityId: params.id,
      action: 'inventory.item.hard-deleted',
      newValue: { sku: item.sku, itemName: item.itemName },
      actorType: 'ADMIN',
      actorId: user.sub,
    });

    return NextResponse.json({
      success: true,
      message: `Item "${item.itemName}" (${item.sku}) permanently deleted`,
    });
  } catch (e) {
    return handleApiError(e);
  }
}
