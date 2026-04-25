import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { handleApiError, ValidationError } from '@/lib/errors';
import { logActivity } from '@/lib/activity-logger';
import { PERMISSIONS } from '@gearup/types';
import { z } from 'zod';

async function recalcEstimates(tx: any, jobCardId: string) {
  const parts = await tx.jobCardPart.findMany({ where: { jobCardId } });
  const estimatedPartsCost = parts.reduce(
    (sum: number, p: { requiredQty: unknown; unitPrice: unknown }) => sum + Number(p.requiredQty) * Number(p.unitPrice),
    0,
  );
  const jc = await tx.jobCard.findUniqueOrThrow({ where: { id: jobCardId }, select: { estimatedLaborCost: true } });
  const estimatedTotal = estimatedPartsCost + Number(jc.estimatedLaborCost);
  await tx.jobCard.update({ where: { id: jobCardId }, data: { estimatedPartsCost, estimatedTotal } });
}

async function adjustStock(tx: any, inventoryItemId: string, qty: number, type: 'RESERVED' | 'RELEASED', jobCardId: string) {
  if (qty <= 0) return;
  const stockDelta = type === 'RESERVED' ? -qty : qty;
  const reservedDelta = type === 'RESERVED' ? qty : -qty;
  const updated = await tx.inventoryItem.updateMany({
    where: {
      id: inventoryItemId,
      ...(type === 'RESERVED' ? { quantityInStock: { gte: qty } } : { reservedQuantity: { gte: qty } }),
    },
    data: {
      quantityInStock: { increment: stockDelta },
      reservedQuantity: { increment: reservedDelta },
    },
  });
  if (updated.count === 0) {
    throw new ValidationError(type === 'RESERVED' ? 'Insufficient stock to reserve this part.' : 'Reserved stock is lower than the quantity being released.');
  }

  const item = await tx.inventoryItem.findUniqueOrThrow({ where: { id: inventoryItemId } });
  const newQty = Number(item.quantityInStock);
  await tx.stockMovement.create({ data: { inventoryItemId, movementType: type, quantity: qty, previousQuantity: newQty - stockDelta, newQuantity: newQty, relatedEntityType: 'JobCard', relatedEntityId: jobCardId } });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = requirePermission(PERMISSIONS.JOB_CARDS_CREATE);
    const body = z.object({
      inventoryItemId: z.string(), requiredQty: z.number().min(0.01), unitPrice: z.number().optional(), notes: z.string().optional(),
    }).parse(await req.json());

    const part = await prisma.$transaction(async (tx) => {
      const item = await tx.inventoryItem.findUniqueOrThrow({ where: { id: body.inventoryItemId } });
      await adjustStock(tx, body.inventoryItemId, body.requiredQty, 'RESERVED', params.id);
      const created = await tx.jobCardPart.create({
        data: { jobCardId: params.id, inventoryItemId: body.inventoryItemId, requiredQty: body.requiredQty, reservedQty: body.requiredQty, unitPrice: body.unitPrice ?? Number(item.sellingPrice), notes: body.notes },
        include: { inventoryItem: true },
      });
      await recalcEstimates(tx, params.id);
      return created;
    });
    logActivity({ entityType: 'JobCardPart', entityId: part.id, action: 'job-card.part.added', newValue: { jobCardId: params.id, ...body }, actorType: 'ADMIN', actorId: user.sub });
    return NextResponse.json({ success: true, data: part }, { status: 201 });
  } catch (e) { return handleApiError(e); }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = requirePermission(PERMISSIONS.JOB_CARDS_CREATE);
    const body = z.object({
      partId: z.string(),
      requiredQty: z.number().min(0.01).optional(), consumedQty: z.number().optional(),
      unitPrice: z.number().optional(), notes: z.string().nullable().optional(),
    }).parse(await req.json());
    const { partId, ...data } = body;
    const part = await prisma.$transaction(async (tx) => {
      const existing = await tx.jobCardPart.findUniqueOrThrow({ where: { id: partId, jobCardId: params.id } });
      const nextData: Record<string, unknown> = { ...data };
      if (typeof body.requiredQty === 'number') {
        const delta = body.requiredQty - Number(existing.requiredQty);
        if (delta > 0) await adjustStock(tx, existing.inventoryItemId, delta, 'RESERVED', params.id);
        if (delta < 0) await adjustStock(tx, existing.inventoryItemId, Math.abs(delta), 'RELEASED', params.id);
        nextData.reservedQty = body.requiredQty;
      }
      const updated = await tx.jobCardPart.update({ where: { id: partId, jobCardId: params.id }, data: nextData, include: { inventoryItem: true } });
      await recalcEstimates(tx, params.id);
      return updated;
    });
    logActivity({ entityType: 'JobCardPart', entityId: partId, action: 'job-card.part.updated', newValue: body, actorType: 'ADMIN', actorId: user.sub });
    return NextResponse.json({ success: true, data: part });
  } catch (e) { return handleApiError(e); }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = requirePermission(PERMISSIONS.JOB_CARDS_CREATE);
    const partId = req.nextUrl.searchParams.get('partId');
    if (!partId) return NextResponse.json({ success: false, error: { message: 'partId is required' } }, { status: 400 });
    await prisma.$transaction(async (tx) => {
      const part = await tx.jobCardPart.findUniqueOrThrow({ where: { id: partId, jobCardId: params.id } });
      const releaseQty = Number(part.reservedQty) > 0 ? Number(part.reservedQty) : Number(part.requiredQty);
      await tx.jobCardPart.delete({ where: { id: partId } });
      await adjustStock(tx, part.inventoryItemId, releaseQty, 'RELEASED', params.id);
      await recalcEstimates(tx, params.id);
    });
    logActivity({ entityType: 'JobCardPart', entityId: partId, action: 'job-card.part.removed', newValue: { jobCardId: params.id, partId }, actorType: 'ADMIN', actorId: user.sub });
    return NextResponse.json({ success: true });
  } catch (e) { return handleApiError(e); }
}
