import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { logActivity } from '@/lib/activity-logger';
import { PERMISSIONS } from '@gearup/types';

/**
 * POST /api/admin/inventory/items/[id]/hard-delete
 *
 * Permanently removes an inventory item and ALL related records from the database.
 * Restricted to SUPER_ADMIN only. This is irreversible.
 *
 * If the item is referenced in invoice line items, it will be deactivated instead
 * to preserve invoice history.
 */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = requirePermission(PERMISSIONS.INVENTORY_HARD_DELETE);

    const item = await prisma.inventoryItem.findUniqueOrThrow({
      where: { id: params.id },
      select: { id: true, sku: true, itemName: true },
    });

    // Check if item has been referenced in invoices — if so, deactivate instead
    const usedInInvoices = await prisma.invoiceLineItem.count({ where: { referenceItemId: params.id } });

    if (usedInInvoices > 0) {
      await prisma.inventoryItem.update({ where: { id: params.id }, data: { isActive: false } });

      logActivity({
        entityType: 'InventoryItem',
        entityId: params.id,
        action: 'inventory.item.deactivated',
        newValue: { sku: item.sku, itemName: item.itemName, reason: `referenced in ${usedInInvoices} invoice line item(s)` },
        actorType: 'ADMIN',
        actorId: user.sub,
      });

      return NextResponse.json({
        success: true,
        message: `Item "${item.itemName}" is referenced in ${usedInInvoices} invoice(s) — deactivated instead.`,
      });
    }

    // Safe to hard-delete: not referenced in any invoice
    await prisma.$transaction(async (tx) => {
      await tx.inventoryItemModel.deleteMany({ where: { inventoryItemId: params.id } });
      await tx.stockMovement.deleteMany({ where: { inventoryItemId: params.id } });
      await tx.jobCardPart.deleteMany({ where: { inventoryItemId: params.id } });
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
