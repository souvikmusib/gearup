import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { logActivity } from '@/lib/activity-logger';
import { PERMISSIONS } from '@gearup/types';
import { z } from 'zod';

const itemSchema = z.object({
  inventoryItemId: z.string(),
  description: z.string().trim().min(1),
  quantity: z.number().positive().default(1),
  unitPrice: z.number().nonnegative().default(0),
  taxRate: z.number().min(0).max(100).default(0),
  sortOrder: z.number().default(0),
});

const patchSchema = z.object({
  notes: z.string().optional(),
  validUntil: z.string().nullable().optional(),
  status: z.enum(['DRAFT', 'CANCELLED']).optional(),
  items: z.array(itemSchema).optional(),
});

type RouteContext = { params: { id: string } };

export async function GET(_req: NextRequest, { params }: RouteContext) {
  try {
    requirePermission(PERMISSIONS.INVOICES_VIEW);
    const estimate = await prisma.estimate.findUnique({
      where: { id: params.id },
      include: {
        customer: { select: { fullName: true, phoneNumber: true, addressLine1: true, city: true } },
        vehicle: { select: { registrationNumber: true, brand: true, model: true } },
        items: {
          include: { inventoryItem: { select: { sku: true, itemName: true, hsnCode: true } } },
          orderBy: { sortOrder: 'asc' },
        },
        createdBy: { select: { fullName: true } },
      },
    });
    if (!estimate) return NextResponse.json({ success: false, error: { message: 'Estimate not found' } }, { status: 404 });
    return NextResponse.json({ success: true, data: estimate });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  try {
    const auth = requirePermission(PERMISSIONS.INVOICES_CREATE);
    const body = patchSchema.parse(await req.json());

    const existing = await prisma.estimate.findUnique({ where: { id: params.id } });
    if (!existing) return NextResponse.json({ success: false, error: { message: 'Estimate not found' } }, { status: 404 });
    if (existing.status !== 'DRAFT') return NextResponse.json({ success: false, error: { message: 'Only DRAFT estimates can be edited' } }, { status: 400 });

    const estimate = await prisma.$transaction(async (tx) => {
      // If items are provided, replace them all
      if (body.items) {
        await tx.estimateItem.deleteMany({ where: { estimateId: params.id } });

        const items = body.items.map((item, i) => {
          const lineTotal = Number(item.quantity) * Number(item.unitPrice);
          const taxAmount = lineTotal * (Number(item.taxRate) / 100);
          return {
            ...item,
            taxAmount,
            lineTotal: lineTotal + taxAmount,
            sortOrder: item.sortOrder ?? i,
            estimateId: params.id,
          };
        });

        await tx.estimateItem.createMany({ data: items });

        const subtotal = items.reduce((sum, i) => sum + (Number(i.quantity) * Number(i.unitPrice)), 0);
        const taxTotal = items.reduce((sum, i) => sum + i.taxAmount, 0);
        const grandTotal = subtotal + taxTotal;

        return tx.estimate.update({
          where: { id: params.id },
          data: {
            notes: body.notes ?? existing.notes,
            validUntil: body.validUntil !== undefined ? (body.validUntil ? new Date(body.validUntil) : null) : existing.validUntil,
            status: body.status ?? existing.status,
            subtotal,
            taxTotal,
            grandTotal,
          },
          include: {
            customer: { select: { fullName: true, phoneNumber: true } },
            vehicle: { select: { registrationNumber: true, brand: true, model: true } },
            items: { include: { inventoryItem: { select: { sku: true, itemName: true } } }, orderBy: { sortOrder: 'asc' } },
          },
        });
      }

      // No items change — just update metadata
      return tx.estimate.update({
        where: { id: params.id },
        data: {
          ...(body.notes !== undefined && { notes: body.notes }),
          ...(body.validUntil !== undefined && { validUntil: body.validUntil ? new Date(body.validUntil) : null }),
          ...(body.status && { status: body.status }),
        },
        include: {
          customer: { select: { fullName: true, phoneNumber: true } },
          vehicle: { select: { registrationNumber: true, brand: true, model: true } },
          items: { include: { inventoryItem: { select: { sku: true, itemName: true } } }, orderBy: { sortOrder: 'asc' } },
        },
      });
    });

    void logActivity({ entityType: 'Estimate', entityId: estimate.id, action: 'estimate.updated', actorType: 'ADMIN', actorId: auth.sub });
    return NextResponse.json({ success: true, data: estimate });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  try {
    const auth = requirePermission(PERMISSIONS.INVOICES_CREATE);
    const existing = await prisma.estimate.findUnique({ where: { id: params.id } });
    if (!existing) return NextResponse.json({ success: false, error: { message: 'Estimate not found' } }, { status: 404 });
    if (existing.status === 'CONVERTED') return NextResponse.json({ success: false, error: { message: 'Cannot delete a converted estimate' } }, { status: 400 });

    await prisma.estimate.delete({ where: { id: params.id } });
    void logActivity({ entityType: 'Estimate', entityId: params.id, action: 'estimate.deleted', actorType: 'ADMIN', actorId: auth.sub });
    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err);
  }
}
