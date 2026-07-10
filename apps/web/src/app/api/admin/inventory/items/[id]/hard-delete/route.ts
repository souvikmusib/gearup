import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { logActivity } from '@/lib/activity-logger';
import { PERMISSIONS } from '@gearup/types';

/**
 * POST /api/admin/inventory/items/[id]/hard-delete
 *
 * Deactivates an inventory item (sets isActive = false). Restricted to SUPER_ADMIN only.
 * Unlike the regular DELETE which may refuse if the item has invoice references or stock,
 * this always deactivates regardless of state.
 */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = requirePermission(PERMISSIONS.INVENTORY_HARD_DELETE);

    const item = await prisma.inventoryItem.findUniqueOrThrow({
      where: { id: params.id },
      select: { id: true, sku: true, itemName: true, isActive: true },
    });

    if (!item.isActive) {
      return NextResponse.json({ success: true, message: `Item "${item.itemName}" is already inactive.` });
    }

    await prisma.inventoryItem.update({
      where: { id: params.id },
      data: { isActive: false },
    });

    logActivity({
      entityType: 'InventoryItem',
      entityId: params.id,
      action: 'inventory.item.deactivated',
      newValue: { sku: item.sku, itemName: item.itemName },
      actorType: 'ADMIN',
      actorId: user.sub,
    });

    return NextResponse.json({
      success: true,
      message: `Item "${item.itemName}" (${item.sku}) deactivated`,
    });
  } catch (e) {
    return handleApiError(e);
  }
}
