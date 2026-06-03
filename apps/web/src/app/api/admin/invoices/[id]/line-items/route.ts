import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { handleApiError, ValidationError } from '@/lib/errors';
import { logActivity } from '@/lib/activity-logger';
import { PERMISSIONS } from '@gearup/types';
import { z } from 'zod';

async function ensureDraft(invoiceId: string) {
  const inv = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
  if (inv.invoiceStatus !== 'DRAFT') throw new ValidationError('Line items can only be modified on DRAFT invoices');
  return inv;
}

async function recalcTotals(invoiceId: string) {
  const lines = await prisma.invoiceLineItem.findMany({ where: { invoiceId } });
  const subtotal = lines.reduce((s, l) => s + Number(l.lineTotal) - Number(l.taxAmount), 0);
  const taxTotal = lines.reduce((s, l) => s + Number(l.taxAmount), 0);
  const inv = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
  const grandTotal = subtotal + taxTotal - Number(inv.discountAmount);
  await prisma.invoice.update({ where: { id: invoiceId }, data: { subtotal, taxTotal, grandTotal, amountDue: grandTotal - Number(inv.amountPaid) } });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = requirePermission(PERMISSIONS.INVOICES_CREATE);
    await ensureDraft(params.id);
    const body = z.object({
      lineType: z.enum(['PART', 'LABOR', 'CUSTOM_CHARGE', 'DISCOUNT_ADJUSTMENT', 'AMC']),
      description: z.string().min(1), quantity: z.number().default(1), unitPrice: z.number().default(0), taxRate: z.number().default(0), discountPercent: z.number().min(0).max(100).default(0),
      discountMode: z.enum(['flat', 'percent']).optional(),
      amcPlanId: z.string().optional(),
      amcContractId: z.string().optional(),
    }).parse(await req.json());
    const isDiscount = body.lineType === 'DISCOUNT_ADJUSTMENT';
    const isAmc = body.lineType === 'AMC';
    let lineTotal: number;
    let taxAmount: number;
    if (isAmc) {
      taxAmount = 0;

      if (body.amcContractId) {
        // Existing contract — ₹0 service usage (contract already paid for)
        lineTotal = 0;
        const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: params.id }, select: { vehicleId: true, customerId: true, jobCardId: true } });
        const contract = await prisma.amcContract.findUniqueOrThrow({ where: { id: body.amcContractId } });
        if (contract.status !== 'ACTIVE') throw new ValidationError('AMC contract is not active');
        if (contract.servicesRemaining <= 0) throw new ValidationError('No services remaining on AMC contract');
        await prisma.amcServiceUsage.create({ data: { amcContractId: contract.id, jobCardId: invoice.jobCardId, serviceNumber: contract.servicesUsed + 1, serviceDate: new Date() } });
        await prisma.amcContract.update({ where: { id: contract.id }, data: { servicesUsed: { increment: 1 }, servicesRemaining: { decrement: 1 } } });
      } else if (body.amcPlanId) {
        // New AMC — charge plan price, contract created on payment
        const plan = await prisma.amcPlan.findUniqueOrThrow({ where: { id: body.amcPlanId } });
        lineTotal = Number(plan.price);
      } else {
        lineTotal = 0;
      }
    } else if (isDiscount) {
      taxAmount = 0;
      if (body.discountMode === 'percent') {
        const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: params.id }, select: { subtotal: true } });
        lineTotal = -(Number(invoice.subtotal) * (body.unitPrice / 100));
      } else {
        lineTotal = -(Math.abs(body.quantity * body.unitPrice));
      }
    } else {
      const subtotal = body.quantity * body.unitPrice * (1 - body.discountPercent / 100);
      taxAmount = subtotal * (body.taxRate / 100);
      lineTotal = subtotal + taxAmount;
    }
    const count = await prisma.invoiceLineItem.count({ where: { invoiceId: params.id } });
    let referenceItemId: string | undefined;

    // If AMC with new plan, store planId as reference for contract creation on payment
    if (body.lineType === 'AMC' && body.amcPlanId && !body.amcContractId) {
      referenceItemId = body.amcPlanId;
    }

    // If PART, find inventory item and deduct stock
    if (body.lineType === 'PART') {
      const invItem = await prisma.inventoryItem.findFirst({ where: { itemName: body.description } });
      if (invItem) {
        referenceItemId = invItem.id;
        await prisma.inventoryItem.update({ where: { id: invItem.id }, data: { quantityInStock: { decrement: body.quantity } } });
        const updated = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: invItem.id } });
        await prisma.stockMovement.create({ data: { inventoryItemId: invItem.id, movementType: 'STOCK_OUT', quantity: body.quantity, previousQuantity: Number(updated.quantityInStock) + body.quantity, newQuantity: Number(updated.quantityInStock), reason: `Invoice line item`, relatedEntityType: 'Invoice', relatedEntityId: params.id } });
      }
    }

    const item = await prisma.invoiceLineItem.create({ data: { invoiceId: params.id, lineType: body.lineType, description: body.description, quantity: body.quantity, unitPrice: body.unitPrice, discountPercent: body.discountPercent, taxRate: body.taxRate, taxAmount, lineTotal, sortOrder: count, referenceItemId } });

    // Sync to job card (all types except DISCOUNT_ADJUSTMENT)
    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: params.id }, select: { jobCardId: true } });
    if (invoice.jobCardId && body.lineType !== 'DISCOUNT_ADJUSTMENT') {
      if (body.lineType === 'PART' && referenceItemId) {
        const exists = await prisma.jobCardPart.findFirst({ where: { jobCardId: invoice.jobCardId, inventoryItemId: referenceItemId } });
        if (!exists) {
          await prisma.jobCardPart.create({ data: { jobCardId: invoice.jobCardId, inventoryItemId: referenceItemId, requiredQty: body.quantity, reservedQty: body.quantity, unitPrice: body.unitPrice } });
          // Recalc job card parts total
          const parts = await prisma.jobCardPart.findMany({ where: { jobCardId: invoice.jobCardId } });
          const estimatedPartsCost = parts.reduce((sum: number, p: any) => sum + Number(p.requiredQty) * Number(p.unitPrice), 0);
          const jc = await prisma.jobCard.findUniqueOrThrow({ where: { id: invoice.jobCardId }, select: { estimatedLaborCost: true, estimatedOtherCost: true } });
          await prisma.jobCard.update({ where: { id: invoice.jobCardId }, data: { estimatedPartsCost, estimatedTotal: estimatedPartsCost + Number(jc.estimatedLaborCost) + Number(jc.estimatedOtherCost) } });
        }
      } else if (body.lineType !== 'PART') {
        const exists = await prisma.jobCardTask.findFirst({ where: { jobCardId: invoice.jobCardId, taskName: body.description } });
        if (!exists) {
          await prisma.jobCardTask.create({ data: { jobCardId: invoice.jobCardId, taskName: body.description, status: 'COMPLETED' } });
          const jc = await prisma.jobCard.findUniqueOrThrow({ where: { id: invoice.jobCardId }, select: { estimatedLaborCost: true, estimatedOtherCost: true, estimatedPartsCost: true } });
          const amount = body.unitPrice * body.quantity;
          if (body.lineType === 'LABOR') {
            const newLaborCost = Number(jc.estimatedLaborCost) + amount;
            await prisma.jobCard.update({ where: { id: invoice.jobCardId }, data: { estimatedLaborCost: newLaborCost, estimatedTotal: Number(jc.estimatedPartsCost) + newLaborCost + Number(jc.estimatedOtherCost) } });
          } else {
            const newOtherCost = Number(jc.estimatedOtherCost) + amount;
            await prisma.jobCard.update({ where: { id: invoice.jobCardId }, data: { estimatedOtherCost: newOtherCost, estimatedTotal: Number(jc.estimatedPartsCost) + Number(jc.estimatedLaborCost) + newOtherCost } });
          }
        }
      }
    }

    await recalcTotals(params.id);
    logActivity({ entityType: 'InvoiceLineItem', entityId: item.id, action: 'invoice.line.added', newValue: body, actorType: 'ADMIN', actorId: user.sub });
    return NextResponse.json({ success: true, data: item }, { status: 201 });
  } catch (e) { return handleApiError(e); }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = requirePermission(PERMISSIONS.INVOICES_CREATE);
    await ensureDraft(params.id);
    const body = z.object({
      lineItemId: z.string(), description: z.string().optional(), quantity: z.number().optional(), unitPrice: z.number().optional(), taxRate: z.number().optional(), discountPercent: z.number().min(0).max(100).optional(),
    }).parse(await req.json());
    const { lineItemId, ...data } = body;
    const existing = await prisma.invoiceLineItem.findUniqueOrThrow({ where: { id: lineItemId, invoiceId: params.id } });
    const qty = data.quantity ?? Number(existing.quantity);
    const price = data.unitPrice ?? Number(existing.unitPrice);
    const discount = data.discountPercent ?? Number(existing.discountPercent);
    const rate = data.taxRate ?? Number(existing.taxRate);
    const subtotal = qty * price * (1 - discount / 100);
    const taxAmount = subtotal * (rate / 100);
    const lineTotal = subtotal + taxAmount;
    const item = await prisma.invoiceLineItem.update({ where: { id: lineItemId }, data: { ...data, taxAmount, lineTotal } });
    await recalcTotals(params.id);
    logActivity({ entityType: 'InvoiceLineItem', entityId: lineItemId, action: 'invoice.line.updated', newValue: body, actorType: 'ADMIN', actorId: user.sub });
    return NextResponse.json({ success: true, data: item });
  } catch (e) { return handleApiError(e); }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = requirePermission(PERMISSIONS.INVOICES_CREATE);
    await ensureDraft(params.id);
    const lineItemId = req.nextUrl.searchParams.get('lineItemId');
    if (!lineItemId) return NextResponse.json({ success: false, error: { message: 'lineItemId required' } }, { status: 400 });
    const lineItem = await prisma.invoiceLineItem.findUniqueOrThrow({ where: { id: lineItemId, invoiceId: params.id } });

    // If PART with referenceItemId, restore stock
    if (lineItem.lineType === 'PART' && lineItem.referenceItemId) {
      const qty = Number(lineItem.quantity);
      await prisma.inventoryItem.update({ where: { id: lineItem.referenceItemId }, data: { quantityInStock: { increment: qty } } });
      const updated = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: lineItem.referenceItemId } });
      await prisma.stockMovement.create({ data: { inventoryItemId: lineItem.referenceItemId, movementType: 'STOCK_IN', quantity: qty, previousQuantity: Number(updated.quantityInStock) - qty, newQuantity: Number(updated.quantityInStock), reason: 'Invoice line item removed', relatedEntityType: 'Invoice', relatedEntityId: params.id } });
    }

    await prisma.invoiceLineItem.delete({ where: { id: lineItemId } });
    await recalcTotals(params.id);
    logActivity({ entityType: 'InvoiceLineItem', entityId: lineItemId, action: 'invoice.line.removed', actorType: 'ADMIN', actorId: user.sub });
    return NextResponse.json({ success: true });
  } catch (e) { return handleApiError(e); }
}
