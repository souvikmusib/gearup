import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { handleApiError, NotFoundError, ValidationError } from '@/lib/errors';
import { logActivity } from '@/lib/activity-logger';
import { z } from 'zod';

const actionSchema = z.object({
  action: z.enum(['approved', 'rejected']),
  comment: z.string().trim().max(1000).optional(),
});

function publicEstimate(jobCard: {
  id: string;
  jobCardNumber: string;
  issueSummary: string;
  estimateNotes: string | null;
  customerVisibleNotes: string | null;
  approvalStatus: string;
  status: string;
  estimatedPartsCost: unknown;
  estimatedLaborCost: unknown;
  estimatedTotal: unknown;
  customer: { fullName: string };
  vehicle: { registrationNumber: string; brand: string; model: string };
}) {
  return {
    id: jobCard.id,
    jobCardNumber: jobCard.jobCardNumber,
    customerName: jobCard.customer.fullName,
    vehicle: `${jobCard.vehicle.registrationNumber} - ${jobCard.vehicle.brand} ${jobCard.vehicle.model}`,
    issueSummary: jobCard.issueSummary,
    estimateNotes: jobCard.estimateNotes,
    customerVisibleNotes: jobCard.customerVisibleNotes,
    approvalStatus: jobCard.approvalStatus,
    status: jobCard.status,
    estimatedPartsCost: Number(jobCard.estimatedPartsCost),
    estimatedLaborCost: Number(jobCard.estimatedLaborCost),
    estimatedTotal: Number(jobCard.estimatedTotal),
  };
}

export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  try {
    const jobCard = await prisma.jobCard.findUnique({
      where: { id: params.token },
      include: {
        customer: { select: { fullName: true } },
        vehicle: { select: { registrationNumber: true, brand: true, model: true } },
      },
    });
    if (!jobCard) throw new NotFoundError('Estimate');

    return NextResponse.json({ success: true, data: publicEstimate(jobCard) });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  try {
    const body = actionSchema.parse(await req.json());
    const jobCard = await prisma.jobCard.findUnique({
      where: { id: params.token },
      select: {
        id: true,
        status: true,
        approvalStatus: true,
        customerVisibleNotes: true,
      },
    });
    if (!jobCard) throw new NotFoundError('Estimate');
    if (jobCard.approvalStatus === 'APPROVED' || jobCard.approvalStatus === 'REJECTED') {
      throw new ValidationError(`Estimate already ${jobCard.approvalStatus.toLowerCase()}.`);
    }

    const approvalStatus = body.action === 'approved' ? 'APPROVED' : 'REJECTED';
    const status = body.action === 'approved' ? 'APPROVED' : 'REJECTED';
    const customerVisibleNotes = body.comment
      ? [jobCard.customerVisibleNotes, `Customer ${body.action} estimate: ${body.comment}`].filter(Boolean).join('\n\n')
      : jobCard.customerVisibleNotes;

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.jobCard.updateMany({
        where: { id: params.token, approvalStatus: 'PENDING' },
        data: { approvalStatus, status, customerVisibleNotes },
      });
      if (result.count === 0) throw new ValidationError('Estimate response was already submitted.');
      return tx.jobCard.findUniqueOrThrow({ where: { id: params.token } });
    });

    logActivity({
      entityType: 'JobCard',
      entityId: updated.id,
      action: body.action === 'approved' ? 'estimate.approved' : 'estimate.rejected',
      previousValue: { approvalStatus: jobCard.approvalStatus, status: jobCard.status },
      newValue: { approvalStatus, status, comment: body.comment },
      actorType: 'PUBLIC',
      requestId: req.headers.get('x-request-id') ?? undefined,
      ipAddress: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim(),
      userAgent: req.headers.get('user-agent') ?? undefined,
    });

    return NextResponse.json({
      success: true,
      data: { id: updated.id, approvalStatus: updated.approvalStatus, status: updated.status },
    });
  } catch (e) {
    return handleApiError(e);
  }
}
