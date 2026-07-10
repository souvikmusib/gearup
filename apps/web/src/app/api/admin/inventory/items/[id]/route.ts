import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { handleApiError, AppError } from '@/lib/errors';
import { logActivity } from '@/lib/activity-logger';
import { PERMISSIONS } from '@gearup/types';
import { z } from 'zod';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    requirePermission(PERMISSIONS.INVENTORY_VIEW);
    const item = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: params.id }, include: { category: true, supplier: true, vehicleModels: { include: { vehicleModel: { include: { brand: true } } } } } });
    return NextResponse.json({ success: true, data: item });
  } catch (e) { return handleApiError(e); }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = requirePermission(PERMISSIONS.INVENTORY_EDIT);
    const body = z.object({
      sku: z.string().min(1).optional(),
      itemName: z.string().min(1).optional(), categoryId: z.string().optional(), supplierId: z.string().nullable().optional(),
      brand: z.string().nullable().optional(), description: z.string().nullable().optional(), unit: z.string().min(1).optional(),
      taxRate: z.number().nonnegative().optional(), costPrice: z.number().nonnegative().optional(), mrp: z.number().nonnegative().nullable().optional(), sellingPrice: z.number().nonnegative().optional(), discountPercent: z.number().min(0).max(100).nullable().optional(), amcDiscountPercent: z.number().min(0).max(90).nullable().optional(),
      reorderLevel: z.number().nonnegative().nullable().optional(), reorderQuantity: z.number().nonnegative().nullable().optional(),
      storageLocation: z.string().nullable().optional(), barcode: z.string().nullable().optional(), hsnCode: z.string().nullable().optional(), isActive: z.boolean().optional(),
      variablePrice: z.boolean().optional(), isBranded: z.boolean().optional(),
      modelIds: z.string().array().optional(),
    }).parse(await req.json());
    const { modelIds, ...data } = body;
    const item = await prisma.$transaction(async (tx) => {
      const updated = await tx.inventoryItem.update({ where: { id: params.id }, data });
      if (modelIds !== undefined) {
        await tx.inventoryItemModel.deleteMany({ where: { inventoryItemId: params.id } });
        if (modelIds.length) {
          await tx.inventoryItemModel.createMany({ data: modelIds.map(vehicleModelId => ({ inventoryItemId: params.id, vehicleModelId })) });
        }
      }
      return updated;
    });
    logActivity({ entityType: 'InventoryItem', entityId: item.id, action: 'inventory.item.updated', newValue: body, actorType: 'ADMIN', actorId: user.sub });
    return NextResponse.json({ success: true, data: item });
  } catch (e) { return handleApiError(e); }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = requirePermission(PERMISSIONS.INVENTORY_EDIT);
    let softDeleted = false;
    await prisma.$transaction(async (tx) => {
      const existing = await tx.inventoryItem.findUniqueOrThrow({ where: { id: params.id }, select: { reservedQuantity: true, quantityInStock: true } });
      if (Number(existing.reservedQuantity) > 0) {
        throw new AppError(409, `Cannot delete — item has ${existing.reservedQuantity} unit(s) reserved`, 'CONFLICT');
      }
      // If referenced in invoices, only allow deactivation (and only if stock is 0)
      const invoiceRefCount = await tx.invoiceLineItem.count({ where: { referenceItemId: params.id } });
      if (invoiceRefCount > 0) {
        if (Number(existing.quantityInStock) > 0) {
          throw new AppError(409, `Cannot delete — item is referenced in ${invoiceRefCount} invoice(s) and still has ${existing.quantityInStock} unit(s) in stock.`, 'CONFLICT');
        }
        await tx.inventoryItem.update({ where: { id: params.id }, data: { isActive: false } });
        softDeleted = true;
        return;
      }
      const movementCount = await tx.stockMovement.count({ where: { inventoryItemId: params.id } });
      if (movementCount > 0) {
        // Soft-delete: item has historical stock movements; preserve audit trail.
        await tx.inventoryItem.update({ where: { id: params.id }, data: { isActive: false } });
        softDeleted = true;
        return;
      }
      await tx.inventoryItemModel.deleteMany({ where: { inventoryItemId: params.id } });
      await tx.jobCardPart.deleteMany({ where: { inventoryItemId: params.id } });
      await tx.stockMovement.deleteMany({ where: { inventoryItemId: params.id } });
      await tx.inventoryItem.delete({ where: { id: params.id } });
    });
    logActivity({ entityType: 'InventoryItem', entityId: params.id, action: softDeleted ? 'inventory.item.deactivated' : 'inventory.item.deleted', actorType: 'ADMIN', actorId: user.sub });
    return NextResponse.json({ success: true, message: softDeleted ? 'Item deactivated (referenced in invoices or has stock history)' : 'Item deleted' });
  } catch (e) { return handleApiError(e); }
}
