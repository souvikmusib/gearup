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

    // Get finalized invoices with line items
    const invoiceWhere: Record<string, unknown> = { invoiceStatus: 'FINALIZED', jobCardId: { not: null } };
    if (fromDate || toDate) {
      invoiceWhere.invoiceDate = { ...(fromDate ? { gte: fromDate } : {}), ...(toDate ? { lte: toDate } : {}) };
    }
    const invoices = await prisma.invoice.findMany({
      where: invoiceWhere,
      select: {
        jobCardId: true,
        grandTotal: true,
        lineItems: { select: { description: true, lineType: true, lineTotal: true } },
      },
    });

    // Build worker name lookup (normalized for matching)
    const workerByName: Record<string, string> = {};
    for (const w of workers) {
      workerByName[w.fullName.toLowerCase().replace(/\s+/g, ' ').trim()] = w.id;
    }

    // Attribute revenue per worker
    const workerRevenue: Record<string, { labor: number; jobIds: Set<string> }> = {};
    for (const w of workers) workerRevenue[w.id] = { labor: 0, jobIds: new Set() };

    // Track unattributed job card revenue for equal-split fallback
    const jobUnattributed: Record<string, number> = {};
    const jobWorkerCount: Record<string, number> = {};

    // Get assignments for worker count per job
    const jobCardIds = invoices.map(i => i.jobCardId).filter(Boolean) as string[];
    const assignments = jobCardIds.length ? await prisma.workerAssignment.findMany({
      where: { jobCardId: { in: jobCardIds } },
      select: { workerId: true, jobCardId: true },
    }) : [];

    for (const a of assignments) {
      jobWorkerCount[a.jobCardId] = (jobWorkerCount[a.jobCardId] || 0) + 1;
      if (workerRevenue[a.workerId]) workerRevenue[a.workerId].jobIds.add(a.jobCardId);
    }

    for (const inv of invoices) {
      if (!inv.jobCardId) continue;
      let attributed = 0;

      // Try to attribute LABOR lines by matching "Labor — WorkerName"
      for (const li of inv.lineItems) {
        if (li.lineType === 'LABOR' && li.description.includes('—')) {
          const namepart = li.description.split('—')[1]?.toLowerCase().replace(/\s+/g, ' ').trim();
          if (namepart && workerByName[namepart]) {
            const wId = workerByName[namepart];
            workerRevenue[wId].labor += Number(li.lineTotal);
            workerRevenue[wId].jobIds.add(inv.jobCardId);
            attributed += Number(li.lineTotal);
          }
        }
      }

      // Remaining revenue (parts, service charge, etc.) split equally among assigned workers
      const remaining = Number(inv.grandTotal) - attributed;
      if (remaining > 0) jobUnattributed[inv.jobCardId] = (jobUnattributed[inv.jobCardId] || 0) + remaining;
    }

    // Equal-split the unattributed portion
    const data = workers.map(w => {
      const wr = workerRevenue[w.id];
      let equalSplitRevenue = 0;
      for (const jobId of wr.jobIds) {
        const unattr = jobUnattributed[jobId] || 0;
        const count = jobWorkerCount[jobId] || 1;
        equalSplitRevenue += unattr / count;
      }
      const total = wr.labor + equalSplitRevenue;
      return {
        id: w.id,
        fullName: w.fullName,
        designation: w.designation,
        assignmentsInPeriod: wr.jobIds.size,
        laborDirect: Math.round(wr.labor * 100) / 100,
        revenueAttributed: Math.round(total * 100) / 100,
      };
    });

    return NextResponse.json({ success: true, data });
  } catch (e) { return handleApiError(e); }
}
