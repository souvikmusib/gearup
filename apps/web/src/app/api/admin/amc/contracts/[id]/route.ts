import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { handleApiError, AppError } from '@/lib/errors';
import { logActivity } from '@/lib/activity-logger';
import { PERMISSIONS } from '@gearup/types';
import { z } from 'zod';

const HARD_DELETE_WINDOW_MS = 24 * 60 * 60 * 1000;

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    requirePermission(PERMISSIONS.AMC_CONTRACTS_VIEW);
    const contract = await prisma.amcContract.findUniqueOrThrow({
      where: { id: params.id },
      include: {
        customer: true,
        vehicle: true,
        plan: true,
        usages: { orderBy: { serviceDate: 'desc' }, include: { jobCard: { select: { id: true, jobCardNumber: true, status: true, issueSummary: true } } } },
      },
    });

    // On-read EXPIRED derivation: if ACTIVE but past endDate, persist the
    // transition so listings stay consistent without a separate cron job.
    if (contract.status === 'ACTIVE' && contract.endDate.getTime() < Date.now()) {
      await prisma.amcContract.update({ where: { id: contract.id }, data: { status: 'EXPIRED' } });
      contract.status = 'EXPIRED';
    }

    return NextResponse.json({ success: true, data: contract });
  } catch (e) { return handleApiError(e); }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = requirePermission(PERMISSIONS.AMC_CONTRACTS_MANAGE);
    const body = z.object({
      status: z.enum(['ACTIVE', 'EXPIRED', 'CANCELLED']).optional(),
      notes: z.string().optional(),
    }).parse(await req.json());

    const updated = await prisma.$transaction(async (tx: any) => {
      const existing = await tx.amcContract.findUniqueOrThrow({ where: { id: params.id } });

      // Transition guards: CANCELLED and EXPIRED are terminal; ACTIVE cannot
      // be set on a contract whose endDate has already passed.
      if (body.status && body.status !== existing.status) {
        if (existing.status === 'CANCELLED') {
          throw new AppError(409, 'Cancelled contracts cannot transition to another status', 'INVALID_TRANSITION');
        }
        if (existing.status === 'EXPIRED' && body.status === 'ACTIVE') {
          throw new AppError(409, 'Expired contracts cannot be reactivated', 'INVALID_TRANSITION');
        }
        if (body.status === 'ACTIVE' && existing.endDate.getTime() < Date.now()) {
          throw new AppError(409, 'Cannot mark a past-end contract as ACTIVE', 'INVALID_TRANSITION');
        }
      }

      // If the stored status is still ACTIVE but endDate has passed, force EXPIRED
      // unless the caller is explicitly setting CANCELLED.
      const data: Record<string, unknown> = { ...body };
      if (
        existing.status === 'ACTIVE' &&
        existing.endDate.getTime() < Date.now() &&
        body.status !== 'CANCELLED'
      ) {
        data.status = 'EXPIRED';
      }

      const contract = await tx.amcContract.update({ where: { id: params.id }, data });

      await logActivity({
        actorType: 'ADMIN',
        actorId: user.sub,
        action: 'UPDATE',
        entityType: 'AmcContract',
        entityId: contract.id,
        previousValue: { status: existing.status, notes: existing.notes },
        newValue: { status: contract.status, notes: contract.notes },
        tx,
      });

      return contract;
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (e) { return handleApiError(e); }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = requirePermission(PERMISSIONS.AMC_CONTRACTS_MANAGE);

    const result = await prisma.$transaction(async (tx: any) => {
      const existing = await tx.amcContract.findUniqueOrThrow({
        where: { id: params.id },
        include: { usages: true },
      });

      const ageMs = Date.now() - existing.createdAt.getTime();
      const canHardDelete = existing.usages.length === 0 && ageMs <= HARD_DELETE_WINDOW_MS;

      if (canHardDelete) {
        // Safe to physically remove: no honored services, created very recently.
        await tx.amcContract.delete({ where: { id: params.id } });
        await logActivity({
          actorType: 'ADMIN',
        actorId: user.sub,
          action: 'DELETE',
          entityType: 'AmcContract',
          entityId: existing.id,
          previousValue: existing,
          newValue: { mode: 'hard' },
          tx,
        });
        return { mode: 'hard' as const };
      }

      // Otherwise soft-delete by transitioning to CANCELLED so service history
      // is preserved for finance / customer-dispute reconstruction.
      if (existing.status === 'CANCELLED') {
        throw new AppError(409, 'Contract is already cancelled; usage history is preserved', 'ALREADY_CANCELLED');
      }
      const cancelled = await tx.amcContract.update({
        where: { id: params.id },
        data: { status: 'CANCELLED' },
      });
      await logActivity({
        actorType: 'ADMIN',
        actorId: user.sub,
        action: 'CANCEL',
        entityType: 'AmcContract',
        entityId: cancelled.id,
        previousValue: existing,
        newValue: { mode: 'soft', usageCount: existing.usages.length },
        tx,
      });
      return { mode: 'soft' as const, data: cancelled };
    });

    return NextResponse.json({ success: true, ...result });
  } catch (e) { return handleApiError(e); }
}

// POST /api/admin/amc/contracts/[id] — use a service
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    requirePermission(PERMISSIONS.AMC_CONTRACTS_MANAGE);
    const body = z.object({
      jobCardId: z.string().min(1),
      serviceDate: z.string().datetime().optional(),
      notes: z.string().optional(),
    }).parse(await req.json());

    const result = await prisma.$transaction(async (tx: any) => {
      const now = new Date();

      // Conditional update with WHERE-guard — race-safe decrement.
      const updateRes = await tx.amcContract.updateMany({
        where: {
          id: params.id,
          status: 'ACTIVE',
          servicesRemaining: { gt: 0 },
          endDate: { gte: now },
        },
        data: {
          servicesUsed: { increment: 1 },
          servicesRemaining: { decrement: 1 },
        },
      });
      if (updateRes.count !== 1) {
        throw new AppError(409, 'AMC contract is not active, has no remaining services, or has expired', 'CONFLICT');
      }

      // Re-read contract for accurate serviceNumber and ownership comparison.
      const contract = await tx.amcContract.findUniqueOrThrow({ where: { id: params.id } });

      // Verify the job card belongs to the contract's customer + vehicle.
      const jobCard = await tx.jobCard.findUniqueOrThrow({ where: { id: body.jobCardId } });
      if (jobCard.customerId !== contract.customerId || jobCard.vehicleId !== contract.vehicleId) {
        throw new AppError(400, 'Job card does not belong to this AMC contract\'s customer/vehicle', 'VALIDATION_ERROR');
      }

      const usage = await tx.amcServiceUsage.create({
        data: {
          amcContractId: params.id,
          jobCardId: body.jobCardId,
          serviceNumber: contract.servicesUsed, // already incremented above
          serviceDate: body.serviceDate ? new Date(body.serviceDate) : new Date(),
          notes: body.notes,
        },
      });

      return usage;
    });

    return NextResponse.json({ success: true, data: result }, { status: 201 });
  } catch (e) { return handleApiError(e); }
}
