'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api/client';
import { PageHeader, DataTable } from '@gearup/ui';
import { DollarSign, CreditCard, TrendingUp } from 'lucide-react';

const PRESETS = [
  { label: 'Today', days: 0 },
  { label: 'This Week', days: 7 },
  { label: 'This Month', days: 30 },
  { label: 'Last 3 Months', days: 90 },
  { label: 'Custom', days: -1 },
];

function getDate(daysAgo: number) {
  const d = new Date(); d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

export default function RevenueReportPage() {
  const [data, setData] = useState<any>(null);
  const [preset, setPreset] = useState(30);
  const [from, setFrom] = useState(getDate(30));
  const [to, setTo] = useState(getDate(0));

  useEffect(() => {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    const endpoint = `/admin/reports?type=revenue&${params}`;
    const { cached, promise } = api.getSWR<any>(endpoint);
    if (cached?.success) setData(cached.data);
    promise.then((r) => r.success && setData(r.data));
  }, [from, to]);

  const selectPreset = (days: number) => {
    setPreset(days);
    if (days >= 0) { setFrom(getDate(days)); setTo(getDate(0)); }
  };

  if (!data) return <p className="py-8 text-center text-gray-500">Loading...</p>;

  return (
    <div className="space-y-6">
      <PageHeader title="Revenue Report" />

      {/* Period Selector */}
      <div className="flex items-center gap-2 flex-wrap">
        {PRESETS.map((p) => (
          <button key={p.label} onClick={() => selectPreset(p.days)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${preset === p.days ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'}`}>
            {p.label}
          </button>
        ))}
        {preset === -1 && (
          <div className="flex gap-2 ml-2">
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-800" />
            <span className="text-gray-400 self-center">to</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-800" />
          </div>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border bg-white dark:bg-gray-900 dark:border-gray-800 p-5">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-green-50 dark:bg-green-950 p-2.5"><DollarSign className="h-5 w-5 text-green-600" /></div>
            <div>
              <p className="text-xs text-gray-500 uppercase font-medium">Total Revenue</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">₹{Number(data.totalRevenue ?? 0).toLocaleString()}</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border bg-white dark:bg-gray-900 dark:border-gray-800 p-5">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-blue-50 dark:bg-blue-950 p-2.5"><CreditCard className="h-5 w-5 text-blue-600" /></div>
            <div>
              <p className="text-xs text-gray-500 uppercase font-medium">Transactions</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{data.byMode?.reduce((s: number, m: any) => s + (m._count ?? 0), 0) ?? 0}</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border bg-white dark:bg-gray-900 dark:border-gray-800 p-5">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-purple-50 dark:bg-purple-950 p-2.5"><TrendingUp className="h-5 w-5 text-purple-600" /></div>
            <div>
              <p className="text-xs text-gray-500 uppercase font-medium">Avg per Transaction</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">₹{Math.round(Number(data.totalRevenue ?? 0) / Math.max(data.byMode?.reduce((s: number, m: any) => s + (m._count ?? 0), 0) ?? 1, 1)).toLocaleString()}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Payment Mode Breakdown */}
      <div className="rounded-xl border bg-white dark:bg-gray-900 dark:border-gray-800 p-5">
        <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Payment Mode Breakdown</h3>
        {data.byMode?.length > 0 ? (
          <>
            <div className="space-y-3 mb-4">
              {data.byMode.map((m: any) => {
                const pct = Number(data.totalRevenue) > 0 ? (Number(m._sum) / Number(data.totalRevenue)) * 100 : 0;
                return (
                  <div key={m.mode} className="flex items-center gap-3">
                    <span className="w-28 text-sm text-gray-600 dark:text-gray-400">{m.mode}</span>
                    <div className="flex-1 bg-gray-100 dark:bg-gray-800 rounded-full h-3">
                      <div className="bg-blue-600 h-3 rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="w-24 text-sm font-medium text-right">₹{Number(m._sum ?? 0).toLocaleString()}</span>
                    <span className="w-12 text-xs text-gray-500 text-right">{pct.toFixed(0)}%</span>
                  </div>
                );
              })}
            </div>
            <DataTable
              keyField="mode"
              columns={[
                { key: 'mode', header: 'Payment Mode' },
                { key: '_count', header: 'Count' },
                { key: '_sum', header: 'Total', render: (r: any) => `₹${Number(r._sum ?? 0).toLocaleString()}` },
              ]}
              data={data.byMode ?? []}
            />
          </>
        ) : (
          <p className="text-sm text-gray-500 text-center py-4">No payments in this period</p>
        )}
      </div>
    </div>
  );
}
