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

async function adjustStock(tx: any, inventoryItemId: string, qty: number, type: 'RESERVED' | 'RELEASED' | 'CONSUMED', jobCardId: string) {
  if (qty <= 0) return;
  // RESERVED: stock -qty, reserved +qty
  // RELEASED: stock +qty, reserved -qty
  // CONSUMED: stock unchanged (already decremented at RESERVED time), reserved -qty (permanently committed)
  const stockDelta = type === 'RESERVED' ? -qty : type === 'RELEASED' ? qty : 0;
  const reservedDelta = type === 'RESERVED' ? qty : -qty;
  const guard =
    type === 'RESERVED'
      ? { quantityInStock: { gte: qty } }
      : { reservedQuantity: { gte: qty } };
  const updated = await tx.inventoryItem.updateMany({
    where: { id: inventoryItemId, ...guard },
    data: {
      quantityInStock: { increment: stockDelta },
      reservedQuantity: { increment: reservedDelta },
    },
  });
  if (updated.count === 0) {
    const msg =
      type === 'RESERVED'
        ? 'Insufficient stock to reserve this part.'
        : type === 'RELEASED'
          ? 'Reserved stock is lower than the quantity being released.'
          : 'Reserved stock is lower than the quantity being consumed.';
    throw new ValidationError(msg);
  }

  const item = await tx.inventoryItem.findUniqueOrThrow({ where: { id: inventoryItemId } });
  const newQty = Number(item.quantityInStock);
  await tx.stockMovement.create({ data: { inventoryItemId, movementType: type, quantity: qty, previousQuantity: newQty - stockDelta, newQuantity: newQty, relatedEntityType: 'JobCard', relatedEntityId: jobCardId } });
}

// Shared line-total math, matching invoices/[id]/line-items/route.ts
function computeLineMath(quantity: number, unitPrice: number, taxRate: number, discountPercent: number) {
  const subtotal = quantity * unitPrice * (1 - discountPercent / 100);
  const taxAmount = subtotal * (taxRate / 100);
  const lineTotal = subtotal + taxAmount;
  return { subtotal, taxAmount, lineTotal };
}

// Sync this part into a DRAFT invoice if one exists. MUST run inside the caller's transaction.
async function syncPartToInvoiceInTx(
  tx: any,
  jobCardId: string,
  inventoryItemId: string,
  quantity: number,
  unitPrice: number,
) {
  const invoice = await tx.invoice.findFirst({ where: { jobCardId, invoiceStatus: 'DRAFT' } });
  if (!invoice) return;
  const item = await tx.inventoryItem.findUniqueOrThrow({ where: { id: inventoryItemId } });
  const exists = await tx.invoiceLineItem.findFirst({ where: { invoiceId: invoice.id, referenceItemId: inventoryItemId } });
  if (exists) return;
  const taxRate = Number(item.taxRate);
  const discountPercent = Number(item.discountPercent) || 0;
  const { taxAmount, lineTotal } = computeLineMath(quantity, unitPrice, taxRate, discountPercent);
  const count = await tx.invoiceLineItem.count({ where: { invoiceId: invoice.id } });
  await tx.invoiceLineItem.create({
    data: {
      invoiceId: invoice.id,
      lineType: 'PART',
      description: item.itemName,
      quantity,
      unitPrice,
      discountPercent,
      taxRate,
      taxAmount,
      lineTotal,
      sortOrder: count,
      referenceItemId: item.id,
    },
  });
  // Recalc totals from tx-queried lines (same shape as invoices line-items recalcTotals)
  const lines = await tx.invoiceLineItem.findMany({ where: { invoiceId: invoice.id } });
  const invSubtotal = lines.reduce((s: number, l: { lineTotal: unknown; taxAmount: unknown }) => s + Number(l.lineTotal) - Number(l.taxAmount), 0);
  const invTaxTotal = lines.reduce((s: number, l: { taxAmount: unknown }) => s + Number(l.taxAmount), 0);
  const grandTotal = Math.round(invSubtotal + invTaxTotal - Number(invoice.discountAmount));
  await tx.invoice.update({
    where: { id: invoice.id },
    data: { subtotal: invSubtotal, taxTotal: invTaxTotal, grandTotal, amountDue: Math.round(grandTotal - Number(invoice.amountPaid)) },
  });
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
      const unitPrice = body.unitPrice ?? Number(item.sellingPrice) * (1 - (Number(item.discountPercent) || 0) / 100);
      const created = await tx.jobCardPart.create({
        data: { jobCardId: params.id, inventoryItemId: body.inventoryItemId, requiredQty: body.requiredQty, reservedQty: body.requiredQty, unitPrice, notes: body.notes },
        include: { inventoryItem: true },
      });
      await recalcEstimates(tx, params.id);
      // P0: invoice sync MUST live in the same transaction. Otherwise stock can be reserved
      // while the invoice line/totals write fails, producing permanent drift; and concurrent
      // POSTs race on grandTotal/amountDue (read-modify-write with no row lock).
      await syncPartToInvoiceInTx(tx, params.id, body.inventoryItemId, body.requiredQty, Number(created.unitPrice));
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
      requiredQty: z.number().min(0.01).optional(), consumedQty: z.number().min(0).optional(),
      unitPrice: z.number().optional(), notes: z.string().nullable().optional(),
    }).parse(await req.json());
    const { partId, ...data } = body;
    const part = await prisma.$transaction(async (tx) => {
      const existing = await tx.jobCardPart.findUniqueOrThrow({ where: { id: partId, jobCardId: params.id } });
      const nextData: Record<string, unknown> = { ...data };
      // requiredQty delta -> adjust the reservation pool first so the consumedQty
      // ceiling check below sees the new requiredQty.
      const newRequiredQty = typeof body.requiredQty === 'number' ? body.requiredQty : Number(existing.requiredQty);
      const newConsumedQty = typeof body.consumedQty === 'number' ? body.consumedQty : Number(existing.consumedQty);
      if (newConsumedQty > newRequiredQty) {
        throw new ValidationError('consumedQty cannot exceed requiredQty');
      }
      if (typeof body.requiredQty === 'number') {
        const delta = body.requiredQty - Number(existing.requiredQty);
        if (delta > 0) await adjustStock(tx, existing.inventoryItemId, delta, 'RESERVED', params.id);
        if (delta < 0) {
          // Don't release more than what's still in the reserved bucket
          // (reservedQty = requiredQty - consumedQty after prior consumes).
          const stillReserved = Math.max(0, Number(existing.reservedQty));
          const releaseQty = Math.min(Math.abs(delta), stillReserved);
          if (releaseQty > 0) await adjustStock(tx, existing.inventoryItemId, releaseQty, 'RELEASED', params.id);
        }
        // reservedQty mirrors the not-yet-consumed portion of requiredQty.
        nextData.reservedQty = Math.max(0, newRequiredQty - Number(existing.consumedQty));
      }
      // consumedQty delta -> permanent commit: decrement reservedQuantity, do NOT touch
      // quantityInStock (already decremented at RESERVED time), write CONSUMED movement.
      if (typeof body.consumedQty === 'number') {
        const consumedDelta = body.consumedQty - Number(existing.consumedQty);
        if (consumedDelta > 0) {
          await adjustStock(tx, existing.inventoryItemId, consumedDelta, 'CONSUMED', params.id);
          const baseReserved = typeof nextData.reservedQty === 'number'
            ? (nextData.reservedQty as number)
            : Number(existing.reservedQty);
          nextData.reservedQty = Math.max(0, baseReserved - consumedDelta);
        }
        // consumedDelta < 0 (un-consume) is not modeled — would require a reverse
        // stock movement and is outside scope. Reject to avoid silent drift.
        if (consumedDelta < 0) throw new ValidationError('consumedQty cannot be decreased');
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
      // Only release the still-reserved (uncommitted) portion. Anything already
      // CONSUMED has been permanently deducted from stock and must NOT be returned.
      const reserved = Number(part.reservedQty);
      const consumed = Number(part.consumedQty);
      const required = Number(part.requiredQty);
      // Prefer reservedQty if it has been maintained; fall back to required-consumed
      // for legacy rows where reservedQty was never decremented.
      const releaseQty = Math.max(0, reserved > 0 ? Math.min(reserved, required - consumed) : required - consumed);
      await tx.jobCardPart.delete({ where: { id: partId } });
      if (releaseQty > 0) await adjustStock(tx, part.inventoryItemId, releaseQty, 'RELEASED', params.id);
      await recalcEstimates(tx, params.id);
    });
    logActivity({ entityType: 'JobCardPart', entityId: partId, action: 'job-card.part.removed', newValue: { jobCardId: params.id, partId }, actorType: 'ADMIN', actorId: user.sub });
    return NextResponse.json({ success: true });
  } catch (e) { return handleApiError(e); }
}
