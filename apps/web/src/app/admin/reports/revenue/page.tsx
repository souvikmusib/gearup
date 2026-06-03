'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api/client';
import { PageHeader } from '@gearup/ui';
import { DollarSign, CreditCard, TrendingUp } from 'lucide-react';
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
  const [preset, setPreset] = useState(30);
  const [from, setFrom] = useState(getDate(30));
  const [to, setTo] = useState(getDate(0));

  useEffect(() => {
    const endpoint = `/admin/reports?type=revenue&from=${from}&to=${to}`;
    api.get<any>(endpoint).then((r) => { if (r.success) setData(r.data); });
  }, [from, to]);

  const selectPreset = (days: number) => { setPreset(days); if (days >= 0) { setFrom(getDate(days)); setTo(getDate(0)); } };

  if (!data) return <p className="py-8 text-center text-gray-500">Loading...</p>;

  const totalTxns = data.byMode?.reduce((s: number, m: any) => s + (m._count ?? 0), 0) || 1;

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
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border bg-white dark:bg-gray-900 dark:border-gray-800 p-5">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-green-50 dark:bg-green-950 p-2.5"><DollarSign className="h-5 w-5 text-green-600" /></div>
            <div><p className="text-xs text-gray-500 uppercase font-medium">Total Revenue</p><p className="text-2xl font-bold text-gray-900 dark:text-white">₹{Number(data.totalRevenue ?? 0).toLocaleString()}</p></div>
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
            <div><p className="text-xs text-gray-500 uppercase font-medium">Avg / Transaction</p><p className="text-2xl font-bold text-gray-900 dark:text-white">₹{Math.round(Number(data.totalRevenue ?? 0) / totalTxns).toLocaleString()}</p></div>
          </div>
        </div>
      </div>

      {/* Revenue Trend Chart */}
      {data.daily?.length > 0 && (
        <div className="rounded-xl border bg-white dark:bg-gray-900 dark:border-gray-800 p-5">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Revenue Trend</h3>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={data.daily}>
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
      {data.byMode?.length > 0 && (
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-xl border bg-white dark:bg-gray-900 dark:border-gray-800 p-5">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-4">By Payment Mode</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.byMode} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="mode" tick={{ fontSize: 12 }} width={100} />
                <Tooltip formatter={(v: any) => [`₹${Number(v).toLocaleString()}`, 'Amount']} />
                <Bar dataKey="_sum" radius={[0, 4, 4, 0]}>
                  {data.byMode.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="rounded-xl border bg-white dark:bg-gray-900 dark:border-gray-800 p-5">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Distribution</h3>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={data.byMode} dataKey="_sum" nameKey="mode" cx="50%" cy="50%" outerRadius={80} label={({ mode, percent }) => `${mode} (${(percent * 100).toFixed(0)}%)`} labelLine={false}>
                  {data.byMode.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v: any) => [`₹${Number(v).toLocaleString()}`, 'Amount']} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
