import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { paginate, paginationMeta } from '@/lib/pagination';
import { requirePermission } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { logActivity } from '@/lib/activity-logger';
import { PERMISSIONS } from '@gearup/types';
import { z } from 'zod';

export async function GET(req: NextRequest) {
  try {
    requirePermission(PERMISSIONS.INVENTORY_VIEW);
    const sp = req.nextUrl.searchParams;
    const page = Number(sp.get('page')) || 1;
    const pageSize = Math.min(Number(sp.get('pageSize')) || 20, 500);
    const search = sp.get('search') || '';
    const categoryId = sp.get('categoryId') || '';
    const p = paginate({ page, pageSize });
    const where: Prisma.InventoryItemWhereInput = {};
    if (categoryId) where.categoryId = categoryId;
    if (search) where.OR = [{ itemName: { contains: search, mode: 'insensitive' } }, { sku: { contains: search, mode: 'insensitive' } }];
    const [data, total] = await Promise.all([
      prisma.inventoryItem.findMany({ where, ...p, orderBy: { itemName: 'asc' }, include: { category: { select: { categoryName: true } }, supplier: { select: { supplierName: true } } } }),
      prisma.inventoryItem.count({ where }),
    ]);
    return NextResponse.json({ success: true, data, meta: paginationMeta(total, page, pageSize) });
  } catch (e) { return handleApiError(e); }
}

export async function POST(req: NextRequest) {
  try {
    const user = requirePermission(PERMISSIONS.INVENTORY_EDIT);
    const body = z.object({
      sku: z.string().min(1), itemName: z.string().min(1), categoryId: z.string().min(1), supplierId: z.string().min(1).optional(),
      brand: z.string().optional(), description: z.string().optional(), unit: z.string().min(1),
      taxRate: z.number().nonnegative().optional(), costPrice: z.number().nonnegative().optional(), mrp: z.number().nonnegative().optional(), sellingPrice: z.number().nonnegative().optional(), discountPercent: z.number().min(0).max(100).optional(),
      quantityInStock: z.number().nonnegative().optional(), reorderLevel: z.number().nonnegative().optional(), reorderQuantity: z.number().nonnegative().optional(),
      storageLocation: z.string().optional(), barcode: z.string().optional(),
      variablePrice: z.boolean().optional(), isBranded: z.boolean().optional(),
    }).parse(await req.json());
    const openingQty = body.quantityInStock ?? 0;
    const item = await prisma.$transaction(async (tx) => {
      const created = await tx.inventoryItem.create({
        data: {
          sku: body.sku,
          itemName: body.itemName,
          categoryId: body.categoryId,
          supplierId: body.supplierId,
          brand: body.brand,
          description: body.description,
          unit: body.unit,
          taxRate: body.taxRate,
          costPrice: body.costPrice,
          sellingPrice: body.sellingPrice,
          discountPercent: body.discountPercent,
          quantityInStock: body.quantityInStock,
          reorderLevel: body.reorderLevel,
          reorderQuantity: body.reorderQuantity,
          storageLocation: body.storageLocation,
          barcode: body.barcode,
        },
      });
      if (openingQty > 0) {
        await tx.stockMovement.create({
          data: {
            inventoryItemId: created.id,
            movementType: 'STOCK_IN',
            quantity: openingQty,
            previousQuantity: 0,
            newQuantity: openingQty,
            reason: 'Opening balance',
            performedByAdminId: user.sub,
          },
        });
      }
      return created;
    });
    await logActivity({ entityType: 'InventoryItem', entityId: item.id, action: 'inventory.item.created', newValue: item, actorType: 'ADMIN', actorId: user.sub });
    return NextResponse.json({ success: true, data: item }, { status: 201 });
  } catch (e) { return handleApiError(e); }
}
