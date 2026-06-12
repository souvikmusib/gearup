'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api/client';
import { PageHeader } from '@gearup/ui';
import { ProcessLoader } from '@/components/shared/process-loader';
import { DollarSign, CreditCard, TrendingUp, Download } from 'lucide-react';
import { AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const PRESETS = [
  { label: 'Today', days: 0 },
  { label: 'This Week', days: 7 },
  { label: 'This Month', days: 30 },
  { label: '3 Months', days: 90 },
  { label: 'Custom', days: -1 },
];
const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
function getDate(daysAgo: number) { const d = new Date(); d.setDate(d.getDate() - daysAgo); return d.toISOString().slice(0, 10); }

export default function RevenueReportPage() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string>('');
  const [preset, setPreset] = useState(30);
  const [from, setFrom] = useState(getDate(30));
  const [to, setTo] = useState(getDate(0));

  const fetchReport = () => {
    setError('');
    setData(null);
    const endpoint = `/admin/reports/revenue?from=${from}&to=${to}`;
    api.get<any>(endpoint).then((r) => {
      if (r.success) setData(r.data);
      else setError(r.error?.message || 'Failed to load revenue report');
    }).catch(() => setError('Unable to reach server. Please try again.'));
  };

  useEffect(() => {
    fetchReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  const selectPreset = (days: number) => { setPreset(days); if (days >= 0) { setFrom(getDate(days)); setTo(getDate(0)); } };

  const exportCsv = () => {
    if (!data) return;
    const esc = (v: unknown) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines: string[] = [];
    lines.push(`Revenue Report,${from} to ${to}`);
    lines.push('');
    lines.push('Summary');
    lines.push('Metric,Value');
    lines.push(`Total Revenue,${Number(data.totalRevenue ?? 0)}`);
    const txns = (data.byMode ?? []).reduce((s: number, m: any) => s + (m._count ?? 0), 0);
    lines.push(`Transactions,${txns}`);
    if (data.daily?.length) {
      lines.push('');
      lines.push('Daily Revenue');
      lines.push('Date,Amount');
      data.daily.forEach((d: any) => lines.push(`${esc(d.date)},${Number(d.amount ?? 0)}`));
    }
    if (data.byMode?.length) {
      lines.push('');
      lines.push('By Payment Mode');
      lines.push('Mode,Count,Amount');
      data.byMode.forEach((m: any) => lines.push(`${esc(m.mode)},${m._count ?? 0},${Number(m._sum ?? 0)}`));
    }
    if (data.byType?.length) {
      lines.push('');
      lines.push('By Category');
      lines.push('Type,Total');
      data.byType.forEach((t: any) => lines.push(`${esc(t.type)},${Number(t.total ?? 0)}`));
    }
    if (data.byWorker?.length) {
      lines.push('');
      lines.push('Labor Revenue by Worker');
      lines.push('Worker,Total');
      data.byWorker.forEach((w: any) => lines.push(`${esc(w.name)},${Number(w.total ?? 0)}`));
    }
    if (data.workerJobValue?.length) {
      lines.push('');
      lines.push('Total Job Card Value per Worker');
      lines.push('Worker,Total,Paid Jobs');
      data.workerJobValue.forEach((w: any) => lines.push(`${esc(w.name)},${Number(w.total ?? 0)},${w.jobs ?? 0}`));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `revenue-report_${from}_to_${to}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-950/30 p-6 text-center">
        <p className="text-sm font-medium text-red-700 dark:text-red-300">{error}</p>
        <button
          onClick={fetchReport}
          className="mt-3 inline-flex items-center rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    );
  }
  if (!data) return <ProcessLoader title="Loading revenue report" steps={['Aggregating payments', 'Computing breakdowns']} />;

  // Drop the `|| 1` denominator: in the empty-data case it lied about
  // transaction count (shows '1' instead of '0') and made avg/txn look like ₹0
  // instead of '—'. Render an em-dash for the average when there are no txns.
  const totalTxns = (data.byMode ?? []).reduce((s: number, m: any) => s + (m._count ?? 0), 0);
  const totalRevenueNum = Number(data.totalRevenue ?? 0);
  const avgPerTxn = totalTxns > 0 ? Math.round(totalRevenueNum / totalTxns) : null;
  const dailyNum = (data.daily ?? []).map((d: any) => ({ ...d, amount: Number(d.amount ?? 0) }));
  const byModeNum = (data.byMode ?? []).map((m: any) => ({ ...m, _sum: Number(m._sum ?? 0) }));

  return (
    <div className="space-y-6">
      <PageHeader title="Revenue Report" />

      {/* Period Selector */}
      <div className="flex items-center gap-2 flex-wrap">
        {PRESETS.map((p) => (
          <button key={p.label} onClick={() => selectPreset(p.days)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${preset === p.days ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300'}`}>
            {p.label}
          </button>
        ))}
        {preset === -1 && (
          <div className="flex gap-2 ml-2">
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-lg border px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-800" />
            <span className="text-gray-400 self-center">to</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-lg border px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-800" />
          </div>
        )}
        <button onClick={exportCsv}
          className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-gray-900 text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200 transition-colors">
          <Download className="h-4 w-4" /> Export CSV
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border bg-white dark:bg-gray-900 dark:border-gray-800 p-5">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-green-50 dark:bg-green-950 p-2.5"><DollarSign className="h-5 w-5 text-green-600" /></div>
            <div><p className="text-xs text-gray-500 uppercase font-medium">Total Revenue</p><p className="text-2xl font-bold text-gray-900 dark:text-white">₹{totalRevenueNum.toLocaleString()}</p></div>
          </div>
        </div>
        <div className="rounded-xl border bg-white dark:bg-gray-900 dark:border-gray-800 p-5">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-blue-50 dark:bg-blue-950 p-2.5"><CreditCard className="h-5 w-5 text-blue-600" /></div>
            <div><p className="text-xs text-gray-500 uppercase font-medium">Transactions</p><p className="text-2xl font-bold text-gray-900 dark:text-white">{totalTxns}</p></div>
          </div>
        </div>
        <div className="rounded-xl border bg-white dark:bg-gray-900 dark:border-gray-800 p-5">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-purple-50 dark:bg-purple-950 p-2.5"><TrendingUp className="h-5 w-5 text-purple-600" /></div>
            <div><p className="text-xs text-gray-500 uppercase font-medium">Avg / Transaction</p><p className="text-2xl font-bold text-gray-900 dark:text-white">{avgPerTxn === null ? '—' : `₹${avgPerTxn.toLocaleString()}`}</p></div>
          </div>
        </div>
      </div>

      {/* Revenue Trend Chart */}
      {dailyNum.length > 0 && (
        <div className="rounded-xl border bg-white dark:bg-gray-900 dark:border-gray-800 p-5">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Revenue Trend</h3>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={dailyNum}>
              <defs><linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/><stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/></linearGradient></defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: any) => [`₹${Number(v).toLocaleString()}`, 'Revenue']} labelFormatter={(l) => new Date(l).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })} />
              <Area type="monotone" dataKey="amount" stroke="#3b82f6" strokeWidth={2} fill="url(#colorRevenue)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Payment Mode — Bar + Pie side by side */}
      {byModeNum.length > 0 && (
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-xl border bg-white dark:bg-gray-900 dark:border-gray-800 p-5">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-4">By Payment Mode</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={byModeNum} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="mode" tick={{ fontSize: 12 }} width={100} />
                <Tooltip formatter={(v: any) => [`₹${Number(v).toLocaleString()}`, 'Amount']} />
                <Bar dataKey="_sum" radius={[0, 4, 4, 0]}>
                  {byModeNum.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="rounded-xl border bg-white dark:bg-gray-900 dark:border-gray-800 p-5">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Distribution</h3>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={byModeNum} dataKey="_sum" nameKey="mode" cx="50%" cy="50%" outerRadius={80} label={({ mode, percent }) => `${mode} (${(percent * 100).toFixed(0)}%)`} labelLine={false}>
                  {byModeNum.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v: any) => [`₹${Number(v).toLocaleString()}`, 'Amount']} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Revenue Breakdown by Type + Worker */}
      <div className="grid grid-cols-2 gap-4">
        {data.byType?.length > 0 && (
          <div className="rounded-xl border bg-white dark:bg-gray-900 dark:border-gray-800 p-5">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Revenue by Category</h3>
            <div className="space-y-3">
              {data.byType.map((t: any) => {
                const total = totalRevenueNum || 1;
                const tTotal = Number(t.total ?? 0);
                const pct = ((tTotal / total) * 100).toFixed(0);
                const color = t.type === 'LABOR' ? '#3b82f6' : t.type === 'PART' ? '#10b981' : '#f59e0b';
                return (
                  <div key={t.type}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium text-gray-700 dark:text-gray-300">{t.type === 'LABOR' ? '👷 Labor' : t.type === 'PART' ? '🔩 Parts' : '📝 Custom/Service'}</span>
                      <span className="font-semibold">₹{Math.round(tTotal).toLocaleString()} <span className="text-xs text-gray-400">({pct}%)</span></span>
                    </div>
                    <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-2"><div className="h-2 rounded-full" style={{ width: `${pct}%`, background: color }} /></div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {data.byWorker?.length > 0 && (
          <div className="rounded-xl border bg-white dark:bg-gray-900 dark:border-gray-800 p-5">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Labor Revenue by Worker</h3>
            <div className="space-y-2">
              {data.byWorker.map((w: any) => (
                <div key={w.name} className="flex items-center justify-between py-2 border-b border-gray-50 dark:border-gray-800 last:border-0">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{w.name}</span>
                  <span className="text-sm font-semibold text-blue-600">₹{Math.round(Number(w.total ?? 0)).toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Worker Total Job Card Value */}
      {data.workerJobValue?.length > 0 && (
        <div className="rounded-xl border bg-white dark:bg-gray-900 dark:border-gray-800 p-5">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Total Revenue per Worker (Full Job Card Value)</h3>
          <div className="grid grid-cols-3 gap-4">
            {data.workerJobValue.map((w: any) => (
              <div key={w.name} className="rounded-lg border border-gray-100 dark:border-gray-800 p-4 text-center">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{w.name}</p>
                <p className="text-xl font-bold text-gray-900 dark:text-white mt-1">₹{Math.round(Number(w.total ?? 0)).toLocaleString()}</p>
                <p className="text-xs text-gray-400 mt-1">{w.jobs} paid jobs</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
