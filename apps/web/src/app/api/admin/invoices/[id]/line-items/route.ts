import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { handleApiError, ValidationError } from '@/lib/errors';
import { logActivity } from '@/lib/activity-logger';
import { PERMISSIONS } from '@gearup/types';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { recomputeDiscountLineTotal } from '@/lib/invoice-calc';
import { resolveHsnAndRate } from '@/lib/hsn-rate';

type Tx = Prisma.TransactionClient;

async function ensureDraftTx(tx: Tx, invoiceId: string) {
  const inv = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
  if (inv.invoiceStatus !== 'DRAFT') throw new ValidationError('Line items can only be modified on DRAFT invoices');
  return inv;
}

async function recalcTotalsTx(tx: Tx, invoiceId: string, inv?: { discountAmount: unknown; amountPaid: unknown }) {
  const lines = await tx.invoiceLineItem.findMany({ where: { invoiceId } });
  // Split discount lines from regular lines so we don't double-count discounts:
  // subtotal = sum of non-discount line subtotals (lineTotal - taxAmount)
  // discountFromLines = sum of negative discount line totals (already negative)
  // grandTotal = subtotal + taxTotal + discountFromLines - headerDiscountAmount
  const nonDiscountLines = lines.filter((l) => l.lineType !== 'DISCOUNT_ADJUSTMENT');
  const discountLines = lines.filter((l) => l.lineType === 'DISCOUNT_ADJUSTMENT');
  const subtotal = nonDiscountLines.reduce((s, l) => s + Number(l.lineTotal) - Number(l.taxAmount), 0);
  const taxTotal = nonDiscountLines.reduce((s, l) => s + Number(l.taxAmount), 0);
  // Re-derive percent discount lines (discountPercent > 0) against the CURRENT pre-discount
  // base so a "10% off" line scales when parts are added/removed afterwards. Flat discount
  // lines (discountPercent === 0) keep their stored total. The re-derived total is persisted
  // so the line table reflects it.
  const percentBase = nonDiscountLines.reduce((s, l) => s + Number(l.quantity) * Number(l.unitPrice), 0);
  let discountFromLines = 0;
  for (const l of discountLines) {
    const recomputed = recomputeDiscountLineTotal(
      { lineType: l.lineType, discountPercent: Number(l.discountPercent), lineTotal: Number(l.lineTotal) },
      percentBase,
    );
    if (Math.abs(recomputed - Number(l.lineTotal)) > 0.005) {
      await tx.invoiceLineItem.update({ where: { id: l.id }, data: { lineTotal: recomputed } });
    }
    discountFromLines += recomputed;
  }
  let headerDiscountAmount: number;
  let amountPaid: number;
  if (inv) {
    headerDiscountAmount = Number(inv.discountAmount);
    amountPaid = Number(inv.amountPaid);
  } else {
    const cur = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId }, select: { discountAmount: true, amountPaid: true } });
    headerDiscountAmount = Number(cur.discountAmount);
    amountPaid = Number(cur.amountPaid);
  }
  const grandTotal = Math.round(subtotal + taxTotal + discountFromLines - headerDiscountAmount);
  await tx.invoice.update({ where: { id: invoiceId }, data: { subtotal, taxTotal, grandTotal, amountDue: grandTotal - amountPaid } });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = requirePermission(PERMISSIONS.INVOICES_CREATE);
    const body = z.object({
      lineType: z.enum(['PART', 'LABOR', 'SERVICE_CHARGE', 'CUSTOM_CHARGE', 'DISCOUNT_ADJUSTMENT', 'AMC']),
      description: z.string().min(1),
      quantity: z.number().default(1),
      unitPrice: z.number().default(0),
      taxRate: z.number().default(0),
      hsnCode: z.string().optional(),
      discountPercent: z.number().min(0).max(100).default(0),
      discountMode: z.preprocess(v => v === '' ? undefined : v, z.enum(['flat', 'percent']).optional()),
      amcPlanId: z.string().optional(),
      amcContractId: z.string().optional(),
      inventoryItemId: z.string().optional(),
    }).parse(await req.json());

    // Resolve HSN + rate OUTSIDE the transaction. This function opens a separate
    // Prisma connection to load HsnRate + InventoryItem — on Vercel serverless +
    // Supabase pooler that can take 5-10s under load, which was the cause of the
    // P2028 "Transaction already closed" 500s we saw on 2026-07-01. `showGst` is
    // fetched via a lightweight lookup here; the transaction below re-verifies the
    // DRAFT status via `ensureDraftTx` so the read isn't a TOCTOU risk.
    const preInv = await prisma.invoice.findUniqueOrThrow({
      where: { id: params.id },
      select: { showGst: true },
    });
    const { hsnCode: finalHsn, taxRate: finalRate } = await resolveHsnAndRate(
      body.lineType, !!preInv.showGst, body.inventoryItemId, body.hsnCode,
    );
    const effectiveTaxRate = body.taxRate > 0 ? body.taxRate : finalRate;
    body.taxRate = effectiveTaxRate;

    const item = await prisma.$transaction(async (tx) => {
      const inv = await ensureDraftTx(tx, params.id);
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
          // AMC service usage against existing contract.
          // NOTE: We do NOT decrement servicesRemaining or create AmcServiceUsage here —
          // that is deferred to invoice finalize so a DRAFT line that gets removed
          // or never finalized doesn't permanently consume a prepaid service.
          // We just validate availability and tag the line item with the contract id
          // (stored in referenceItemId) so finalize can find it.
          const contract = await tx.amcContract.findUniqueOrThrow({ where: { id: body.amcContractId } });
          if (contract.status !== 'ACTIVE') throw new ValidationError('AMC contract is not active');
          if (contract.servicesRemaining <= 0) throw new ValidationError('No services remaining on AMC contract');
          if (!jobCardId) throw new ValidationError('AMC service usage requires a job card');
          lineTotal = 0;
          referenceItemId = contract.id;
        } else if (body.amcPlanId) {
          // AMC plan purchases create an AmcContract on payment; AmcContract.vehicleId is required.
          if (!inv.vehicleId) throw new ValidationError('AMC plan purchase requires a vehicle on the invoice');
          const plan = await tx.amcPlan.findUniqueOrThrow({ where: { id: body.amcPlanId } });
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
        // Auto-detect AMC for PART lines: if vehicle has an active contract OR invoice has AMC line, boost discount
        let effectiveDiscount = body.discountPercent;
        if (body.lineType === 'PART' && inv.vehicleId) {
          const activeContract = await tx.amcContract.findFirst({
            where: { vehicleId: inv.vehicleId, status: 'ACTIVE' },
          });
          if (activeContract) {
            effectiveDiscount = body.discountPercent + Number(activeContract.extraDiscountPercent);
          } else {
            // Check if this invoice already has an AMC plan-purchase line
            const amcLine = await tx.invoiceLineItem.findFirst({
              where: { invoiceId: params.id, lineType: 'AMC', referenceItemId: { not: null } },
            });
            if (amcLine) {
              const plan = await tx.amcPlan.findUnique({ where: { id: amcLine.referenceItemId! } });
              if (plan) effectiveDiscount = body.discountPercent + Number(plan.extraDiscountPercent);
            }
          }
          if (effectiveDiscount > 100) effectiveDiscount = 100;
        }
        const subtotal = body.quantity * body.unitPrice * (1 - effectiveDiscount / 100);
        taxAmount = subtotal * (body.taxRate / 100);
        lineTotal = subtotal + taxAmount;
        // Store the effective discount (including AMC extra) so it persists on the line
        body.discountPercent = effectiveDiscount;
      }

      // Stock deduction for PART — skip if already reserved via job card.
      // Match by explicit inventoryItemId (NOT by free-text itemName).
      if (body.lineType === 'PART' && body.inventoryItemId) {
        const invItem = await tx.inventoryItem.findUnique({ where: { id: body.inventoryItemId } });
        if (!invItem) throw new ValidationError('Inventory item not found');
        referenceItemId = invItem.id;

        const alreadyReserved = jobCardId
          ? await tx.jobCardPart.findFirst({ where: { jobCardId, inventoryItemId: invItem.id } })
          : null;

        if (!alreadyReserved) {
          // Conditional decrement with stock guard to prevent overselling & races.
          const decremented = await tx.inventoryItem.updateMany({
            where: { id: invItem.id, quantityInStock: { gte: body.quantity } },
            data: { quantityInStock: { decrement: body.quantity } },
          });
          if (decremented.count === 0) {
            throw new ValidationError(`Insufficient stock for ${invItem.itemName}`);
          }
          const updated = await tx.inventoryItem.findUniqueOrThrow({ where: { id: invItem.id } });
          const newQty = Number(updated.quantityInStock);
          const prevQty = newQty + body.quantity;
          await tx.stockMovement.create({
            data: {
              inventoryItemId: invItem.id,
              movementType: 'STOCK_OUT',
              quantity: body.quantity,
              previousQuantity: prevQty,
              newQuantity: newQty,
              reason: 'Invoice line item',
              relatedEntityType: 'Invoice',
              relatedEntityId: params.id,
            },
          });
        }
      }

      // Create line item
      const created = await tx.invoiceLineItem.create({
        data: {
          invoiceId: params.id,
          lineType: body.lineType,
          description: body.description,
          hsnCode: finalHsn,
          quantity: body.quantity,
          unitPrice: body.unitPrice,
          // For discount lines, discountPercent doubles as the persistent percent-mode
          // marker (>0 ⇒ percent, re-derived on every recalc); flat discounts store 0.
          discountPercent: isDiscount ? (body.discountMode === 'percent' ? body.unitPrice : 0) : body.discountPercent,
          taxRate: body.taxRate,
          taxAmount,
          lineTotal,
          sortOrder: 0,
          referenceItemId,
        },
      });

      // Sync to job card (all types except DISCOUNT_ADJUSTMENT)
      if (jobCardId && !isDiscount) {
        if (body.lineType === 'PART' && referenceItemId) {
          const exists = await tx.jobCardPart.findFirst({ where: { jobCardId, inventoryItemId: referenceItemId } });
          if (!exists) {
            await tx.jobCardPart.create({
              data: { jobCardId, inventoryItemId: referenceItemId, requiredQty: body.quantity, reservedQty: body.quantity, unitPrice: body.unitPrice },
            });
          }
        } else if (body.lineType !== 'PART') {
          await tx.jobCardTask.create({ data: { jobCardId, taskName: body.description, status: 'COMPLETED' } });
        }
      }

      await recalcTotalsTx(tx, params.id, inv);
      return created;
    }, { timeout: 30000, maxWait: 10000 });

    logActivity({ entityType: 'InvoiceLineItem', entityId: item.id, action: 'invoice.line.added', newValue: body, actorType: 'ADMIN', actorId: user.sub });
    return NextResponse.json({ success: true, data: item }, { status: 201 });
  } catch (e) { return handleApiError(e); }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = requirePermission(PERMISSIONS.INVOICES_CREATE);
    const body = z.object({
      lineItemId: z.string(),
      description: z.string().optional(),
      quantity: z.number().optional(),
      unitPrice: z.number().optional(),
      taxRate: z.number().optional(),
      discountPercent: z.number().min(0).max(100).optional(),
      // For DISCOUNT_ADJUSTMENT lines the caller must declare mode so the
      // recompute uses the correct formula. Schema does not persist this on
      // the line row yet (TODO: dedicated column).
      discountMode: z.preprocess(v => v === '' ? undefined : v, z.enum(['flat', 'percent']).optional()),
    }).parse(await req.json());

    const item = await prisma.$transaction(async (tx) => {
      const inv = await ensureDraftTx(tx, params.id);
      const { lineItemId, ...data } = body;
      const existing = await tx.invoiceLineItem.findFirstOrThrow({ where: { id: lineItemId, invoiceId: params.id } });
      const qty = data.quantity ?? Number(existing.quantity);
      const price = data.unitPrice ?? Number(existing.unitPrice);
      const discount = data.discountPercent ?? Number(existing.discountPercent);
      const rate = data.taxRate ?? Number(existing.taxRate);

      let taxAmount: number;
      let lineTotal: number;
      let discountPercentToStore = data.discountPercent ?? Number(existing.discountPercent);
      if (existing.lineType === 'DISCOUNT_ADJUSTMENT') {
        // Discount lines have their own math: lineTotal is negative and there
        // is no tax. Percent mode anchors to the pre-discount subtotal of the
        // OTHER lines on this invoice (the canonical percent-discount base) and
        // persists the percent into discountPercent so recalcTotalsTx can
        // re-derive it whenever other lines change later.
        taxAmount = 0;
        // Mode resolution: caller-supplied → persisted marker (discountPercent>0 ⇒ percent) → flat.
        const mode = data.discountMode ?? (Number(existing.discountPercent) > 0 ? 'percent' : 'flat');
        if (mode === 'percent') {
          const otherLines = await tx.invoiceLineItem.findMany({
            where: { invoiceId: params.id, lineType: { not: 'DISCOUNT_ADJUSTMENT' } },
            select: { quantity: true, unitPrice: true },
          });
          const preSubtotal = otherLines.reduce((s, l) => s + Number(l.quantity) * Number(l.unitPrice), 0);
          lineTotal = -(preSubtotal * (price / 100));
          discountPercentToStore = price; // persist the percent marker
        } else {
          lineTotal = -Math.abs(qty * price);
          discountPercentToStore = 0;
        }
      } else {
        const subtotal = qty * price * (1 - discount / 100);
        taxAmount = subtotal * (rate / 100);
        lineTotal = subtotal + taxAmount;
      }
      // discountMode is API-only (not a column); discountPercent is set explicitly below.
      const { discountMode: _dm, discountPercent: _dp, ...persistable } = data;
      const updated = await tx.invoiceLineItem.update({ where: { id: lineItemId }, data: { ...persistable, discountPercent: discountPercentToStore, taxAmount, lineTotal } });
      await recalcTotalsTx(tx, params.id, inv);
      return updated;
    });

    logActivity({ entityType: 'InvoiceLineItem', entityId: body.lineItemId, action: 'invoice.line.updated', newValue: body, actorType: 'ADMIN', actorId: user.sub });
    return NextResponse.json({ success: true, data: item });
  } catch (e) { return handleApiError(e); }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = requirePermission(PERMISSIONS.INVOICES_CREATE);
    const lineItemId = req.nextUrl.searchParams.get('lineItemId');
    if (!lineItemId) return NextResponse.json({ success: false, error: { message: 'lineItemId required' } }, { status: 400 });

    await prisma.$transaction(async (tx) => {
      await ensureDraftTx(tx, params.id);
      const lineItem = await tx.invoiceLineItem.findFirstOrThrow({ where: { id: lineItemId, invoiceId: params.id } });

      // If PART with referenceItemId, restore stock + ledger entry.
      // NOTE: referenceItemId is overloaded — for PART lines it points at InventoryItem,
      // for AMC lines it points at AmcPlan/AmcContract. Defensively verify the FK resolves
      // to an InventoryItem before touching stock so a misclassified line can never
      // increment some unrelated record's stock.
      if (lineItem.lineType === 'PART' && lineItem.referenceItemId) {
        const invItem = await tx.inventoryItem.findUnique({ where: { id: lineItem.referenceItemId } });
        if (!invItem) {
          throw new ValidationError('PART line item references a non-existent inventory item');
        }
        const qty = Number(lineItem.quantity);
        await tx.inventoryItem.update({
          where: { id: lineItem.referenceItemId },
          data: { quantityInStock: { increment: qty } },
        });
        const updated = await tx.inventoryItem.findUniqueOrThrow({ where: { id: lineItem.referenceItemId } });
        const newQty = Number(updated.quantityInStock);
        await tx.stockMovement.create({
          data: {
            inventoryItemId: lineItem.referenceItemId,
            movementType: 'STOCK_IN',
            quantity: qty,
            previousQuantity: newQty - qty,
            newQuantity: newQty,
            reason: 'Invoice line item removed',
            relatedEntityType: 'Invoice',
            relatedEntityId: params.id,
          },
        });
        // Remove from job card parts
        const inv = await tx.invoice.findUniqueOrThrow({ where: { id: params.id }, select: { jobCardId: true } });
        if (inv.jobCardId) {
          await tx.jobCardPart.deleteMany({ where: { jobCardId: inv.jobCardId, inventoryItemId: lineItem.referenceItemId } });
        }
      }

      // AMC rollback: undo any service usage created against this invoice's job card.
      // DRAFT-time POST no longer decrements, so this is normally a no-op. It guards
      // the edge case where finalize ran, then the invoice was reverted to DRAFT
      // before the line item was deleted.
      if (lineItem.lineType === 'AMC' && lineItem.referenceItemId) {
        const inv = await tx.invoice.findUniqueOrThrow({ where: { id: params.id } });
        const contract = await tx.amcContract.findUnique({ where: { id: lineItem.referenceItemId } });
        if (contract && inv.jobCardId) {
          const usage = await tx.amcServiceUsage.findFirst({
            where: { amcContractId: contract.id, jobCardId: inv.jobCardId },
            orderBy: { serviceNumber: 'desc' },
          });
          if (usage) {
            await tx.amcServiceUsage.delete({ where: { id: usage.id } });
            await tx.amcContract.update({
              where: { id: contract.id },
              data: { servicesUsed: { decrement: 1 }, servicesRemaining: { increment: 1 } },
            });
          }
        }

        // Revert discounts on PART and SERVICE_CHARGE lines when AMC is removed.
        // Determine extraDiscountPercent: from contract if usage-line, or from plan if purchase-line.
        let extraDisc = 0;
        let laborDisc = 100;
        if (contract) {
          extraDisc = Number(contract.extraDiscountPercent);
          laborDisc = Number(contract.laborDiscountPercent);
        } else {
          const plan = await tx.amcPlan.findUnique({ where: { id: lineItem.referenceItemId } });
          if (plan) {
            extraDisc = Number(plan.extraDiscountPercent);
            laborDisc = Number(plan.laborDiscountPercent);
          }
        }
        // Revert PART lines: subtract extraDiscountPercent, recalc lineTotal
        const partLines = await tx.invoiceLineItem.findMany({
          where: { invoiceId: params.id, lineType: 'PART' },
        });
        for (const pl of partLines) {
          const currentDisc = Number(pl.discountPercent);
          const revertedDisc = Math.max(0, currentDisc - extraDisc);
          if (revertedDisc !== currentDisc) {
            const qty = Number(pl.quantity);
            const price = Number(pl.unitPrice);
            const rate = Number(pl.taxRate);
            const sub = qty * price * (1 - revertedDisc / 100);
            const tax = sub * (rate / 100);
            await tx.invoiceLineItem.update({
              where: { id: pl.id },
              data: { discountPercent: revertedDisc, taxAmount: tax, lineTotal: sub + tax },
            });
          }
        }
        // Revert SERVICE_CHARGE lines: set discount back to 0
        const svcLines = await tx.invoiceLineItem.findMany({
          where: { invoiceId: params.id, lineType: 'SERVICE_CHARGE' },
        });
        for (const sl of svcLines) {
          if (Number(sl.discountPercent) >= laborDisc) {
            const qty = Number(sl.quantity);
            const price = Number(sl.unitPrice);
            const rate = Number(sl.taxRate);
            const sub = qty * price;
            const tax = sub * (rate / 100);
            await tx.invoiceLineItem.update({
              where: { id: sl.id },
              data: { discountPercent: 0, taxAmount: tax, lineTotal: sub + tax },
            });
          }
        }
      }

      await tx.invoiceLineItem.delete({ where: { id: lineItemId } });
      await recalcTotalsTx(tx, params.id);
    });

    logActivity({ entityType: 'InvoiceLineItem', entityId: lineItemId, action: 'invoice.line.removed', actorType: 'ADMIN', actorId: user.sub });
    return NextResponse.json({ success: true });
  } catch (e) { return handleApiError(e); }
}
