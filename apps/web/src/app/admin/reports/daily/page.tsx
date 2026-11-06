'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api/client';
import { PageHeader, StatCard } from '@gearup/ui';
import { toTitleCase } from '@/lib/title-case';
import { formatIST } from '@/lib/time';

type Daily = any;

const rupee = (n: number) => `₹${Math.round(Number(n || 0)).toLocaleString('en-IN')}`;
const numFmt = (n: number) => Number(n || 0).toLocaleString('en-IN');
const humanStatus = (s: string) => toTitleCase(s.replace(/_/g, ' ').toLowerCase());

function todayIST() {
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  return ist.toISOString().slice(0, 10);
}

function Section({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800 print:break-inside-avoid ${className}`}>
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{title}</h3>
      {children}
    </section>
  );
}

function KV({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="flex items-baseline justify-between border-b border-gray-100 py-1.5 text-sm last:border-0 dark:border-gray-700">
      <span className="text-gray-600 dark:text-gray-400">{label}</span>
      <span className="font-medium text-gray-900 dark:text-gray-100">
        {value}
        {sub && <span className="ml-1 text-xs text-gray-400">{sub}</span>}
      </span>
    </div>
  );
}

export default function DailyDigestPage() {
  const [date, setDate] = useState(todayIST());
  const [data, setData] = useState<Daily | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const endpoint = `/admin/reports/daily?date=${date}`;
    const { cached, promise } = api.getSWR<any>(endpoint);
    if (cached?.success) {
      setData(cached.data);
      setLoading(false);
    }
    promise.then((r) => {
      if (r.success) setData(r.data);
      setLoading(false);
    });
  }, [date]);

  const displayDate = formatIST(new Date(`${date}T00:00:00+05:30`), {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <PageHeader title="Daily Digest" description={displayDate} />
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={date}
            max={todayIST()}
            onChange={(e) => setDate(e.target.value)}
            className="rounded border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          />
          <button
            onClick={() => setDate(todayIST())}
            className="rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
          >
            Today
          </button>
          <button
            onClick={() => window.print()}
            className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            Download PDF
          </button>
        </div>
      </div>

      {/* Print header — only visible on paper */}
      <div className="mb-4 hidden print:block">
        <h1 className="text-xl font-bold">GearUp — Daily Digest</h1>
        <p className="text-sm text-gray-600">{displayDate}</p>
      </div>

      {loading && !data && <p className="py-8 text-center text-sm text-gray-500">Loading digest…</p>}

      {data && (
        <div className="space-y-4">
          {/* Headline KPIs */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="Collected" value={rupee(data.revenue.collected.total)} sub={`${data.revenue.collected.byMode.reduce((s: number, m: any) => s + m.count, 0)} payments`} />
            <StatCard label="Invoiced" value={rupee(data.revenue.invoiced.total)} sub={`${data.revenue.invoiced.count} invoices`} />
            <StatCard label="Expenses" value={rupee(data.expenses.total)} sub={`${data.expenses.count} entries`} />
            <StatCard label="Net cash today" value={rupee(data.pnl.netCash)} sub={`accrual: ${rupee(data.pnl.netAccrual)}`} />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {/* Revenue */}
            <Section title="Revenue breakdown">
              <div className="mb-3">
                <div className="mb-1 text-xs font-medium uppercase text-gray-400">Collected by mode</div>
                {data.revenue.collected.byMode.length === 0 ? (
                  <p className="text-sm text-gray-500">No payments today</p>
                ) : (
                  data.revenue.collected.byMode.map((m: any) => (
                    <KV key={m.mode} label={humanStatus(m.mode)} value={rupee(m.amount)} sub={`${m.count}×`} />
                  ))
                )}
              </div>
              <div>
                <div className="mb-1 text-xs font-medium uppercase text-gray-400">Invoiced by line type</div>
                {data.revenue.byLineType.length === 0 ? (
                  <p className="text-sm text-gray-500">No invoices finalized today</p>
                ) : (
                  data.revenue.byLineType.map((r: any) => (
                    <KV key={r.lineType} label={humanStatus(r.lineType)} value={rupee(r.total)} />
                  ))
                )}
              </div>
            </Section>

            {/* Job cards */}
            <Section title="Job cards">
              <KV label="Opened today" value={numFmt(data.jobCards.opened)} />
              <KV label="Closed today" value={numFmt(data.jobCards.closed)} />
              <KV
                label="Avg cycle time"
                value={data.jobCards.avgCycleHours != null ? `${data.jobCards.avgCycleHours.toFixed(1)} h` : '—'}
                sub={data.jobCards.closedCount ? `over ${data.jobCards.closedCount}` : ''}
              />
              <div className="mt-3">
                <div className="mb-1 text-xs font-medium uppercase text-gray-400">Currently active</div>
                {data.jobCards.statusFunnel.length === 0 ? (
                  <p className="text-sm text-gray-500">No active job cards</p>
                ) : (
                  data.jobCards.statusFunnel.map((r: any) => (
                    <KV key={r.status} label={humanStatus(r.status)} value={numFmt(r.count)} />
                  ))
                )}
              </div>
            </Section>

            {/* Appointments */}
            <Section title="Appointments">
              <KV
                label="Slot utilisation"
                value={data.appointments.capacity > 0 ? `${data.appointments.booked} / ${data.appointments.capacity}` : `${data.appointments.booked}`}
                sub={data.appointments.capacity > 0 ? `${Math.round((data.appointments.booked / data.appointments.capacity) * 100)}%` : ''}
              />
              {data.appointments.byStatus.length === 0 ? (
                <p className="text-sm text-gray-500">No appointments</p>
              ) : (
                data.appointments.byStatus.map((r: any) => (
                  <KV key={r.status} label={humanStatus(r.status)} value={numFmt(r.count)} />
                ))
              )}
            </Section>

            {/* Customers & vehicles */}
            <Section title="Customers & vehicles">
              <KV label="New customers" value={numFmt(data.customers.new)} />
              <KV label="Returning customers (with job card)" value={numFmt(data.customers.returning)} />
              <KV label="New vehicles registered" value={numFmt(data.customers.newVehicles)} />
            </Section>

            {/* Expenses */}
            <Section title="Expenses">
              <div>
                <div className="mb-1 text-xs font-medium uppercase text-gray-400">By category</div>
                {data.expenses.byCategory.length === 0 ? (
                  <p className="text-sm text-gray-500">No expenses today</p>
                ) : (
                  data.expenses.byCategory.map((r: any) => (
                    <KV key={r.category} label={r.category} value={rupee(r.total)} sub={`${r.n}×`} />
                  ))
                )}
              </div>
              {data.expenses.topVendors.length > 0 && (
                <div className="mt-3">
                  <div className="mb-1 text-xs font-medium uppercase text-gray-400">Top vendors</div>
                  {data.expenses.topVendors.map((r: any, i: number) => (
                    <KV key={`${r.vendor}-${i}`} label={r.vendor} value={rupee(r.total)} sub={`${r.n}×`} />
                  ))}
                </div>
              )}
            </Section>

            {/* AMC */}
            <Section title="AMC">
              <KV label="New contracts sold" value={numFmt(data.amc.contractsNew)} />
              <KV label="AMC services rendered" value={numFmt(data.amc.servicesRendered)} />
              <KV label="Savings passed to customers" value={rupee(data.amc.savings)} />
            </Section>

            {/* Estimates */}
            <Section title="Estimates">
              <KV label="New estimates" value={numFmt(data.estimates.new)} />
              <KV
                label="Converted (to job card / invoice)"
                value={numFmt(data.estimates.converted)}
                sub={data.estimates.new > 0 ? `${Math.round((data.estimates.converted / data.estimates.new) * 100)}%` : ''}
              />
            </Section>
          </div>

          {/* Wider sections */}
          <Section title="Inventory">
            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-xs font-medium uppercase text-gray-400">Top parts consumed today</div>
                  <div className="text-xs text-gray-500">{data.inventory.movementsCount} movements</div>
                </div>
                {data.inventory.partsConsumed.length === 0 ? (
                  <p className="text-sm text-gray-500">No parts consumed today</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="text-xs uppercase text-gray-400">
                      <tr><th className="text-left font-medium">Item</th><th className="text-right font-medium">Qty</th><th className="text-right font-medium">Value</th></tr>
                    </thead>
                    <tbody>
                      {data.inventory.partsConsumed.map((r: any) => (
                        <tr key={r.itemId} className="border-t border-gray-100 dark:border-gray-700">
                          <td className="py-1.5"><span className="font-medium">{r.itemName}</span><span className="ml-2 text-xs text-gray-400">{r.sku}</span></td>
                          <td className="py-1.5 text-right">{Number(r.qty).toFixed(0)}</td>
                          <td className="py-1.5 text-right">{rupee(r.value)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              <div>
                <div className="mb-2 text-xs font-medium uppercase text-gray-400">Low stock now</div>
                {data.inventory.lowStock.length === 0 ? (
                  <p className="text-sm text-gray-500">All items above reorder level</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="text-xs uppercase text-gray-400">
                      <tr><th className="text-left font-medium">Item</th><th className="text-right font-medium">On hand</th><th className="text-right font-medium">Reorder ≤</th></tr>
                    </thead>
                    <tbody>
                      {data.inventory.lowStock.map((r: any) => (
                        <tr key={r.id} className="border-t border-gray-100 dark:border-gray-700">
                          <td className="py-1.5"><span className="font-medium">{r.itemName}</span><span className="ml-2 text-xs text-gray-400">{r.sku}</span></td>
                          <td className="py-1.5 text-right font-medium text-red-600 dark:text-red-400">{Number(r.qty).toFixed(0)}</td>
                          <td className="py-1.5 text-right text-gray-500">{Number(r.reorder).toFixed(0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </Section>

          <Section title="Workers">
            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <div className="mb-2 text-xs font-medium uppercase text-gray-400">Labour revenue today</div>
                {data.workers.labour.length === 0 ? (
                  <p className="text-sm text-gray-500">No labour attributed today</p>
                ) : (
                  data.workers.labour.map((r: any) => (
                    <KV key={r.workerId} label={r.name} value={rupee(r.labour)} sub={`${r.jobs} jobs`} />
                  ))
                )}
              </div>
              <div>
                <div className="mb-2 text-xs font-medium uppercase text-gray-400">Jobs closed today</div>
                {data.workers.jobsClosed.length === 0 ? (
                  <p className="text-sm text-gray-500">No jobs closed today</p>
                ) : (
                  data.workers.jobsClosed.map((r: any) => (
                    <KV key={r.workerId} label={r.name} value={numFmt(r.closed)} />
                  ))
                )}
                {data.workers.onLeave.length > 0 && (
                  <div className="mt-3">
                    <div className="mb-1 text-xs font-medium uppercase text-gray-400">On leave</div>
                    {data.workers.onLeave.map((r: any) => (
                      <KV key={r.workerId} label={r.name} value={r.reason || 'Leave'} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </Section>

          {/* P&L rough */}
          <Section title="Net cash & P&L (rough)">
            <div className="grid gap-3 md:grid-cols-4">
              <StatCard label="Cash collected" value={rupee(data.revenue.collected.total)} />
              <StatCard label="COGS (parts consumed)" value={rupee(data.pnl.cogs)} />
              <StatCard label="Expenses paid" value={rupee(data.expenses.total)} />
              <StatCard label="Net cash flow" value={rupee(data.pnl.netCash)} sub={`accrual: ${rupee(data.pnl.netAccrual)}`} />
            </div>
            <p className="mt-2 text-xs text-gray-500">
              Cash flow = collected − expenses paid (money in/out of the till today). Accrual = invoiced − COGS − expenses (economic P&amp;L). Neither includes salary; see Workers report.
            </p>
          </Section>
        </div>
      )}

      {/* Print styles */}
      <style jsx global>{`
        @media print {
          body { background: white; }
          .print\\:hidden { display: none !important; }
          .print\\:block { display: block !important; }
          @page { size: A4; margin: 12mm; }
        }
      `}</style>
    </div>
  );
}
