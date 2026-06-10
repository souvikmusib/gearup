import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { AppError, handleApiError } from '@/lib/errors';
import { logActivity } from '@/lib/activity-logger';
import { PERMISSIONS } from '@gearup/types';

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = requirePermission(PERMISSIONS.INVOICES_FINALIZE);
    const invoice = await prisma.$transaction(async (tx) => {
      const result = await tx.invoice.updateMany({
        where: { id: params.id, invoiceStatus: 'DRAFT' },
        data: { invoiceStatus: 'FINALIZED', finalizedAt: new Date() },
      });
      if (result.count !== 1) {
        throw new AppError(409, 'Only DRAFT invoices can be finalized', 'CONFLICT');
      }
      const finalized = await tx.invoice.findUniqueOrThrow({ where: { id: params.id } });

      // Apply deferred AMC contract-usage decrements for AMC line items that
      // reference an existing AmcContract. Plan-purchase lines (referenceItemId
      // points to an AmcPlan) are handled on full payment in the payments route.
      const amcLines = await tx.invoiceLineItem.findMany({
        where: { invoiceId: params.id, lineType: 'AMC', referenceItemId: { not: null } },
      });
      for (const line of amcLines) {
        const contract = await tx.amcContract.findUnique({ where: { id: line.referenceItemId! } });
        if (!contract) continue; // plan-purchase line — skip
        if (contract.status !== 'ACTIVE') throw new AppError(409, 'AMC contract is not active', 'CONFLICT');
        if (!finalized.jobCardId) throw new AppError(409, 'AMC service usage requires a job card', 'CONFLICT');
        const dec = await tx.amcContract.updateMany({
          where: { id: contract.id, servicesRemaining: { gt: 0 } },
          data: { servicesUsed: { increment: 1 }, servicesRemaining: { decrement: 1 } },
        });
        if (dec.count === 0) {
          throw new AppError(409, 'No services remaining on AMC contract', 'CONFLICT');
        }
        const refreshed = await tx.amcContract.findUniqueOrThrow({ where: { id: contract.id } });
        await tx.amcServiceUsage.create({
          data: {
            amcContractId: contract.id,
            jobCardId: finalized.jobCardId,
            serviceNumber: refreshed.servicesUsed,
            serviceDate: new Date(),
          },
        });
      }

      return finalized;
    });
    logActivity({ entityType: 'Invoice', entityId: invoice.id, action: 'invoice.finalized', actorType: 'ADMIN', actorId: user.sub });
    return NextResponse.json({ success: true, data: invoice });
  } catch (e) { return handleApiError(e); }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = requirePermission(PERMISSIONS.INVOICES_FINALIZE);
    const invoice = await prisma.$transaction(async (tx) => {
      const result = await tx.invoice.updateMany({
        where: { id: params.id, invoiceStatus: 'FINALIZED', paymentStatus: 'UNPAID' },
        data: { invoiceStatus: 'DRAFT', finalizedAt: null },
      });
      if (result.count !== 1) {
        throw new AppError(
          409,
          'Cannot revert to draft — invoice is not FINALIZED or has payments recorded',
          'CONFLICT',
        );
      }
      const reverted = await tx.invoice.findUniqueOrThrow({ where: { id: params.id } });

      // Roll back AMC contract-usage decrements applied at finalize.
      const amcLines = await tx.invoiceLineItem.findMany({
        where: { invoiceId: params.id, lineType: 'AMC', referenceItemId: { not: null } },
      });
      for (const line of amcLines) {
        const contract = await tx.amcContract.findUnique({ where: { id: line.referenceItemId! } });
        if (!contract || !reverted.jobCardId) continue;
        const usage = await tx.amcServiceUsage.findFirst({
          where: { amcContractId: contract.id, jobCardId: reverted.jobCardId },
          orderBy: { serviceNumber: 'desc' },
        });
        if (usage) {
          await tx.amcServiceUsage.delete({ where: { id: usage.id } });
          await tx.amcContract.update({
            where: { id: contract.id },
            data: { servicesUsed: { decrement: 1 }, servicesRemaining: { increment: 1 } },
          });
        }
      }

      return reverted;
    });
    logActivity({ entityType: 'Invoice', entityId: invoice.id, action: 'invoice.reverted-to-draft', actorType: 'ADMIN', actorId: user.sub });
    return NextResponse.json({ success: true, data: invoice });
  } catch (e) { return handleApiError(e); }
}
