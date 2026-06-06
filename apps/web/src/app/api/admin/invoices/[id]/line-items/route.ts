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

async function recalcTotals(invoiceId: string, inv?: { discountAmount: unknown; amountPaid: unknown }) {
  const lines = await prisma.invoiceLineItem.findMany({ where: { invoiceId } });
  const subtotal = lines.reduce((s, l) => s + Number(l.lineTotal) - Number(l.taxAmount), 0);
  const taxTotal = lines.reduce((s, l) => s + Number(l.taxAmount), 0);
  const discountAmount = inv ? Number(inv.discountAmount) : Number((await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId }, select: { discountAmount: true, amountPaid: true } })).discountAmount);
  const amountPaid = inv ? Number(inv.amountPaid) : 0;
  const grandTotal = subtotal + taxTotal - discountAmount;
  await prisma.invoice.update({ where: { id: invoiceId }, data: { subtotal, taxTotal, grandTotal, amountDue: grandTotal - amountPaid } });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = requirePermission(PERMISSIONS.INVOICES_CREATE);
    const inv = await ensureDraft(params.id);
    const body = z.object({
      lineType: z.enum(['PART', 'LABOR', 'CUSTOM_CHARGE', 'DISCOUNT_ADJUSTMENT', 'AMC']),
      description: z.string().min(1), quantity: z.number().default(1), unitPrice: z.number().default(0), taxRate: z.number().default(0), discountPercent: z.number().min(0).max(100).default(0),
      discountMode: z.enum(['flat', 'percent']).optional(),
      amcPlanId: z.string().optional(),
      amcContractId: z.string().optional(),
    }).parse(await req.json());

    const isDiscount = body.lineType === 'DISCOUNT_ADJUSTMENT';
    const isAmc = body.lineType === 'AMC';
    const jobCardId = inv.jobCardId || undefined;
    let lineTotal: number;
    let taxAmount: number;
    let referenceItemId: string | undefined;

    // Calculate line total
    if (isAmc) {
      taxAmount = 0;
      if (body.amcContractId) {
        lineTotal = 0;
        const contract = await prisma.amcContract.findUniqueOrThrow({ where: { id: body.amcContractId } });
        if (contract.status !== 'ACTIVE') throw new ValidationError('AMC contract is not active');
        if (contract.servicesRemaining <= 0) throw new ValidationError('No services remaining on AMC contract');
        if (!jobCardId) throw new ValidationError('AMC service usage requires a job card');
        await Promise.all([
          prisma.amcServiceUsage.create({ data: { amcContractId: contract.id, jobCardId, serviceNumber: contract.servicesUsed + 1, serviceDate: new Date() } }),
          prisma.amcContract.update({ where: { id: contract.id }, data: { servicesUsed: { increment: 1 }, servicesRemaining: { decrement: 1 } } }),
        ]);
      } else if (body.amcPlanId) {
        const plan = await prisma.amcPlan.findUniqueOrThrow({ where: { id: body.amcPlanId } });
        lineTotal = Number(plan.price);
        referenceItemId = body.amcPlanId;
      } else {
        lineTotal = 0;
      }
    } else if (isDiscount) {
      taxAmount = 0;
      lineTotal = body.discountMode === 'percent'
        ? -(Number(inv.subtotal) * (body.unitPrice / 100))
        : -(Math.abs(body.quantity * body.unitPrice));
    } else {
      const subtotal = body.quantity * body.unitPrice * (1 - body.discountPercent / 100);
      taxAmount = subtotal * (body.taxRate / 100);
      lineTotal = subtotal + taxAmount;
    }

    // Stock deduction for PART (parallel: update stock + create movement)
    if (body.lineType === 'PART') {
      const invItem = await prisma.inventoryItem.findFirst({ where: { itemName: body.description } });
      if (invItem) {
        referenceItemId = invItem.id;
        const prevQty = Number(invItem.quantityInStock);
        const newQty = prevQty - body.quantity;
        await Promise.all([
          prisma.inventoryItem.update({ where: { id: invItem.id }, data: { quantityInStock: { decrement: body.quantity } } }),
          prisma.stockMovement.create({ data: { inventoryItemId: invItem.id, movementType: 'STOCK_OUT', quantity: body.quantity, previousQuantity: prevQty, newQuantity: newQty, reason: 'Invoice line item', relatedEntityType: 'Invoice', relatedEntityId: params.id } }),
        ]);
      }
    }

    // Create line item
    const item = await prisma.invoiceLineItem.create({ data: { invoiceId: params.id, lineType: body.lineType, description: body.description, quantity: body.quantity, unitPrice: body.unitPrice, discountPercent: body.discountPercent, taxRate: body.taxRate, taxAmount, lineTotal, sortOrder: 0, referenceItemId } });

    // Sync to job card (all types except DISCOUNT_ADJUSTMENT) — fire in parallel with recalc
    const syncJobCard = async () => {
      if (!jobCardId || isDiscount) return;
      if (body.lineType === 'PART' && referenceItemId) {
        const exists = await prisma.jobCardPart.findFirst({ where: { jobCardId, inventoryItemId: referenceItemId } });
        if (!exists) {
          await prisma.jobCardPart.create({ data: { jobCardId, inventoryItemId: referenceItemId, requiredQty: body.quantity, reservedQty: body.quantity, unitPrice: body.unitPrice } });
        }
      } else if (body.lineType !== 'PART') {
        await prisma.jobCardTask.create({ data: { jobCardId, taskName: body.description, status: 'COMPLETED' } });
      }
    };

    // Run recalc and job card sync in parallel
    await Promise.all([recalcTotals(params.id, inv), syncJobCard()]);

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
