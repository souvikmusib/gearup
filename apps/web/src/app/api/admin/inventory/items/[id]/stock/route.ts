import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { handleApiError, ValidationError } from '@/lib/errors';
import { logActivity } from '@/lib/activity-logger';
import { PERMISSIONS } from '@gearup/types';
import { z } from 'zod';

const schema = z.object({
  type: z.enum(['STOCK_IN', 'STOCK_OUT', 'ADJUSTMENT_INCREASE', 'ADJUSTMENT_DECREASE']),
  quantity: z.number().positive().multipleOf(0.01),
  reason: z.string().optional(),
  // Batch fields — used for STOCK_IN
  costPrice: z.number().positive().multipleOf(0.01).optional(),
  sellingPrice: z.number().positive().multipleOf(0.01).optional(),
  mrp: z.number().positive().multipleOf(0.01).optional(),
  supplierId: z.string().optional(),
  purchaseRef: z.string().optional(),
  expiryDate: z.string().datetime().optional(),
  batchNumber: z.string().optional(),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = requirePermission(PERMISSIONS.INVENTORY_EDIT);
    const body = schema.parse(await req.json());
    const isIncrease = body.type === 'STOCK_IN' || body.type === 'ADJUSTMENT_INCREASE';
    const delta = isIncrease ? body.quantity : -body.quantity;

    const result = await prisma.$transaction(async (tx) => {
      // Atomic update with guard + RETURNING
      const rows = await tx.$queryRaw<Array<{ quantityInStock: Prisma.Decimal; costPrice: Prisma.Decimal }>>`
        UPDATE "InventoryItem"
        SET "quantityInStock" = "quantityInStock" + ${delta}::numeric
        WHERE "id" = ${params.id}
          AND (${isIncrease}::boolean OR "quantityInStock" >= ${body.quantity}::numeric)
        RETURNING "quantityInStock", "costPrice"
      `;
      if (rows.length === 0) throw new ValidationError('Insufficient stock for this adjustment.');

      const newQty = Number(rows[0].quantityInStock);
      const prev = newQty - delta;

      let batchId: string | undefined;

      // Create a batch on STOCK_IN
      if (body.type === 'STOCK_IN') {
        const batchCost = body.costPrice ?? Number(rows[0].costPrice);
        // Get current item sellingPrice/mrp for fallback
        const item = await tx.inventoryItem.findUniqueOrThrow({
          where: { id: params.id },
          select: { sellingPrice: true, mrp: true },
        });
        const batchSellingPrice = body.sellingPrice ?? Number(item.sellingPrice);
        const batchMrp = body.mrp ?? (item.mrp ? Number(item.mrp) : null);

        const batch = await tx.stockBatch.create({
          data: {
            inventoryItemId: params.id,
            batchNumber: body.batchNumber || generateBatchNumber(),
            supplierId: body.supplierId || null,
            costPrice: batchCost,
            sellingPrice: batchSellingPrice,
            mrp: batchMrp,
            initialQty: body.quantity,
            remainingQty: body.quantity,
            purchaseDate: new Date(),
            expiryDate: body.expiryDate ? new Date(body.expiryDate) : null,
            purchaseRef: body.purchaseRef || null,
          },
        });
        batchId = batch.id;

        // Recalculate weighted average cost price on item (cost only — selling price stays on batch)
        if (body.costPrice) {
          const batches = await tx.stockBatch.findMany({
            where: { inventoryItemId: params.id, remainingQty: { gt: 0 } },
            select: { remainingQty: true, costPrice: true },
          });

          const totalQty = batches.reduce(
            (sum, b) => sum.add(new Prisma.Decimal(b.remainingQty)),
            new Prisma.Decimal(0)
          );

          if (totalQty.gt(0)) {
            const weightedSum = batches.reduce(
              (sum, b) => sum.add(new Prisma.Decimal(b.remainingQty).mul(new Prisma.Decimal(b.costPrice))),
              new Prisma.Decimal(0)
            );
            await tx.inventoryItem.update({
              where: { id: params.id },
              data: { costPrice: weightedSum.div(totalQty) },
            });
          }
        }
      }

      // Create stock movement with batch reference and cost
      await tx.stockMovement.create({
        data: {
          inventoryItemId: params.id,
          movementType: body.type,
          quantity: body.quantity,
          previousQuantity: prev,
          newQuantity: newQty,
          costPrice: body.costPrice ?? null,
          batchId: batchId ?? null,
          reason: body.reason,
          performedByAdminId: user.sub,
        },
      });

      return { previousQuantity: prev, newQuantity: newQty, batchId };
    });

    logActivity({
      entityType: 'InventoryItem',
      entityId: params.id,
      action: `inventory.stock.${body.type.toLowerCase()}`,
      newValue: { ...body, ...result },
      actorType: 'ADMIN',
      actorId: user.sub,
    });

    return NextResponse.json({ success: true, data: result });
  } catch (e) {
    return handleApiError(e);
  }
}

/** Generate a batch number like BATCH-2026-07-001 */
function generateBatchNumber(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const rand = String(Math.floor(Math.random() * 900) + 100);
  return `BATCH-${y}${m}${d}-${rand}`;
}
