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
      lineType: z.enum(['PART', 'LABOR', 'CUSTOM_CHARGE', 'DISCOUNT_ADJUSTMENT']),
      description: z.string().min(1), quantity: z.number().default(1), unitPrice: z.number().default(0), taxRate: z.number().default(0),
    }).parse(await req.json());
    const taxAmount = body.quantity * body.unitPrice * (body.taxRate / 100);
    const lineTotal = body.quantity * body.unitPrice + taxAmount;
    const count = await prisma.invoiceLineItem.count({ where: { invoiceId: params.id } });
    const item = await prisma.invoiceLineItem.create({ data: { invoiceId: params.id, ...body, taxAmount, lineTotal, sortOrder: count } });
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
      lineItemId: z.string(), description: z.string().optional(), quantity: z.number().optional(), unitPrice: z.number().optional(), taxRate: z.number().optional(),
    }).parse(await req.json());
    const { lineItemId, ...data } = body;
    const existing = await prisma.invoiceLineItem.findUniqueOrThrow({ where: { id: lineItemId, invoiceId: params.id } });
    const qty = data.quantity ?? Number(existing.quantity);
    const price = data.unitPrice ?? Number(existing.unitPrice);
    const rate = data.taxRate ?? Number(existing.taxRate);
    const taxAmount = qty * price * (rate / 100);
    const lineTotal = qty * price + taxAmount;
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
    await prisma.invoiceLineItem.delete({ where: { id: lineItemId, invoiceId: params.id } });
    await recalcTotals(params.id);
    logActivity({ entityType: 'InvoiceLineItem', entityId: lineItemId, action: 'invoice.line.removed', actorType: 'ADMIN', actorId: user.sub });
    return NextResponse.json({ success: true });
  } catch (e) { return handleApiError(e); }
}
