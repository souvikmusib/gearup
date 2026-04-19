import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { paginate, paginationMeta } from '@/lib/pagination';
import { requireAnyPermission } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { logActivity } from '@/lib/activity-logger';
import { generateJobCardNumber } from '@/lib/id-generators';
import { PERMISSIONS } from '@gearup/types';
import { z } from 'zod';

const createSchema = z.object({
  appointmentId: z.string().optional(), serviceRequestId: z.string().optional(),
  customerId: z.string(), vehicleId: z.string(), issueSummary: z.string().min(1),
  customerComplaints: z.string().optional(), priority: z.string().optional(), estimatedDeliveryAt: z.string().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const user = requireAnyPermission(PERMISSIONS.JOB_CARDS_CREATE, PERMISSIONS.JOB_CARDS_VIEW_OWN);
    const sp = req.nextUrl.searchParams;
    const page = Number(sp.get('page')) || 1;
    const pageSize = Number(sp.get('pageSize')) || 20;
    const status = sp.get('status') || '';
    const search = sp.get('search') || '';
    const p = paginate({ page, pageSize });
    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (search) where.OR = [{ jobCardNumber: { contains: search, mode: 'insensitive' } }, { customer: { fullName: { contains: search, mode: 'insensitive' } } }];
    const [data, total] = await Promise.all([
      prisma.jobCard.findMany({ where, ...p, orderBy: { createdAt: 'desc' }, include: { customer: { select: { fullName: true, phoneNumber: true } }, vehicle: { select: { registrationNumber: true, brand: true, model: true } }, assignments: { include: { worker: { select: { fullName: true } } } } } }),
      prisma.jobCard.count({ where }),
    ]);
    return NextResponse.json({ success: true, data, meta: paginationMeta(total, page, pageSize) });
  } catch (e) { return handleApiError(e); }
}

export async function POST(req: NextRequest) {
  try {
    const user = requirePermission(PERMISSIONS.JOB_CARDS_CREATE);
    const body = createSchema.parse(await req.json());
    const jc = await prisma.jobCard.create({ data: { jobCardNumber: generateJobCardNumber(), ...body, intakeDate: new Date(), estimatedDeliveryAt: body.estimatedDeliveryAt ? new Date(body.estimatedDeliveryAt) : undefined } as any });
    if (body.serviceRequestId) await prisma.serviceRequest.update({ where: { id: body.serviceRequestId }, data: { status: 'CONVERTED_TO_JOB' } });
    logActivity({ entityType: 'JobCard', entityId: jc.id, action: 'job-card.created', newValue: jc, actorType: 'ADMIN', actorId: user.sub });
    return NextResponse.json({ success: true, data: jc }, { status: 201 });
  } catch (e) { return handleApiError(e); }
}
