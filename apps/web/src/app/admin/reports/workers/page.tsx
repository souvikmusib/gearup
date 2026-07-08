'use client';
import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api/client';
import { PageHeader } from '@gearup/ui';

interface MonthData { revenue: number; jobs: number }
interface WorkerRow {
  id: string;
  fullName: string;
  designation: string;
  isWashWorker: boolean;
  totalRevenue: number;
  totalJobs: number;
  monthly: Record<string, MonthData>;
}
interface MultiWorkerInvoice {
  invoiceId: string;
  jobCardId: string;
  workers: string[];
  grandTotal: number;
  month: string;
}
interface ReportData {
  data: WorkerRow[];
  months: string[];
  multiWorkerInvoices: MultiWorkerInvoice[];
  summary: { totalPaidInvoices: number; totalRevenue: number; multiWorkerCount: number; unattributedRevenue: number; unassignedInvoiceCount: number };
}

function formatMonth(m: string): string {
  const [year, month] = m.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[parseInt(month) - 1]} ${year.slice(2)}`;
}

export default function WorkersReportPage() {
  const [report, setReport] = useState<ReportData | null>(null);
  const [from, setFrom] = useState(() => { const d = new Date(); d.setMonth(d.getMonth() - 2); d.setDate(1); return d.toISOString().slice(0, 10); });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [showMultiWorker, setShowMultiWorker] = useState(false);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    const res = await api.get<any>(`/admin/reports/workers?${params}`);
    if (res.success && res.data) {
      setReport({
        data: res.data.workers,
        months: res.data.months,
        multiWorkerInvoices: res.data.multiWorkerInvoices,
        summary: res.data.summary,
      });
    }
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  const inputCls = 'rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-sm bg-white dark:bg-gray-800';

  if (!report) return <div><PageHeader title="Workers Report" /><p className="text-gray-500 text-sm">Loading...</p></div>;

  const { data, months, multiWorkerInvoices, summary } = report;
  const sorted = [...data].sort((a, b) => b.totalRevenue - a.totalRevenue);

  return (
    <div>
      <PageHeader title="Workers Report" />

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <input type="date" className={inputCls} value={from} onChange={e => setFrom(e.target.value)} />
        <span className="text-gray-400">to</span>
        <input type="date" className={inputCls} value={to} onChange={e => setTo(e.target.value)} />
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Total Revenue (Paid)</div>
          <div className="text-2xl font-bold mt-1">₹{summary.totalRevenue.toLocaleString('en-IN')}</div>
          <div className="text-xs text-gray-400 mt-1">{summary.totalPaidInvoices} invoices</div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Attributed</div>
          <div className="text-2xl font-bold mt-1 text-green-600">₹{Math.round(summary.totalRevenue - summary.unattributedRevenue).toLocaleString('en-IN')}</div>
          <div className="text-xs text-gray-400 mt-1">{Math.round((1 - summary.unattributedRevenue / summary.totalRevenue) * 100)}% of total</div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Unattributed</div>
          <div className="text-2xl font-bold mt-1 text-amber-600">₹{summary.unattributedRevenue.toLocaleString('en-IN')}</div>
          <div className="text-xs text-gray-400 mt-1">{summary.unassignedInvoiceCount} invoices with no worker + wash-only jobs</div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Multi-Worker Jobs</div>
          <div className="text-2xl font-bold mt-1">{summary.multiWorkerCount}</div>
          <button onClick={() => setShowMultiWorker(!showMultiWorker)} className="text-xs text-blue-600 hover:underline mt-1">
            {showMultiWorker ? 'Hide details' : 'View details'}
          </button>
        </div>
      </div>

      {/* Notes */}
      <p className="text-xs text-gray-500 mb-3">
        * Wash worker revenue = sum of wash line items. Other workers = (invoice total − wash items) ÷ assigned workers. Only PAID invoices counted.
      </p>

      {/* Main table */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
              <th className="text-left px-4 py-3 font-semibold text-gray-700 dark:text-gray-300">Worker</th>
              <th className="text-left px-3 py-3 font-semibold text-gray-700 dark:text-gray-300">Role</th>
              <th className="text-center px-3 py-3 font-semibold text-gray-700 dark:text-gray-300">Jobs</th>
              {months.map(m => (
                <th key={m} className="text-right px-3 py-3 font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap">
                  {formatMonth(m)}
                </th>
              ))}
              <th className="text-right px-4 py-3 font-bold text-gray-900 dark:text-gray-100">Total</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((w, i) => (
              <tr key={w.id} className={`border-b border-gray-100 dark:border-gray-800 ${i % 2 === 0 ? 'bg-white dark:bg-gray-900' : 'bg-gray-50/50 dark:bg-gray-800/50'}`}>
                <td className="px-4 py-2.5 font-medium">
                  {w.fullName}
                  {w.isWashWorker && <span className="ml-2 text-[10px] bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 px-1.5 py-0.5 rounded-full font-semibold">WASH</span>}
                </td>
                <td className="px-3 py-2.5 text-gray-500 text-xs">{w.designation}</td>
                <td className="px-3 py-2.5 text-center text-gray-600">{w.totalJobs}</td>
                {months.map(m => {
                  const md = w.monthly[m];
                  return (
                    <td key={m} className="px-3 py-2.5 text-right font-mono text-xs">
                      {md && md.revenue > 0 ? (
                        <div>
                          <span className="font-semibold text-gray-900 dark:text-gray-100">₹{md.revenue.toLocaleString('en-IN')}</span>
                          <br />
                          <span className="text-gray-400">{md.jobs}j</span>
                        </div>
                      ) : (
                        <span className="text-gray-300 dark:text-gray-600">—</span>
                      )}
                    </td>
                  );
                })}
                <td className="px-4 py-2.5 text-right font-bold font-mono">
                  ₹{w.totalRevenue.toLocaleString('en-IN')}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-gray-100 dark:bg-gray-800 border-t-2 border-gray-300 dark:border-gray-600">
              <td className="px-4 py-3 font-bold" colSpan={3}>Total</td>
              {months.map(m => {
                const monthTotal = sorted.reduce((s, w) => s + (w.monthly[m]?.revenue || 0), 0);
                return (
                  <td key={m} className="px-3 py-3 text-right font-bold font-mono text-sm">
                    ₹{Math.round(monthTotal).toLocaleString('en-IN')}
                  </td>
                );
              })}
              <td className="px-4 py-3 text-right font-bold font-mono text-sm">
                ₹{Math.round(sorted.reduce((s, w) => s + w.totalRevenue, 0)).toLocaleString('en-IN')}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Multi-worker invoices detail */}
      {showMultiWorker && multiWorkerInvoices.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Invoices with Multiple Workers (revenue split equally)</h3>
          <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left px-4 py-2 font-semibold">Month</th>
                  <th className="text-left px-3 py-2 font-semibold">Workers</th>
                  <th className="text-right px-4 py-2 font-semibold">Invoice Total</th>
                  <th className="text-right px-4 py-2 font-semibold">Per Worker</th>
                </tr>
              </thead>
              <tbody>
                {multiWorkerInvoices.map((inv, i) => (
                  <tr key={inv.invoiceId} className={i % 2 === 0 ? 'bg-white dark:bg-gray-900' : 'bg-gray-50/50 dark:bg-gray-800/50'}>
                    <td className="px-4 py-2 text-gray-500">{formatMonth(inv.month)}</td>
                    <td className="px-3 py-2">{inv.workers.join(', ')}</td>
                    <td className="px-4 py-2 text-right font-mono">₹{inv.grandTotal.toLocaleString('en-IN')}</td>
                    <td className="px-4 py-2 text-right font-mono text-gray-500">₹{Math.round(inv.grandTotal / inv.workers.length).toLocaleString('en-IN')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
