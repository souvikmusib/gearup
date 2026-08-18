import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { paginate, paginationMeta } from '@/lib/pagination';
import { MAX_PAGE_SIZE } from '@/lib/constants';
import { requirePermission } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { logActivity } from '@/lib/activity-logger';
import { generateEstimateNumber } from '@/lib/id-generators';
import { PERMISSIONS } from '@gearup/types';
import { z } from 'zod';

const itemSchema = z.object({
  lineType: z.enum(['PART', 'LABOR', 'SERVICE_CHARGE', 'CUSTOM_CHARGE', 'DISCOUNT_ADJUSTMENT']).default('PART'),
  inventoryItemId: z.string().optional().nullable(),
  description: z.string().trim().min(1),
  hsnCode: z.string().optional().nullable(),
  quantity: z.number().positive().default(1),
  unitPrice: z.number().nonnegative().default(0),
  discountPercent: z.number().min(0).max(100).default(0),
  taxRate: z.number().min(0).max(100).default(0),
  sortOrder: z.number().default(0),
});

const createSchema = z.object({
  customerId: z.string(),
  vehicleId: z.string().optional(),
  notes: z.string().optional(),
  validUntil: z.string().optional(),
  items: z.array(itemSchema).min(1, 'At least one item is required'),
});

export async function GET(req: NextRequest) {
  try {
    requirePermission(PERMISSIONS.INVOICES_VIEW);
    const sp = req.nextUrl.searchParams;
    const page = z.coerce.number().int().min(1).default(1).parse(sp.get('page') ?? undefined);
    const pageSize = z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(20).parse(sp.get('pageSize') ?? undefined);
    const p = paginate({ page, pageSize });

    const where: Record<string, unknown> = {};
    const status = sp.get('status');
    if (status) where.status = status;
    const search = sp.get('search');
    if (search) {
      where.OR = [
        { estimateNumber: { contains: search, mode: 'insensitive' } },
        { customer: { fullName: { contains: search, mode: 'insensitive' } } },
        { customer: { phoneNumber: { contains: search } } },
      ];
    }

    const [data, total] = await Promise.all([
      prisma.estimate.findMany({
        where,
        ...p,
        orderBy: { createdAt: 'desc' },
        include: {
          customer: { select: { fullName: true, phoneNumber: true } },
          vehicle: { select: { registrationNumber: true, brand: true, model: true } },
          _count: { select: { items: true } },
        },
      }),
      prisma.estimate.count({ where }),
    ]);

    return NextResponse.json({ success: true, data: { items: data }, meta: paginationMeta(total, page, pageSize) });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = requirePermission(PERMISSIONS.INVOICES_CREATE);
    const body = createSchema.parse(await req.json());

    const estimate = await prisma.$transaction(async (tx) => {
      const estimateNumber = await generateEstimateNumber(tx);

      // Compute line totals
      const items = body.items.map((item, i) => {
        const isDiscount = item.lineType === 'DISCOUNT_ADJUSTMENT';
        const baseAmount = Number(item.quantity) * Number(item.unitPrice);
        const discountAmount = baseAmount * (Number(item.discountPercent ?? 0) / 100);
        const afterDiscount = baseAmount - discountAmount;
        const taxAmount = afterDiscount * (Number(item.taxRate) / 100);
        const lineTotal = isDiscount ? -(afterDiscount + taxAmount) : afterDiscount + taxAmount;
        return {
          lineType: item.lineType ?? 'PART',
          inventoryItemId: item.inventoryItemId || null,
          description: item.description,
          hsnCode: item.hsnCode || null,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discountPercent: item.discountPercent ?? 0,
          taxRate: item.taxRate,
          taxAmount: Math.abs(taxAmount),
          lineTotal,
          sortOrder: item.sortOrder ?? i,
        };
      });

      const subtotal = items.reduce((sum, i) => sum + (i.lineTotal < 0 ? 0 : Number(i.quantity) * Number(i.unitPrice)), 0);
      const discountTotal = items.filter(i => i.lineTotal < 0).reduce((sum, i) => sum + Math.abs(i.lineTotal), 0);
      const taxTotal = items.reduce((sum, i) => sum + i.taxAmount, 0);
      const grandTotal = items.reduce((sum, i) => sum + i.lineTotal, 0);

      return tx.estimate.create({
        data: {
          estimateNumber,
          customerId: body.customerId,
          vehicleId: body.vehicleId || null,
          notes: body.notes,
          validUntil: body.validUntil ? new Date(body.validUntil) : null,
          subtotal,
          taxTotal,
          grandTotal,
          createdByAdminId: auth.sub,
          items: { create: items },
        },
        include: {
          customer: { select: { fullName: true, phoneNumber: true } },
          vehicle: { select: { registrationNumber: true, brand: true, model: true } },
          items: { include: { inventoryItem: { select: { sku: true, itemName: true } } }, orderBy: { sortOrder: 'asc' } },
        },
      });
    });

    void logActivity({ entityType: 'Estimate', entityId: estimate.id, action: 'estimate.created', newValue: { estimateNumber: estimate.estimateNumber }, actorType: 'ADMIN', actorId: auth.sub });

    return NextResponse.json({ success: true, data: estimate }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
