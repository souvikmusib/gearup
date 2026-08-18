import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { logActivity } from '@/lib/activity-logger';
import { generateJobCardNumber, generateInvoiceNumber } from '@/lib/id-generators';
import { PERMISSIONS } from '@gearup/types';

type RouteContext = { params: { id: string } };

export async function POST(_req: NextRequest, { params }: RouteContext) {
  try {
    const auth = requirePermission(PERMISSIONS.INVOICES_CREATE);

    const estimate = await prisma.estimate.findUnique({
      where: { id: params.id },
      include: { items: { orderBy: { sortOrder: 'asc' } } },
    });

    if (!estimate) {
      return NextResponse.json({ success: false, error: { message: 'Estimate not found' } }, { status: 404 });
    }
    if (estimate.status === 'CONVERTED') {
      return NextResponse.json({ success: false, error: { message: 'Estimate already converted' } }, { status: 400 });
    }
    if (estimate.status === 'CANCELLED') {
      return NextResponse.json({ success: false, error: { message: 'Cannot convert a cancelled estimate' } }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const jobCardNumber = await generateJobCardNumber(tx);
      const invoiceNumber = await generateInvoiceNumber(tx);

      // 1. Create Job Card
      const estimatedPartsCost = estimate.items.reduce(
        (sum, item) => sum + Number(item.quantity) * Number(item.unitPrice), 0
      );

      const jobCard = await tx.jobCard.create({
        data: {
          jobCardNumber,
          customerId: estimate.customerId,
          vehicleId: estimate.vehicleId || '',
          intakeDate: new Date(),
          issueSummary: `From Estimate ${estimate.estimateNumber}`,
          estimatedPartsCost,
          estimatedTotal: estimatedPartsCost,
          status: 'CREATED',
          parts: {
            create: estimate.items.map((item) => ({
              inventoryItemId: item.inventoryItemId,
              requiredQty: item.quantity,
              unitPrice: item.unitPrice,
            })),
          },
        },
      });

      // 2. Create Invoice (DRAFT) with parts as line items
      const lineItems = estimate.items.map((item, i) => {
        const lineTotal = Number(item.quantity) * Number(item.unitPrice);
        const taxAmount = lineTotal * (Number(item.taxRate) / 100);
        return {
          lineType: 'PART' as const,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          taxRate: item.taxRate,
          taxAmount,
          lineTotal: lineTotal + taxAmount,
          sortOrder: i,
        };
      });

      const subtotal = lineItems.reduce((sum, li) => sum + Number(li.quantity) * Number(li.unitPrice), 0);
      const taxTotal = lineItems.reduce((sum, li) => sum + li.taxAmount, 0);
      const grandTotal = subtotal + taxTotal;

      const invoice = await tx.invoice.create({
        data: {
          invoiceNumber,
          customerId: estimate.customerId,
          vehicleId: estimate.vehicleId,
          jobCardId: jobCard.id,
          invoiceDate: new Date(),
          subtotal,
          taxTotal,
          grandTotal,
          amountDue: grandTotal,
          createdByAdminId: auth.sub,
          lineItems: { create: lineItems },
        },
      });

      // 3. Mark estimate as converted
      await tx.estimate.update({
        where: { id: params.id },
        data: {
          status: 'CONVERTED',
          convertedJobCardId: jobCard.id,
          convertedInvoiceId: invoice.id,
        },
      });

      return { jobCard, invoice };
    }, { timeout: 30000, maxWait: 10000 });

    void logActivity({
      entityType: 'Estimate',
      entityId: params.id,
      action: 'estimate.converted',
      actorType: 'ADMIN',
      actorId: auth.sub,
      newValue: {
        jobCardId: result.jobCard.id,
        jobCardNumber: result.jobCard.jobCardNumber,
        invoiceId: result.invoice.id,
        invoiceNumber: result.invoice.invoiceNumber,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        jobCardId: result.jobCard.id,
        jobCardNumber: result.jobCard.jobCardNumber,
        invoiceId: result.invoice.id,
        invoiceNumber: result.invoice.invoiceNumber,
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
