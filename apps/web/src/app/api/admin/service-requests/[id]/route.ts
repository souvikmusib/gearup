import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { logActivity } from '@/lib/activity-logger';
import { PERMISSIONS } from '@gearup/types';
import { z } from 'zod';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    requirePermission(PERMISSIONS.SERVICE_REQUESTS_VIEW);
    const sr = await prisma.serviceRequest.findUniqueOrThrow({ where: { id: params.id }, include: { customer: true, vehicle: true, appointment: true, jobCards: true } });
    return NextResponse.json({ success: true, data: sr });
  } catch (e) { return handleApiError(e); }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = requirePermission(PERMISSIONS.SERVICE_REQUESTS_EDIT);
    const body = z.object({ status: z.string().optional(), notes: z.string().optional(), urgency: z.string().optional() }).parse(await req.json());
    const data: Record<string, unknown> = { ...body };
    if (body.status && ['CANCELLED', 'CLOSED'].includes(body.status)) data.closedAt = new Date();
    const sr = await prisma.serviceRequest.update({ where: { id: params.id }, data });
    logActivity({ entityType: 'ServiceRequest', entityId: sr.id, action: 'service-request.updated', newValue: body, actorType: 'ADMIN', actorId: user.sub });
    return NextResponse.json({ success: true, data: sr });
  } catch (e) { return handleApiError(e); }
}
