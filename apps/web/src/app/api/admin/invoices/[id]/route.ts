import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { AppError, handleApiError } from '@/lib/errors';
import { logActivity } from '@/lib/activity-logger';
import { PERMISSIONS } from '@gearup/types';
import { z } from 'zod';
import { getGstRate } from '@/lib/hsn-rate';

const updateSchema = z.object({
  notes: z.string().optional(),
  dueDate: z.string().optional(),
  discountType: z.string().optional(),
  discountValue: z.number().optional(),
  showGst: z.boolean().optional(),
}).strict();

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    requirePermission(PERMISSIONS.INVOICES_VIEW);
    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: params.id }, include: { lineItems: { orderBy: { sortOrder: 'asc' } }, payments: { orderBy: { paymentDate: 'desc' } }, customer: true, vehicle: true, jobCard: { select: { id: true, jobCardNumber: true } } } });
    // Attach SKU to line items that reference inventory items
    const refIds = invoice.lineItems.filter(li => li.referenceItemId).map(li => li.referenceItemId!);
    const items = refIds.length ? await prisma.inventoryItem.findMany({ where: { id: { in: refIds } }, select: { id: true, sku: true } }) : [];
    const skuMap = Object.fromEntries(items.map(i => [i.id, i.sku]));
    const lineItemsWithSku = invoice.lineItems.map(li => ({ ...li, sku: li.referenceItemId ? skuMap[li.referenceItemId] || null : null }));
    return NextResponse.json({ success: true, data: { ...invoice, lineItems: lineItemsWithSku } });
  } catch (e) { return handleApiError(e); }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = requirePermission(PERMISSIONS.INVOICES_CREATE);
    const body = updateSchema.parse(await req.json());
    const data: Record<string, unknown> = { ...body };
    if (body.dueDate) data.dueDate = new Date(body.dueDate);
    const touchesDiscount = body.discountType !== undefined || body.discountValue !== undefined;
    if (touchesDiscount) {
      const existing = await prisma.invoice.findUniqueOrThrow({ where: { id: params.id }, select: { invoiceStatus: true } });
      if (existing.invoiceStatus !== 'DRAFT') {
        throw new AppError(409, 'Discount can only be modified on DRAFT invoices', 'INVOICE_NOT_DRAFT');
      }
    }

    // When showGst is toggled, back-calculate tax from existing prices (total stays the same).
    // GST is treated as inclusive: lineTotal remains unchanged, unitPrice is reduced so that
    // unitPrice + tax = original unitPrice. When GST is turned OFF, unitPrice is restored.
    if (body.showGst !== undefined) {
      const existing = await prisma.invoice.findUniqueOrThrow({
        where: { id: params.id },
        select: { showGst: true, invoiceStatus: true, discountAmount: true, amountPaid: true },
      });
      if (existing.showGst !== body.showGst) {
        if (existing.invoiceStatus !== 'DRAFT') {
          throw new AppError(409, 'GST can only be toggled on DRAFT invoices', 'INVOICE_NOT_DRAFT');
        }
        const lineItems = await prisma.invoiceLineItem.findMany({ where: { invoiceId: params.id } });
        let subtotal = 0;
        let taxTotal = 0;
        let discountFromLines = 0;

        for (const li of lineItems) {
          if (li.lineType === 'DISCOUNT_ADJUSTMENT') {
            discountFromLines += Number(li.lineTotal);
            continue;
          }

          const currentUnitPrice = Number(li.unitPrice);
          const qty = Number(li.quantity);
          const discPct = Number(li.discountPercent);
          let taxRate = 0;

          if (body.showGst) {
            // Turning GST ON (inclusive): back-calculate tax from existing price
            // lineTotal stays the same; extract tax component from within the price
            taxRate = await getGstRate(li.hsnCode);
            const grossPerUnit = currentUnitPrice * (1 - discPct / 100);
            const basePerUnit = grossPerUnit / (1 + taxRate / 100);
            const newUnitPrice = basePerUnit / (1 - discPct / 100);
            const net = qty * newUnitPrice * (1 - discPct / 100);
            const taxAmount = qty * grossPerUnit - net; // tax = gross - base
            const lineTotal = qty * grossPerUnit; // unchanged from before

            await prisma.invoiceLineItem.update({
              where: { id: li.id },
              data: { unitPrice: Math.round(newUnitPrice * 100) / 100, taxRate, taxAmount: Math.round(taxAmount * 100) / 100, lineTotal: Math.round(lineTotal * 100) / 100 },
            });
            subtotal += Math.round(net * 100) / 100;
            taxTotal += Math.round(taxAmount * 100) / 100;
          } else {
            // Turning GST OFF: restore unitPrice by absorbing tax back into the price
            // lineTotal stays the same (base + tax → single price with no tax breakdown)
            const prevTaxRate = Number(li.taxRate);
            const restoredUnitPrice = currentUnitPrice * (1 + prevTaxRate / 100);
            const lineTotal = qty * restoredUnitPrice * (1 - discPct / 100);

            await prisma.invoiceLineItem.update({
              where: { id: li.id },
              data: { unitPrice: Math.round(restoredUnitPrice * 100) / 100, taxRate: 0, taxAmount: 0, lineTotal: Math.round(lineTotal * 100) / 100 },
            });
            subtotal += Math.round(lineTotal * 100) / 100;
          }
        }

        const grandTotal = Math.round(subtotal + taxTotal + discountFromLines - Number(existing.discountAmount));
        data.subtotal = subtotal;
        data.taxTotal = taxTotal;
        data.grandTotal = grandTotal;
        data.amountDue = grandTotal - Number(existing.amountPaid);
      }
    }

    const invoice = await prisma.invoice.update({ where: { id: params.id }, data });
    logActivity({ entityType: 'Invoice', entityId: invoice.id, action: 'invoice.updated', newValue: body, actorType: 'ADMIN', actorId: user.sub });
    return NextResponse.json({ success: true, data: invoice });
  } catch (e) { return handleApiError(e); }
}
