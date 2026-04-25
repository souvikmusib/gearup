import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
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
    const item = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: params.id } });
    const prev = Number(item.quantityInStock);
    const isIncrease = body.type === 'STOCK_IN' || body.type === 'ADJUSTMENT_INCREASE';
    const newQty = isIncrease ? prev + body.quantity : Math.max(0, prev - body.quantity);

    await prisma.inventoryItem.update({ where: { id: params.id }, data: { quantityInStock: newQty } });
    await prisma.stockMovement.create({
      data: { inventoryItemId: params.id, movementType: body.type, quantity: body.quantity, previousQuantity: prev, newQuantity: newQty, reason: body.reason, performedByAdminId: user.sub },
    });
    logActivity({ entityType: 'InventoryItem', entityId: params.id, action: `inventory.stock.${body.type.toLowerCase()}`, newValue: { ...body, prev, newQty }, actorType: 'ADMIN', actorId: user.sub });
    return NextResponse.json({ success: true, data: { previousQuantity: prev, newQuantity: newQty } });
  } catch (e) { return handleApiError(e); }
}
