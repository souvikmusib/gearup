import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { paginate, paginationMeta } from '@/lib/pagination';
import { requirePermission } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { logActivity } from '@/lib/activity-logger';
import { PERMISSIONS } from '@gearup/types';
import { z } from 'zod';

const vehicleSchema = z.object({
  customerId: z.string(), vehicleType: z.enum(['CAR', 'BIKE', 'OTHER']), registrationNumber: z.string().min(1),
  brand: z.string().min(1), model: z.string().min(1), variant: z.string().optional(),
  yearOfManufacture: z.number().optional(), fuelType: z.string().optional(), transmission: z.string().optional(),
  color: z.string().optional(), vin: z.string().optional(), chassisNumber: z.string().optional(),
  engineNumber: z.string().optional(), odometerReading: z.number().optional(), notes: z.string().optional(),
});

export async function GET(req: NextRequest) {
  try {
    requirePermission(PERMISSIONS.VEHICLES_VIEW);
    const sp = req.nextUrl.searchParams;
    const page = Number(sp.get('page')) || 1;
    const pageSize = Number(sp.get('pageSize')) || 20;
    const search = sp.get('search') || '';
    const p = paginate({ page, pageSize });
    const where = search ? { OR: [{ registrationNumber: { contains: search, mode: 'insensitive' as const } }, { brand: { contains: search, mode: 'insensitive' as const } }, { model: { contains: search, mode: 'insensitive' as const } }] } : {};
    const [data, total] = await Promise.all([
      prisma.vehicle.findMany({ where, ...p, orderBy: { createdAt: 'desc' }, include: { customer: { select: { id: true, fullName: true, phoneNumber: true } } } }),
      prisma.vehicle.count({ where }),
    ]);
    return NextResponse.json({ success: true, data, meta: paginationMeta(total, page, pageSize) });
  } catch (e) { return handleApiError(e); }
}

export async function POST(req: NextRequest) {
  try {
    const user = requirePermission(PERMISSIONS.VEHICLES_EDIT);
    const body = vehicleSchema.parse(await req.json());
    const vehicle = await prisma.vehicle.create({ data: body as any });
    logActivity({ entityType: 'Vehicle', entityId: vehicle.id, action: 'vehicle.created', newValue: vehicle, actorType: 'ADMIN', actorId: user.sub });
    return NextResponse.json({ success: true, data: vehicle }, { status: 201 });
  } catch (e) { return handleApiError(e); }
}
