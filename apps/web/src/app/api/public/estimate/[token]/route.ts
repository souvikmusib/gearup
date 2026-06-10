import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { handleApiError, NotFoundError, ValidationError } from '@/lib/errors';
import { logActivity } from '@/lib/activity-logger';
import { z } from 'zod';
import {
  MIN_TOKEN_LENGTH,
  computeEstimateRevision,
  defaultEstimateTokenExpiry,
  generateEstimateToken,
} from '@/lib/estimate-token';

// Legacy URLs used the raw JobCard id (a cuid) as the path segment. New tokens
// are 32+ random bytes base64url-encoded. A cuid is ~25 chars and starts with
// 'c' + lowercase alphanumerics, never contains '-' or '_', so we can detect
// legacy links cheaply and lazy-backfill a real token on first read. This grace
// path only triggers when the JobCard has NO estimateToken yet (i.e. it was
// created before the token columns existed) — once a token exists, only the
// secret token can unlock the estimate.
const CUID_RE = /^c[a-z0-9]{20,30}$/;

const actionSchema = z.object({
  action: z.enum(['approved', 'rejected']),
  comment: z.string().trim().max(1000).optional(),
  // P1 fix: client must echo the revision it saw so admins can't move prices
  // between view and approve.
  estimateRevision: z.string().min(8).max(128),
});

function publicEstimate(
  jobCard: {
    id: string;
    jobCardNumber: string;
    issueSummary: string;
    estimateNotes: string | null;
    customerVisibleNotes: string | null;
    approvalStatus: string;
    status: string;
    estimatedPartsCost: unknown;
    estimatedLaborCost: unknown;
    estimatedOtherCost?: unknown;
    estimatedTotal: unknown;
    customer: { fullName: string };
    vehicle: { registrationNumber: string; brand: string; model: string };
  },
  estimateRevision: string,
) {
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
    estimateRevision,
  };
}

function validateTokenShape(token: string | undefined): asserts token is string {
  if (!token) {
    throw new NotFoundError('Estimate');
  }
  // Either a real token (>= MIN_TOKEN_LENGTH) or a legacy cuid id.
  if (token.length < MIN_TOKEN_LENGTH && !CUID_RE.test(token)) {
    throw new NotFoundError('Estimate');
  }
}

const jobCardInclude = {
  customer: { select: { fullName: true } },
  vehicle: { select: { registrationNumber: true, brand: true, model: true } },
} as const;

async function findJobCardByToken(token: string) {
  // Primary path: lookup by the unique estimateToken column.
  const byToken = await prisma.jobCard.findUnique({
    where: { estimateToken: token },
    include: jobCardInclude,
  });
  if (byToken) return byToken;

  // Legacy grace path: the token segment is actually a JobCard id from before
  // the estimateToken column existed. We allow this ONLY if the JobCard has no
  // estimateToken yet, then mint one so subsequent requests use the real secret.
  if (!CUID_RE.test(token)) return null;
  const byLegacyId = await prisma.jobCard.findUnique({
    where: { id: token },
    include: jobCardInclude,
  });
  if (!byLegacyId) return null;
  if (byLegacyId.estimateToken) {
    // This JobCard has a real token; legacy id lookup is no longer permitted.
    return null;
  }
  const freshToken = generateEstimateToken();
  const expiresAt = defaultEstimateTokenExpiry();
  // Race-safe lazy backfill: only update when estimateToken is still null.
  // Use updateMany so we can scope by a non-unique guard (estimateToken IS NULL).
  const updateResult = await prisma.jobCard.updateMany({
    where: { id: byLegacyId.id, estimateToken: null },
    data: { estimateToken: freshToken, estimateTokenExpiresAt: expiresAt },
  });
  if (updateResult.count === 0) {
    // Lost the race; some other request backfilled. Re-read the now-set token.
    return prisma.jobCard.findUnique({
      where: { id: byLegacyId.id },
      include: jobCardInclude,
    });
  }
  return prisma.jobCard.findUnique({
    where: { id: byLegacyId.id },
    include: jobCardInclude,
  });
}

function isExpired(jobCard: { estimateTokenExpiresAt?: Date | null } | null): boolean {
  if (!jobCard) return false;
  const exp = jobCard.estimateTokenExpiresAt ?? null;
  return !!exp && exp.getTime() < Date.now();
}

export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  try {
    validateTokenShape(params.token);

    const jobCard = await findJobCardByToken(params.token);
    if (!jobCard || isExpired(jobCard)) {
      throw new NotFoundError('Estimate');
    }

    const revision = computeEstimateRevision(jobCard);
    return NextResponse.json({ success: true, data: publicEstimate(jobCard, revision) });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  try {
    validateTokenShape(params.token);
    const body = actionSchema.parse(await req.json());

    const jobCard = await findJobCardByToken(params.token);
    if (!jobCard || isExpired(jobCard)) {
      throw new NotFoundError('Estimate');
    }
    if (jobCard.approvalStatus === 'APPROVED' || jobCard.approvalStatus === 'REJECTED') {
      throw new ValidationError(`Estimate already ${jobCard.approvalStatus.toLowerCase()}.`);
    }

    // P1: pin prices the customer actually saw.
    const currentRevision = computeEstimateRevision(jobCard);
    if (currentRevision !== body.estimateRevision) {
      throw new ValidationError(
        'Estimate was updated by the workshop. Please reload to review the latest prices before responding.',
      );
    }

    const approvalStatus = body.action === 'approved' ? 'APPROVED' : 'REJECTED';
    const status = body.action === 'approved' ? 'APPROVED' : 'REJECTED';
    const customerVisibleNotes = body.comment
      ? [jobCard.customerVisibleNotes, `Customer ${body.action} estimate: ${body.comment}`].filter(Boolean).join('\n\n')
      : jobCard.customerVisibleNotes;

    const jobCardId = jobCard.id;
    // After lazy-backfill, jobCard.estimateToken is always populated for the
    // race-safe scope below (we just minted one if it was missing).
    const lookupToken = jobCard.estimateToken ?? params.token;

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.jobCard.updateMany({
        where: {
          id: jobCardId,
          approvalStatus: 'PENDING',
          estimateToken: lookupToken,
          // TODO: once we persist estimateRevision on every estimate write,
          // also pin `estimateRevision: body.estimateRevision` here so a
          // concurrent admin price edit between read and write fails at the DB.
        },
        data: { approvalStatus, status, customerVisibleNotes },
      });
      if (result.count === 0) {
        throw new ValidationError('Estimate response was already submitted.');
      }
      return tx.jobCard.findUniqueOrThrow({ where: { id: jobCardId } });
    });

    logActivity({
      entityType: 'JobCard',
      entityId: updated.id,
      action: body.action === 'approved' ? 'estimate.approved' : 'estimate.rejected',
      previousValue: {
        approvalStatus: jobCard.approvalStatus,
        status: jobCard.status,
        estimateRevision: currentRevision,
        estimatedPartsCost: Number(jobCard.estimatedPartsCost),
        estimatedLaborCost: Number(jobCard.estimatedLaborCost),
        estimatedTotal: Number(jobCard.estimatedTotal),
      },
      newValue: { approvalStatus, status, comment: body.comment, estimateRevision: currentRevision },
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
