import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { logActivity } from '@/lib/activity-logger';
import { PERMISSIONS } from '@gearup/types';
import { z } from 'zod';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    requirePermission(PERMISSIONS.VEHICLES_VIEW);
    const vehicle = await prisma.vehicle.findUniqueOrThrow({ where: { id: params.id }, include: { customer: true, serviceRequests: { orderBy: { createdAt: 'desc' }, take: 10 }, jobCards: { orderBy: { createdAt: 'desc' }, take: 10 } } });
    return NextResponse.json({ success: true, data: vehicle });
  } catch (e) { return handleApiError(e); }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = requirePermission(PERMISSIONS.VEHICLES_EDIT);
    const body = z.object({ brand: z.string().optional(), model: z.string().optional(), variant: z.string().optional(), odometerReading: z.number().optional(), notes: z.string().optional() }).parse(await req.json());
    const vehicle = await prisma.vehicle.update({ where: { id: params.id }, data: body as any });
    await logActivity({ entityType: 'Vehicle', entityId: vehicle.id, action: 'vehicle.updated', newValue: vehicle, actorType: 'ADMIN', actorId: user.sub });
    return NextResponse.json({ success: true, data: vehicle });
  } catch (e) { return handleApiError(e); }
}
