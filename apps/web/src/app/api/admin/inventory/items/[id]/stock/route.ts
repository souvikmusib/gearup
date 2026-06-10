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
  quantity: z.number().positive(),
  reason: z.string().optional(),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = requirePermission(PERMISSIONS.INVENTORY_EDIT);
    const body = schema.parse(await req.json());
    const isIncrease = body.type === 'STOCK_IN' || body.type === 'ADJUSTMENT_INCREASE';
    const delta = isIncrease ? body.quantity : -body.quantity;

    const result = await prisma.$transaction(async (tx) => {
      // Atomic update with guard + RETURNING so the post-update value cannot
      // be polluted by a concurrent committed increment between the write
      // and a subsequent read (READ COMMITTED isolation).
      const rows = await tx.$queryRaw<Array<{ quantityInStock: Prisma.Decimal }>>`
        UPDATE "InventoryItem"
        SET "quantityInStock" = "quantityInStock" + ${delta}::numeric
        WHERE "id" = ${params.id}
          AND (${isIncrease}::boolean OR "quantityInStock" >= ${body.quantity}::numeric)
        RETURNING "quantityInStock"
      `;
      if (rows.length === 0) throw new ValidationError('Insufficient stock for this adjustment.');

      const newQty = Number(rows[0].quantityInStock);
      const prev = newQty - delta;

      await tx.stockMovement.create({
        data: { inventoryItemId: params.id, movementType: body.type, quantity: body.quantity, previousQuantity: prev, newQuantity: newQty, reason: body.reason, performedByAdminId: user.sub },
      });

      return { previousQuantity: prev, newQuantity: newQty };
    });

    logActivity({ entityType: 'InventoryItem', entityId: params.id, action: `inventory.stock.${body.type.toLowerCase()}`, newValue: { ...body, ...result }, actorType: 'ADMIN', actorId: user.sub });
    return NextResponse.json({ success: true, data: result });
  } catch (e) { return handleApiError(e); }
}
