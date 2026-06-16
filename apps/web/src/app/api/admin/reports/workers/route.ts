import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { PERMISSIONS } from '@gearup/types';

export async function GET(req: NextRequest) {
  try {
    requirePermission(PERMISSIONS.REPORTS_VIEW);
    const sp = req.nextUrl.searchParams;
    const from = sp.get('from');
    const to = sp.get('to');

    const fromDate = from ? new Date(from + 'T00:00:00+05:30') : undefined;
    const toDate = to ? new Date(to + 'T23:59:59+05:30') : undefined;

    const workers = await prisma.worker.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, fullName: true, designation: true },
      orderBy: { fullName: 'asc' },
    });

    // Get finalized invoices (with date filter) that have a job card
    const invoiceWhere: Record<string, unknown> = { invoiceStatus: 'FINALIZED', jobCardId: { not: null } };
    if (fromDate || toDate) {
      invoiceWhere.invoiceDate = { ...(fromDate ? { gte: fromDate } : {}), ...(toDate ? { lte: toDate } : {}) };
    }
    const invoices = await prisma.invoice.findMany({
      where: invoiceWhere,
      select: { jobCardId: true, grandTotal: true },
    });

    // Map jobCardId -> revenue
    const jobRevenue: Record<string, number> = {};
    const jobCardIds: string[] = [];
    for (const inv of invoices) {
      if (inv.jobCardId) {
        jobRevenue[inv.jobCardId] = (jobRevenue[inv.jobCardId] || 0) + Number(inv.grandTotal);
        jobCardIds.push(inv.jobCardId);
      }
    }

    // Get worker assignments for these job cards
    const assignments = jobCardIds.length ? await prisma.workerAssignment.findMany({
      where: { jobCardId: { in: jobCardIds } },
      select: { workerId: true, jobCardId: true },
    }) : [];

    // Count workers per job card + track which jobs each worker had
    const jobWorkerCount: Record<string, number> = {};
    const workerJobs: Record<string, Set<string>> = {};
    for (const a of assignments) {
      jobWorkerCount[a.jobCardId] = (jobWorkerCount[a.jobCardId] || 0) + 1;
      if (!workerJobs[a.workerId]) workerJobs[a.workerId] = new Set();
      workerJobs[a.workerId].add(a.jobCardId);
    }

    // Equal-split revenue per worker
    const data = workers.map(w => {
      const jobs = workerJobs[w.id] || new Set();
      let revenue = 0;
      for (const jobId of jobs) {
        const total = jobRevenue[jobId] || 0;
        const count = jobWorkerCount[jobId] || 1;
        revenue += total / count;
      }
      return {
        id: w.id,
        fullName: w.fullName,
        designation: w.designation,
        assignmentsInPeriod: jobs.size,
        revenueAttributed: Math.round(revenue * 100) / 100,
      };
    });

    return NextResponse.json({ success: true, data });
  } catch (e) { return handleApiError(e); }
}
