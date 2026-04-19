import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { paginate, paginationMeta } from '@/lib/pagination';
import { requirePermission } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { logActivity } from '@/lib/activity-logger';
import { PERMISSIONS } from '@gearup/types';
import { z } from 'zod';

const createSchema = z.object({
  fullName: z.string().min(1), phoneNumber: z.string().min(5), alternatePhone: z.string().optional(),
  email: z.string().email().optional(), addressLine1: z.string().optional(), addressLine2: z.string().optional(),
  city: z.string().optional(), state: z.string().optional(), postalCode: z.string().optional(),
  notes: z.string().optional(), source: z.string().optional(),
});

export async function GET(req: NextRequest) {
  try {
    requirePermission(PERMISSIONS.CUSTOMERS_VIEW);
    const sp = req.nextUrl.searchParams;
    const page = Number(sp.get('page')) || 1;
    const pageSize = Number(sp.get('pageSize')) || 20;
    const search = sp.get('search') || '';
    const p = paginate({ page, pageSize });
    const where = search ? { OR: [{ fullName: { contains: search, mode: 'insensitive' as const } }, { phoneNumber: { contains: search } }, { email: { contains: search, mode: 'insensitive' as const } }] } : {};
    const [data, total] = await Promise.all([
      prisma.customer.findMany({ where, ...p, orderBy: { createdAt: 'desc' }, include: { _count: { select: { vehicles: true, jobCards: true } } } }),
      prisma.customer.count({ where }),
    ]);
    return NextResponse.json({ success: true, data, meta: paginationMeta(total, page, pageSize) });
  } catch (e) { return handleApiError(e); }
}

export async function POST(req: NextRequest) {
  try {
    const user = requirePermission(PERMISSIONS.CUSTOMERS_EDIT);
    const body = createSchema.parse(await req.json());
    const customer = await prisma.customer.create({ data: body as any });
    await logActivity({ entityType: 'Customer', entityId: customer.id, action: 'customer.created', newValue: customer, actorType: 'ADMIN', actorId: user.sub });
    return NextResponse.json({ success: true, data: customer }, { status: 201 });
  } catch (e) { return handleApiError(e); }
}
