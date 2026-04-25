import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { logActivity } from '@/lib/activity-logger';
import { PERMISSIONS } from '@gearup/types';
import { z } from 'zod';

async function recalcEstimates(jobCardId: string) {
  const parts = await prisma.jobCardPart.findMany({ where: { jobCardId } });
  const estimatedPartsCost = parts.reduce((sum, p) => sum + Number(p.requiredQty) * Number(p.unitPrice), 0);
  const jc = await prisma.jobCard.findUniqueOrThrow({ where: { id: jobCardId }, select: { estimatedLaborCost: true } });
  const estimatedTotal = estimatedPartsCost + Number(jc.estimatedLaborCost);
  await prisma.jobCard.update({ where: { id: jobCardId }, data: { estimatedPartsCost, estimatedTotal } });
}

async function adjustStock(inventoryItemId: string, qty: number, type: 'RESERVED' | 'RELEASED', jobCardId: string) {
  const item = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: inventoryItemId } });
  const prev = Number(item.quantityInStock);
  const newQty = type === 'RESERVED' ? prev - qty : prev + qty;
  const prevReserved = Number(item.reservedQuantity);
  const newReserved = type === 'RESERVED' ? prevReserved + qty : Math.max(0, prevReserved - qty);
  await prisma.inventoryItem.update({ where: { id: inventoryItemId }, data: { quantityInStock: Math.max(0, newQty), reservedQuantity: newReserved } });
  await prisma.stockMovement.create({ data: { inventoryItemId, movementType: type === 'RESERVED' ? 'RESERVED' : 'RELEASED', quantity: qty, previousQuantity: prev, newQuantity: Math.max(0, newQty), relatedEntityType: 'JobCard', relatedEntityId: jobCardId } });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = requirePermission(PERMISSIONS.JOB_CARDS_CREATE);
    const body = z.object({
      inventoryItemId: z.string(), requiredQty: z.number().min(0.01), unitPrice: z.number().optional(), notes: z.string().optional(),
    }).parse(await req.json());

    const item = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: body.inventoryItemId } });
    const part = await prisma.jobCardPart.create({
      data: { jobCardId: params.id, inventoryItemId: body.inventoryItemId, requiredQty: body.requiredQty, unitPrice: body.unitPrice ?? Number(item.sellingPrice), notes: body.notes },
      include: { inventoryItem: true },
    });
    await adjustStock(body.inventoryItemId, body.requiredQty, 'RESERVED', params.id);
    await recalcEstimates(params.id);
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
    const part = await prisma.jobCardPart.update({ where: { id: partId, jobCardId: params.id }, data, include: { inventoryItem: true } });
    await recalcEstimates(params.id);
    logActivity({ entityType: 'JobCardPart', entityId: partId, action: 'job-card.part.updated', newValue: body, actorType: 'ADMIN', actorId: user.sub });
    return NextResponse.json({ success: true, data: part });
  } catch (e) { return handleApiError(e); }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = requirePermission(PERMISSIONS.JOB_CARDS_CREATE);
    const partId = req.nextUrl.searchParams.get('partId');
    if (!partId) return NextResponse.json({ success: false, error: { message: 'partId is required' } }, { status: 400 });
    const part = await prisma.jobCardPart.findUniqueOrThrow({ where: { id: partId, jobCardId: params.id } });
    await prisma.jobCardPart.delete({ where: { id: partId } });
    await adjustStock(part.inventoryItemId, Number(part.requiredQty), 'RELEASED', params.id);
    await recalcEstimates(params.id);
    logActivity({ entityType: 'JobCardPart', entityId: partId, action: 'job-card.part.removed', newValue: { jobCardId: params.id, partId }, actorType: 'ADMIN', actorId: user.sub });
    return NextResponse.json({ success: true });
  } catch (e) { return handleApiError(e); }
}
