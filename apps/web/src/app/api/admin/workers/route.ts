import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { paginate, paginationMeta } from '@/lib/pagination';
import { requirePermission } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { logActivity } from '@/lib/activity-logger';
import { generateWorkerCode } from '@/lib/id-generators';
import { PERMISSIONS } from '@gearup/types';
import { z } from 'zod';

const workerSchema = z.object({
  fullName: z.string().min(1), phoneNumber: z.string().optional(), email: z.string().email().optional(),
  designation: z.string().optional(), specialization: z.string().optional(), employmentType: z.string().optional(),
  joiningDate: z.string().optional(), dailyCapacity: z.number().optional(), shiftStart: z.string().optional(),
  shiftEnd: z.string().optional(), notes: z.string().optional(),
});

export async function GET(req: NextRequest) {
  try {
    requirePermission(PERMISSIONS.WORKERS_MANAGE);
    const sp = req.nextUrl.searchParams;
    const page = Number(sp.get('page')) || 1;
    const pageSize = Number(sp.get('pageSize')) || 20;
    const status = sp.get('status') || '';
    const search = sp.get('search') || '';
    const p = paginate({ page, pageSize });
    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (search) where.OR = [{ fullName: { contains: search, mode: 'insensitive' } }, { workerCode: { contains: search, mode: 'insensitive' } }];
    const [data, total] = await Promise.all([
      prisma.worker.findMany({ where, ...p, orderBy: { createdAt: 'desc' }, include: { _count: { select: { assignments: true } } } }),
      prisma.worker.count({ where }),
    ]);
    return NextResponse.json({ success: true, data, meta: paginationMeta(total, page, pageSize) });
  } catch (e) { return handleApiError(e); }
}

export async function POST(req: NextRequest) {
  try {
    const user = requirePermission(PERMISSIONS.WORKERS_MANAGE);
    const body = workerSchema.parse(await req.json());
    const worker = await prisma.worker.create({ data: { workerCode: generateWorkerCode(), ...body, joiningDate: body.joiningDate ? new Date(body.joiningDate) : undefined } as any });
    await logActivity({ entityType: 'Worker', entityId: worker.id, action: 'worker.created', newValue: worker, actorType: 'ADMIN', actorId: user.sub });
    return NextResponse.json({ success: true, data: worker }, { status: 201 });
  } catch (e) { return handleApiError(e); }
}
