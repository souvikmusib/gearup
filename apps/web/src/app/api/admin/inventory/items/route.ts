import { NextRequest, NextResponse } from 'next/server';
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
    const pageSize = Number(sp.get('pageSize')) || 20;
    const search = sp.get('search') || '';
    const categoryId = sp.get('categoryId') || '';
    const p = paginate({ page, pageSize });
    const where: Record<string, unknown> = {};
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
      sku: z.string().min(1), itemName: z.string().min(1), categoryId: z.string(), supplierId: z.string().optional(),
      brand: z.string().optional(), description: z.string().optional(), unit: z.string().min(1),
      taxRate: z.number().optional(), costPrice: z.number().optional(), sellingPrice: z.number().optional(),
      quantityInStock: z.number().optional(), reorderLevel: z.number().optional(), reorderQuantity: z.number().optional(),
      storageLocation: z.string().optional(), barcode: z.string().optional(),
    }).parse(await req.json());
    const item = await prisma.inventoryItem.create({ data: body as any });
    await logActivity({ entityType: 'InventoryItem', entityId: item.id, action: 'inventory.item.created', newValue: item, actorType: 'ADMIN', actorId: user.sub });
    return NextResponse.json({ success: true, data: item }, { status: 201 });
  } catch (e) { return handleApiError(e); }
}
