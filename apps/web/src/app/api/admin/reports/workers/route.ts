import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { PERMISSIONS } from '@gearup/types';

/**
 * Determines if a line item is a "wash" item (attributed to the Washing Boy).
 * Rules:
 * - description (lowercased, trimmed) contains "wash"
 * - NOT a PART line type
 * - NOT mechanic work like "clutch wash", "throttle body clean" etc.
 */
function isWashLineItem(description: string, lineType: string): boolean {
  if (lineType === 'PART') return false;
  const desc = description.toLowerCase().trim();
  if (!desc.includes('wash')) return false;
  // Exclude mechanic-related items that happen to contain "wash"
  if (desc.includes('clutch')) return false;
  if (desc.includes('throttle')) return false;
  return true;
}

export async function GET(req: NextRequest) {
  try {
    requirePermission(PERMISSIONS.REPORTS_VIEW);
    const sp = req.nextUrl.searchParams;
    const from = sp.get('from');
    const to = sp.get('to');

    const fromDate = from ? new Date(from + 'T00:00:00+05:30') : undefined;
    const toDate = to ? new Date(to + 'T23:59:59+05:30') : undefined;

    // Load active workers
    const workers = await prisma.worker.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, fullName: true, designation: true },
      orderBy: { fullName: 'asc' },
    });

    // Identify wash worker(s) by designation
    const washWorkerIds = new Set(
      workers.filter(w => (w.designation || '').toLowerCase().replace(/\s+/g, ' ').trim().includes('washing boy')).map(w => w.id)
    );

    // Load PAID invoices with job cards in the date range
    const invoiceWhere: Record<string, unknown> = {
      paymentStatus: 'PAID',
      jobCardId: { not: null },
    };
    if (fromDate || toDate) {
      invoiceWhere.invoiceDate = { ...(fromDate ? { gte: fromDate } : {}), ...(toDate ? { lte: toDate } : {}) };
    }

    const invoices = await prisma.invoice.findMany({
      where: invoiceWhere,
      select: {
        id: true,
        jobCardId: true,
        grandTotal: true,
        invoiceDate: true,
        lineItems: { select: { description: true, lineType: true, lineTotal: true } },
      },
    });

    // Load worker assignments for relevant job cards
    const jobCardIds = invoices.map(i => i.jobCardId).filter(Boolean) as string[];
    const assignments = jobCardIds.length
      ? await prisma.workerAssignment.findMany({
          where: { jobCardId: { in: jobCardIds } },
          select: { workerId: true, jobCardId: true },
        })
      : [];

    // Build assignment map: jobCardId -> list of worker IDs
    const jobWorkers: Record<string, string[]> = {};
    for (const a of assignments) {
      if (!jobWorkers[a.jobCardId]) jobWorkers[a.jobCardId] = [];
      if (!jobWorkers[a.jobCardId].includes(a.workerId)) {
        jobWorkers[a.jobCardId].push(a.workerId);
      }
    }

    // Month key helper (IST)
    function getMonthKey(date: Date): string {
      const d = new Date(date.getTime() + 5.5 * 60 * 60 * 1000);
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    }

    // Build per-worker, per-month revenue
    type MonthData = { washRevenue: number; nonWashRevenue: number; jobs: Set<string> };
    const workerMonthly: Record<string, Record<string, MonthData>> = {};
    for (const w of workers) {
      workerMonthly[w.id] = {};
    }

    function ensureMonth(workerId: string, month: string): MonthData {
      if (!workerMonthly[workerId]) workerMonthly[workerId] = {};
      if (!workerMonthly[workerId][month]) {
        workerMonthly[workerId][month] = { washRevenue: 0, nonWashRevenue: 0, jobs: new Set() };
      }
      return workerMonthly[workerId][month];
    }

    // Track multi-worker invoices for the response
    const multiWorkerInvoices: Array<{ invoiceId: string; jobCardId: string; workers: string[]; grandTotal: number; month: string }> = [];

    // Track unattributed revenue
    let unattributedRevenue = 0;
    let unassignedInvoiceCount = 0;

    for (const inv of invoices) {
      if (!inv.jobCardId) continue;
      const month = getMonthKey(inv.invoiceDate);
      const assignedWorkers = jobWorkers[inv.jobCardId] || [];

      // If no workers assigned at all, entire invoice is unattributed
      if (assignedWorkers.length === 0) {
        unattributedRevenue += Number(inv.grandTotal);
        unassignedInvoiceCount++;
        continue;
      }

      // Calculate wash revenue for this invoice
      let washTotal = 0;
      for (const li of inv.lineItems) {
        if (isWashLineItem(li.description, li.lineType)) {
          washTotal += Number(li.lineTotal);
        }
      }

      const grandTotal = Number(inv.grandTotal);
      let nonWashTotal = grandTotal - washTotal;

      // Track multi-worker invoices
      const nonWashWorkers = assignedWorkers.filter(wid => !washWorkerIds.has(wid));
      if (nonWashWorkers.length > 1) {
        multiWorkerInvoices.push({
          invoiceId: inv.id,
          jobCardId: inv.jobCardId,
          workers: nonWashWorkers.map(wid => workers.find(w => w.id === wid)?.fullName || wid),
          grandTotal,
          month,
        });
      }

      // Attribute wash revenue to wash worker(s):
      // - If wash worker is assigned to the job, they get wash revenue from that job
      // - If the invoice ONLY has wash line items (no other work), attribute to wash worker
      //   even if not explicitly assigned
      const hasOnlyWashItems = inv.lineItems.every(
        (li: any) => isWashLineItem(li.description, li.lineType) || li.lineType === 'DISCOUNT_ADJUSTMENT'
      );
      const washWorkerAssigned = assignedWorkers.some(wid => washWorkerIds.has(wid));

      if (washTotal > 0 && (washWorkerAssigned || hasOnlyWashItems)) {
        const washWorkerList = Array.from(washWorkerIds);
        if (washWorkerList.length > 0) {
          const perWashWorker = washTotal / washWorkerList.length;
          for (const wid of washWorkerList) {
            const md = ensureMonth(wid, month);
            md.washRevenue += perWashWorker;
            md.jobs.add(inv.jobCardId);
          }
        }
      } else if (washTotal > 0) {
        // Wash items exist but wash worker not assigned & invoice has other work too
        // → treat wash revenue as part of the non-wash pool for assigned workers
        nonWashTotal += washTotal;
      }

      // Attribute non-wash revenue equally among non-wash workers ONLY
      // Wash workers never get non-wash revenue, even if they're the only one assigned.
      if (nonWashWorkers.length > 0 && nonWashTotal > 0) {
        const perWorker = nonWashTotal / nonWashWorkers.length;
        for (const wid of nonWashWorkers) {
          const md = ensureMonth(wid, month);
          md.nonWashRevenue += perWorker;
          md.jobs.add(inv.jobCardId);
        }
      } else if (nonWashWorkers.length === 0 && nonWashTotal > 0) {
        // Only wash worker assigned, non-wash revenue is unattributed
        unattributedRevenue += nonWashTotal;
      }
      // If no non-wash workers are assigned, that non-wash revenue is unattributed
      // (tracked in summary.unattributedRevenue)
    }

    // Collect all months present in data
    const allMonths = new Set<string>();
    for (const wid in workerMonthly) {
      for (const m in workerMonthly[wid]) allMonths.add(m);
    }
    const months = Array.from(allMonths).sort();

    // Build response
    const data = workers.map(w => {
      const isWashWorker = washWorkerIds.has(w.id);
      const monthly: Record<string, { revenue: number; jobs: number }> = {};
      let totalRevenue = 0;
      let totalJobs = 0;

      for (const month of months) {
        const md = workerMonthly[w.id]?.[month];
        if (md) {
          const revenue = isWashWorker ? md.washRevenue : md.nonWashRevenue;
          monthly[month] = { revenue: Math.round(revenue * 100) / 100, jobs: md.jobs.size };
          totalRevenue += revenue;
          totalJobs += md.jobs.size;
        } else {
          monthly[month] = { revenue: 0, jobs: 0 };
        }
      }

      return {
        id: w.id,
        fullName: w.fullName.trim(),
        designation: (w.designation || '').trim(),
        isWashWorker,
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        totalJobs,
        monthly,
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        workers: data,
        months,
        multiWorkerInvoices: multiWorkerInvoices.slice(0, 50), // cap for response size
        summary: {
          totalPaidInvoices: invoices.length,
          totalRevenue: Math.round(invoices.reduce((s, i) => s + Number(i.grandTotal), 0) * 100) / 100,
          multiWorkerCount: multiWorkerInvoices.length,
          unattributedRevenue: Math.round(unattributedRevenue * 100) / 100,
          unassignedInvoiceCount,
        },
      },
    });
  } catch (e) { return handleApiError(e); }
}
