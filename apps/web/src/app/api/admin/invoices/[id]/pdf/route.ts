import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { PERMISSIONS } from '@gearup/types';
import {
  generateInvoiceHTML,
  generateCustomerDraftHTML,
  generateMechanicCopyHTML,
  generateAmcInvoiceHTML,
  generateCombinedHTML,
} from '@/lib/invoice-templates';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    requirePermission(PERMISSIONS.INVOICES_VIEW);

    const invoice = await prisma.invoice.findUniqueOrThrow({
      where: { id: params.id },
      include: {
        lineItems: { orderBy: { sortOrder: 'asc' } },
        payments: { orderBy: { paymentDate: 'desc' } },
        customer: true,
        vehicle: true,
        jobCard: { select: { jobCardNumber: true, issueSummary: true, odometerAtIntake: true, fuelIndicator: true, tasks: { select: { taskName: true, status: true } }, parts: { include: { inventoryItem: { select: { itemName: true } } } } } },
      },
    });

    const settingsRaw = await prisma.setting.findMany();
    const settings = Object.fromEntries(settingsRaw.map((s: any) => [s.key, s.value]));
    const logoUrl = `${req.nextUrl.origin}/brand/gearup.svg`;
    const type = req.nextUrl.searchParams.get('type') || 'invoice';

    // Lookup inventory items for SKU/MRP
    const refIds = invoice.lineItems.filter((li: any) => li.referenceItemId).map((li: any) => li.referenceItemId);
    const invItems = refIds.length > 0 ? await prisma.inventoryItem.findMany({ where: { id: { in: refIds } }, select: { id: true, sku: true, mrp: true, hsnCode: true } }) : [];
    const itemMap = Object.fromEntries(invItems.map((i: any) => [i.id, i]));

    // Check if invoice has AMC line items OR vehicle has an active AMC contract
    const hasAmc = invoice.lineItems.some((li: any) => li.lineType === 'AMC');
    let amcContract: any = null;
    if (invoice.vehicleId) {
      amcContract = await prisma.amcContract.findFirst({ where: { vehicleId: invoice.vehicleId, status: 'ACTIVE' }, include: { plan: true } });
    }
    // If invoice has AMC line (plan purchase) but contract doesn't exist yet, build from plan
    if (!amcContract && hasAmc) {
      const amcLine = invoice.lineItems.find((li: any) => li.lineType === 'AMC');
      if (amcLine?.referenceItemId) {
        const plan = await prisma.amcPlan.findUnique({ where: { id: amcLine.referenceItemId } });
        if (plan) {
          amcContract = {
            contractNumber: 'PENDING',
            totalServices: plan.totalServicesIncluded,
            servicesUsed: 0,
            servicesRemaining: plan.totalServicesIncluded,
            extraDiscountPercent: plan.extraDiscountPercent,
            laborDiscountPercent: plan.laborDiscountPercent,
            startDate: new Date(),
            endDate: new Date(Date.now() + plan.durationMonths * 30 * 86400000),
            plan,
          };
        }
      }
    }

    let html: string;
    if (type === 'combined') {
      html = generateCombinedHTML(invoice, settings, logoUrl);
    } else if (type === 'customer-draft') {
      html = generateCustomerDraftHTML(invoice, settings, logoUrl);
    } else if (type === 'mechanic') {
      html = generateMechanicCopyHTML(invoice, settings, logoUrl);
    } else if (amcContract) {
      html = generateAmcInvoiceHTML(invoice, settings, logoUrl, amcContract);
    } else {
      html = generateInvoiceHTML(invoice, settings, logoUrl, itemMap);
    }

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `inline; filename="${invoice.invoiceNumber}-${type}.html"`,
      },
    });
  } catch (e) { return handleApiError(e); }
}
