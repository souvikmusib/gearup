import { Router } from 'express';
import { asyncHandler } from '../../common/utils/async-handler';
import { prisma } from '@gearup/db';
import { paginate, paginationMeta } from '@gearup/db';
import { requirePermission } from '../../common/middleware/auth';
import { PERMISSIONS } from '@gearup/types';
import { logActivity } from '../../common/utils/activity-logger';
import { z } from 'zod';

const router = Router();

// Items
router.get('/items', requirePermission(PERMISSIONS.INVENTORY_VIEW), asyncHandler(async (req, res) => {
  const { page, pageSize, search, categoryId } = req.query as Record<string, string>;
  const p = paginate({ page: Number(page) || 1, pageSize: Number(pageSize) || 20 });
  const where: Record<string, unknown> = {};
  if (categoryId) where.categoryId = categoryId;
  if (search) where.OR = [
    { itemName: { contains: search, mode: 'insensitive' } },
    { sku: { contains: search, mode: 'insensitive' } },
  ];
  const [data, total] = await Promise.all([
    prisma.inventoryItem.findMany({ where, ...p, orderBy: { itemName: 'asc' }, include: { category: { select: { categoryName: true } }, supplier: { select: { supplierName: true } } } }),
    prisma.inventoryItem.count({ where }),
  ]);
  res.json({ success: true, data, meta: paginationMeta(total, Number(page) || 1, Number(pageSize) || 20) });
}));

router.post('/items', requirePermission(PERMISSIONS.INVENTORY_EDIT), asyncHandler(async (req, res) => {
  const body = z.object({
    sku: z.string().min(1), itemName: z.string().min(1), categoryId: z.string(), supplierId: z.string().optional(),
    brand: z.string().optional(), description: z.string().optional(), unit: z.string().min(1),
    taxRate: z.number().optional(), costPrice: z.number().optional(), sellingPrice: z.number().optional(),
    quantityInStock: z.number().optional(), reorderLevel: z.number().optional(), reorderQuantity: z.number().optional(),
    storageLocation: z.string().optional(), barcode: z.string().optional(),
  }).parse(req.body);
  const item = await prisma.inventoryItem.create({ data: body });
  await logActivity({ entityType: 'InventoryItem', entityId: item.id, action: 'inventory.item.created', newValue: item, actorType: 'ADMIN', actorId: req.user!.sub, requestId: req.requestId });
  res.status(201).json({ success: true, data: item });
}));

router.patch('/items/:id', requirePermission(PERMISSIONS.INVENTORY_EDIT), asyncHandler(async (req, res) => {
  const item = await prisma.inventoryItem.update({ where: { id: req.params.id }, data: req.body });
  res.json({ success: true, data: item });
}));

// Stock movements
router.get('/movements', requirePermission(PERMISSIONS.INVENTORY_VIEW), asyncHandler(async (req, res) => {
  const { page, pageSize, movementType, itemId } = req.query as Record<string, string>;
  const p = paginate({ page: Number(page) || 1, pageSize: Number(pageSize) || 20 });
  const where: Record<string, unknown> = {};
  if (movementType) where.movementType = movementType;
  if (itemId) where.inventoryItemId = itemId;
  const [data, total] = await Promise.all([
    prisma.stockMovement.findMany({ where, ...p, orderBy: { createdAt: 'desc' }, include: { inventoryItem: { select: { itemName: true, sku: true } } } }),
    prisma.stockMovement.count({ where }),
  ]);
  res.json({ success: true, data, meta: paginationMeta(total, Number(page) || 1, Number(pageSize) || 20) });
}));

router.post('/stock-movements', requirePermission(PERMISSIONS.INVENTORY_STOCK_MOVE), asyncHandler(async (req, res) => {
  const body = z.object({
    inventoryItemId: z.string(), movementType: z.string(), quantity: z.number(),
    reason: z.string().optional(), relatedEntityType: z.string().optional(), relatedEntityId: z.string().optional(),
  }).parse(req.body);

  const result = await prisma.$transaction(async (tx) => {
    const item = await tx.inventoryItem.findUniqueOrThrow({ where: { id: body.inventoryItemId } });
    const prev = Number(item.quantityInStock);
    const delta = ['STOCK_IN', 'ADJUSTMENT_INCREASE', 'RETURNED', 'RELEASED'].includes(body.movementType) ? body.quantity : -body.quantity;
    const newQty = prev + delta;
    await tx.inventoryItem.update({ where: { id: item.id }, data: { quantityInStock: newQty } });
    return tx.stockMovement.create({
      data: {
        inventoryItemId: body.inventoryItemId, movementType: body.movementType as any,
        quantity: body.quantity, previousQuantity: prev, newQuantity: newQty,
        reason: body.reason, relatedEntityType: body.relatedEntityType, relatedEntityId: body.relatedEntityId,
        performedByAdminId: req.user!.sub,
      },
    });
  });

  await logActivity({ entityType: 'InventoryItem', entityId: body.inventoryItemId, action: 'inventory.stock.adjusted', newValue: result, actorType: 'ADMIN', actorId: req.user!.sub, requestId: req.requestId });
  res.status(201).json({ success: true, data: result });
}));

router.get('/low-stock', requirePermission(PERMISSIONS.INVENTORY_VIEW), asyncHandler(async (_req, res) => {
  const items = await prisma.$queryRaw`
    SELECT i.*, c."categoryName" FROM "InventoryItem" i
    LEFT JOIN "InventoryCategory" c ON i."categoryId" = c.id
    WHERE i."reorderLevel" IS NOT NULL AND i."quantityInStock" <= i."reorderLevel" AND i."isActive" = true
    ORDER BY (i."quantityInStock" / NULLIF(i."reorderLevel", 0)) ASC
  `;
  res.json({ success: true, data: items });
}));

// Categories
router.get('/categories', requirePermission(PERMISSIONS.INVENTORY_VIEW), asyncHandler(async (_req, res) => {
  const data = await prisma.inventoryCategory.findMany({ include: { _count: { select: { items: true } } }, orderBy: { categoryName: 'asc' } });
  res.json({ success: true, data });
}));

router.post('/categories', requirePermission(PERMISSIONS.INVENTORY_EDIT), asyncHandler(async (req, res) => {
  const { categoryName, description } = z.object({ categoryName: z.string(), description: z.string().optional() }).parse(req.body);
  const cat = await prisma.inventoryCategory.create({ data: { categoryName, description } });
  res.status(201).json({ success: true, data: cat });
}));

// Suppliers
router.get('/suppliers', requirePermission(PERMISSIONS.INVENTORY_VIEW), asyncHandler(async (_req, res) => {
  const data = await prisma.supplier.findMany({ include: { _count: { select: { items: true } } }, orderBy: { supplierName: 'asc' } });
  res.json({ success: true, data });
}));

router.post('/suppliers', requirePermission(PERMISSIONS.INVENTORY_EDIT), asyncHandler(async (req, res) => {
  const body = z.object({ supplierName: z.string(), phone: z.string().optional(), email: z.string().optional(), address: z.string().optional(), contactPerson: z.string().optional(), notes: z.string().optional() }).parse(req.body);
  const supplier = await prisma.supplier.create({ data: body });
  res.status(201).json({ success: true, data: supplier });
}));

export default router;
