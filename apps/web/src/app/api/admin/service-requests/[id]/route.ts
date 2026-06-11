import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { handleApiError, ValidationError } from '@/lib/errors';
import { logActivity } from '@/lib/activity-logger';
import { PERMISSIONS } from '@gearup/types';
import type { ServiceRequestStatus } from '@gearup/types';
import { z } from 'zod';

const SERVICE_REQUEST_STATUSES = [
  'SUBMITTED',
  'UNDER_REVIEW',
  'APPOINTMENT_PENDING',
  'APPOINTMENT_CONFIRMED',
  'CONVERTED_TO_JOB',
  'CANCELLED',
  'CLOSED',
] as const satisfies readonly ServiceRequestStatus[];

const TERMINAL_STATUSES: ReadonlySet<ServiceRequestStatus> = new Set(['CANCELLED', 'CLOSED']);

// Server-side state-machine. Mirrors the client STATUS_ACTIONS map in
// apps/web/src/app/admin/service-requests/[id]/page.tsx. Keep in sync.
const ALLOWED_TRANSITIONS: Record<ServiceRequestStatus, readonly ServiceRequestStatus[]> = {
  SUBMITTED: ['UNDER_REVIEW', 'CANCELLED'],
  UNDER_REVIEW: ['APPOINTMENT_PENDING', 'CANCELLED'],
  APPOINTMENT_PENDING: ['APPOINTMENT_CONFIRMED', 'CANCELLED'],
  APPOINTMENT_CONFIRMED: ['CONVERTED_TO_JOB', 'CANCELLED'],
  CONVERTED_TO_JOB: ['CLOSED'],
  CANCELLED: [],
  CLOSED: [],
};

// Urgency values mirror the public booking form. Keep aligned with any UI
// dropdown that writes to ServiceRequest.urgency.
const URGENCY_VALUES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;

const patchSchema = z.object({
  status: z.preprocess(v => v === '' ? undefined : v, z.enum(SERVICE_REQUEST_STATUSES).optional()),
  notes: z.string().max(2000).optional(),
  urgency: z.preprocess(v => v === '' ? undefined : v, z.enum(URGENCY_VALUES).optional()),
});

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
    const body = patchSchema.parse(await req.json());

    const existing = await prisma.serviceRequest.findUniqueOrThrow({
      where: { id: params.id },
      select: { id: true, status: true, closedAt: true, notes: true, urgency: true },
    });

    const data: {
      status?: ServiceRequestStatus;
      notes?: string;
      urgency?: string;
      closedAt?: Date | null;
    } = {};
    if (body.notes !== undefined) data.notes = body.notes;
    if (body.urgency !== undefined) data.urgency = body.urgency;

    if (body.status && body.status !== existing.status) {
      const allowed = ALLOWED_TRANSITIONS[existing.status as ServiceRequestStatus] ?? [];
      if (!allowed.includes(body.status)) {
        throw new ValidationError(
          `Illegal status transition: ${existing.status} -> ${body.status}`,
        );
      }
      data.status = body.status;
      if (TERMINAL_STATUSES.has(body.status)) {
        data.closedAt = new Date();
      } else if (existing.closedAt) {
        // Reopening: clear closedAt so audit/reporting stays accurate.
        data.closedAt = null;
      }
    }

    const sr = await prisma.serviceRequest.update({ where: { id: params.id }, data });
    logActivity({
      entityType: 'ServiceRequest',
      entityId: sr.id,
      action: 'service-request.updated',
      previousValue: { status: existing.status, notes: existing.notes, urgency: existing.urgency },
      newValue: body,
      actorType: 'ADMIN',
      actorId: user.sub,
    });
    return NextResponse.json({ success: true, data: sr });
  } catch (e) { return handleApiError(e); }
}
