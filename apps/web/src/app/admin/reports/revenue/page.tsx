'use client';
import { formatIST } from '@/lib/time';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api/client';
import { PageHeader } from '@gearup/ui';
import { ProcessLoader } from '@/components/shared/process-loader';
import { DollarSign, CreditCard, TrendingUp, Download, Cog, Percent, AlertTriangle, Wallet, Tag } from 'lucide-react';
import { AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { RANGE_PRESETS, DEFAULT_PRESET_ID } from '@/lib/reports/date-presets';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

/** Bar segment colours. Parts uses two shades of green so the block still reads as one category. */
const SEGMENT_COLORS: Record<string, string> = {
  partsCost: '#047857',
  partsMargin: '#34d399',
  labour: '#3b82f6',
  service: '#8b5cf6',
  custom: '#14b8a6',
  amc: '#ec4899',
};
const CATEGORY_COLORS: Record<string, string> = {
  parts: '#10b981',
  labour: '#3b82f6',
  service: '#8b5cf6',
  custom: '#14b8a6',
  amc: '#ec4899',
};
const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

export default function RevenueReportPage() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string>('');
  const [preset, setPreset] = useState(DEFAULT_PRESET_ID);
  const defaultRange = RANGE_PRESETS.find((p) => p.id === DEFAULT_PRESET_ID)!.resolve();
  const [from, setFrom] = useState(defaultRange.from);
  const [to, setTo] = useState(defaultRange.to);

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

  const selectPreset = (id: string) => {
    setPreset(id);
    if (id === 'custom') return;
    const r = RANGE_PRESETS.find((p) => p.id === id)!.resolve();
    setFrom(r.from);
    setTo(r.to);
  };

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
    lines.push(`Collected (payments),${Number(data.totalRevenue ?? 0)}`);
    const txns = (data.byMode ?? []).reduce((s: number, m: any) => s + (m._count ?? 0), 0);
    lines.push(`Transactions,${txns}`);
    const ib = data.incomeBreakdown;
    if (ib) {
      lines.push(`Total income (invoiced, ex-GST, before discounts),${Number(ib.totalIncome ?? 0)}`);
      lines.push(`Discounts given,${Number(ib.discounts?.total ?? 0)}`);
      lines.push(`Net invoiced,${Number(ib.netInvoiced ?? 0)}`);
      lines.push(`GST billed (not income),${Number(ib.taxCollected ?? 0)}`);
      lines.push(`Parts gross profit,${Number(ib.parts?.margin ?? 0)}`);
      lines.push(`Parts margin %,${ib.parts?.marginPct ?? ''}`);
      lines.push('');
      lines.push('Income by Category (ex-GST)');
      lines.push('Category,Amount,% of income');
      (ib.categories ?? []).forEach((c: any) => lines.push(`${esc(c.label)},${Number(c.amount ?? 0)},${Number(c.pct ?? 0)}`));
      lines.push('');
      lines.push('Income Bar Segments (parts split by buying cost)');
      lines.push('Segment,Amount,% of income');
      (ib.segments ?? []).forEach((s: any) => lines.push(`${esc(s.label)},${Number(s.amount ?? 0)},${Number(s.pct ?? 0)}`));
      lines.push('');
      lines.push('Discount Detail');
      lines.push('Source,Amount');
      lines.push(`Discount line items,${Number(ib.discounts?.fromLines ?? 0)}`);
      lines.push(`Invoice-level discount,${Number(ib.discounts?.invoiceLevel ?? 0)}`);
    }
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
    const pp = data.partsProfit;
    if (pp) {
      lines.push('');
      lines.push('Parts Gross Profit (finalized invoices)');
      lines.push('Metric,Value');
      lines.push(`Parts Revenue,${Number(pp.revenue ?? 0)}`);
      lines.push(`Parts Cost,${Number(pp.cost ?? 0)}`);
      lines.push(`Gross Profit,${Number(pp.profit ?? 0)}`);
      lines.push(`Margin %,${pp.marginPct ?? ''}`);
      lines.push(`Revenue Without Cost Basis,${Number(pp.revenueWithoutCost ?? 0)}`);
      if (pp.daily?.length) {
        lines.push('');
        lines.push('Parts Profit by Day');
        lines.push('Date,Revenue,Cost,Gross Profit');
        pp.daily.forEach((d: any) => lines.push(`${esc(d.date)},${Number(d.revenue ?? 0)},${Number(d.cost ?? 0)},${Number(d.profit ?? 0)}`));
      }
      if (pp.items?.length) {
        lines.push('');
        lines.push('Parts Profit by Item');
        lines.push('SKU,Item,Qty,Revenue,Cost,Gross Profit,Margin %');
        pp.items.forEach((i: any) =>
          lines.push(
            `${esc(i.sku ?? '')},${esc(i.itemName ?? '')},${Number(i.qty ?? 0)},${Number(i.revenue ?? 0)},${Number(i.cost ?? 0)},${Number(i.profit ?? 0)},${i.marginPct ?? ''}`,
          ),
        );
      }
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

  // Parts gross profit (selling price − buying price). Uses the same from/to filter
  // as the rest of the report; the API scopes it to finalized invoices in range.
  const pp = data.partsProfit ?? null;
  const ppDaily = (pp?.daily ?? []).map((d: any) => ({
    date: d.date,
    revenue: Number(d.revenue ?? 0),
    cost: Number(d.cost ?? 0),
    profit: Number(d.profit ?? 0),
  }));
  const ppItems = (pp?.items ?? []).filter((i: any) => Number(i.revenue ?? 0) !== 0 || Number(i.cost ?? 0) !== 0);
  const ppTopItems = ppItems.slice(0, 10);
  const ppUncosted = Number(pp?.revenueWithoutCost ?? 0);

  // Income breakdown (invoice basis, ex-GST). Distinct from the payment-basis
  // figures above: `Collected` is cash received, this is what was billed.
  const ib = data.incomeBreakdown ?? null;
  const ibSegments = (ib?.segments ?? []).filter((s: any) => Number(s.amount ?? 0) > 0);
  const ibCategories = ib?.categories ?? [];
  const ibTotal = Number(ib?.totalIncome ?? 0);
  // Recharts stacks one bar from a single row, so each segment becomes a key.
  const ibBarRow = ibSegments.reduce(
    (row: Record<string, number>, s: any) => ({ ...row, [s.key]: Number(s.amount ?? 0) }),
    { name: 'Income' } as Record<string, unknown>,
  );
  const segLabel = (key: string) => ibSegments.find((s: any) => s.key === key)?.label ?? key;

  return (
    <div className="space-y-6">
      <PageHeader title="Revenue Report" />

      {/* Period Selector */}
      <div className="flex items-center gap-2 flex-wrap">
        {RANGE_PRESETS.map((p) => (
          <button key={p.id} onClick={() => selectPreset(p.id)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${preset === p.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300'}`}>
            {p.label}
          </button>
        ))}
        {preset === 'custom' && (
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

      {/* Summary Cards — payment basis (cash actually received) */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Collected · payments received</p>
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-xl border bg-white dark:bg-gray-900 dark:border-gray-800 p-5">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-green-50 dark:bg-green-950 p-2.5"><Wallet className="h-5 w-5 text-green-600" /></div>
              <div><p className="text-xs text-gray-500 uppercase font-medium">Collected</p><p className="text-2xl font-bold text-gray-900 dark:text-white">₹{totalRevenueNum.toLocaleString()}</p></div>
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
      </div>

      {/* Income Cards — invoice basis. Totals for the whole selected range. */}
      {ib && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Invoiced · billed on finalized invoices, excluding GST</p>
          <div className="grid grid-cols-4 gap-4">
            <div className="rounded-xl border bg-white dark:bg-gray-900 dark:border-gray-800 p-5">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950 p-2.5"><DollarSign className="h-5 w-5 text-emerald-600" /></div>
                <div>
                  <p className="text-xs text-gray-500 uppercase font-medium">Total Income</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{inr(ibTotal)}</p>
                  <p className="text-[11px] text-gray-400">before discounts</p>
                </div>
              </div>
            </div>
            <div className="rounded-xl border bg-white dark:bg-gray-900 dark:border-gray-800 p-5">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-green-50 dark:bg-green-950 p-2.5"><Cog className="h-5 w-5 text-green-600" /></div>
                <div>
                  <p className="text-xs text-gray-500 uppercase font-medium">Parts Gross Profit</p>
                  <p className={`text-2xl font-bold ${Number(ib.parts?.margin ?? 0) < 0 ? 'text-red-600' : 'text-gray-900 dark:text-white'}`}>
                    {inr(Number(ib.parts?.margin ?? 0))}
                  </p>
                  <p className="text-[11px] text-gray-400">{inr(Number(ib.parts?.revenue ?? 0))} sold − {inr(Number(ib.parts?.cost ?? 0))} bought</p>
                </div>
              </div>
            </div>
            <div className="rounded-xl border bg-white dark:bg-gray-900 dark:border-gray-800 p-5">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-rose-50 dark:bg-rose-950 p-2.5"><Tag className="h-5 w-5 text-rose-600" /></div>
                <div>
                  <p className="text-xs text-gray-500 uppercase font-medium">Discounts Given</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{inr(Number(ib.discounts?.total ?? 0))}</p>
                  <p className="text-[11px] text-gray-400">
                    {inr(Number(ib.discounts?.fromLines ?? 0))} lines · {inr(Number(ib.discounts?.invoiceLevel ?? 0))} invoice-level
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-xl border bg-white dark:bg-gray-900 dark:border-gray-800 p-5">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-purple-50 dark:bg-purple-950 p-2.5"><Percent className="h-5 w-5 text-purple-600" /></div>
                <div>
                  <p className="text-xs text-gray-500 uppercase font-medium">Parts Margin</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">
                    {ib.parts?.marginPct === null || ib.parts?.marginPct === undefined ? '—' : `${Number(ib.parts.marginPct).toFixed(1)}%`}
                  </p>
                  <p className="text-[11px] text-gray-400">of parts revenue</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Income Composition — where the total income came from */}
      {ib && ibSegments.length > 0 && (
        <div className="rounded-xl border bg-white dark:bg-gray-900 dark:border-gray-800 p-5">
          <div className="flex items-baseline justify-between mb-1">
            <h3 className="font-semibold text-gray-900 dark:text-white">Income Composition</h3>
            <span className="text-xs text-gray-500">{inr(ibTotal)} total · ex-GST</span>
          </div>
          <p className="mb-4 text-xs text-gray-500">
            Parts is shown in two shades: the darker part is what the stock cost you, the lighter part is your margin on it.
          </p>
          <ResponsiveContainer width="100%" height={120}>
            <BarChart data={[ibBarRow]} layout="vertical" margin={{ top: 0, right: 8, bottom: 0, left: 8 }}>
              <XAxis type="number" domain={[0, ibTotal]} tick={{ fontSize: 11 }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
              <YAxis type="category" dataKey="name" hide />
              <Tooltip
                formatter={(v: any, key: any) => [inr(Number(v)), segLabel(String(key))]}
                labelFormatter={() => 'Income'}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} formatter={(key) => segLabel(String(key))} />
              {ibSegments.map((s: any, idx: number) => (
                <Bar
                  key={s.key}
                  dataKey={s.key}
                  stackId="income"
                  fill={SEGMENT_COLORS[s.key] ?? COLORS[idx % COLORS.length]}
                  radius={idx === ibSegments.length - 1 ? [0, 4, 4, 0] : [0, 0, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>

          {/* Breakdown strip — the bar's slivers are unreadable below a few percent */}
          <div className="mt-2 divide-y dark:divide-gray-800">
            {ibCategories.map((c: any) => (
              <div key={c.key} className="flex items-center gap-3 py-2 text-sm">
                <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: CATEGORY_COLORS[c.key] ?? '#9ca3af' }} />
                <span className="font-medium text-gray-700 dark:text-gray-300">{c.label}</span>
                {c.key === 'parts' && (
                  <span className="text-xs text-gray-400">
                    buying cost {inr(Number(ib.parts?.cost ?? 0))} · margin {inr(Number(ib.parts?.margin ?? 0))}
                  </span>
                )}
                <span className="ml-auto tabular-nums font-semibold">{inr(Number(c.amount ?? 0))}</span>
                <span className="w-12 text-right tabular-nums text-xs text-gray-400">{Number(c.pct ?? 0).toFixed(1)}%</span>
              </div>
            ))}
          </div>

          {/* Reconciliation — makes the three different "income" numbers explicit */}
          <div className="mt-3 space-y-1 rounded-lg bg-gray-50 dark:bg-gray-800/50 px-4 py-3 text-xs">
            <div className="flex justify-between"><span className="text-gray-500">Total income (before discounts)</span><span className="tabular-nums font-medium">{inr(ibTotal)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Less discounts given</span><span className="tabular-nums font-medium text-rose-600">− {inr(Number(ib.discounts?.total ?? 0))}</span></div>
            <div className="flex justify-between border-t pt-1 dark:border-gray-700"><span className="font-medium text-gray-700 dark:text-gray-300">Net invoiced</span><span className="tabular-nums font-bold">{inr(Number(ib.netInvoiced ?? 0))}</span></div>
            <div className="flex justify-between pt-1"><span className="text-gray-500">Collected in this period (payments)</span><span className="tabular-nums font-medium">{inr(totalRevenueNum)}</span></div>
            <p className="pt-1 text-[11px] text-gray-400">
              Net invoiced and collected differ by unpaid invoices, and by payments received now against invoices raised earlier.
              GST of {inr(Number(ib.taxCollected ?? 0))} was billed on top and is excluded throughout — it is not income.
            </p>
          </div>
        </div>
      )}

      {/* Revenue Trend Chart */}
      {dailyNum.length > 0 && (
        <div className="rounded-xl border bg-white dark:bg-gray-900 dark:border-gray-800 p-5">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Revenue Trend</h3>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={dailyNum}>
              <defs><linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/><stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/></linearGradient></defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(d) => formatIST(d, { day: 'numeric', month: 'short' })} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: any) => [`₹${Number(v).toLocaleString()}`, 'Revenue']} labelFormatter={(l) => formatIST(l, { day: 'numeric', month: 'long', year: 'numeric' })} />
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

      {/* The old "Revenue by Category" progress bars lived here. Income Composition
          above supersedes them: same question, but ex-GST, with all five line types
          separated instead of collapsing service/custom/AMC into one "Other", and
          with percentages against income rather than against payments received. */}

      {/* ── Parts Gross Profit ─────────────────────────────────────────────
          Selling price − buying price on parts sold via finalized invoices in
          the selected date range. Cost comes from the FIFO stock batch each
          part was issued from, so it reflects what was actually paid for that
          stock rather than the item's present-day cost price. */}
      {pp && (
        <div className="space-y-4">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Parts Gross Profit</h2>
            <p className="text-xs text-gray-500">
              Finalized invoices · {formatIST(from, { day: 'numeric', month: 'short' })} – {formatIST(to, { day: 'numeric', month: 'short', year: 'numeric' })}
            </p>
          </div>

          {ppItems.length === 0 ? (
            <div className="rounded-xl border border-dashed bg-white dark:bg-gray-900 dark:border-gray-800 p-8 text-center">
              <Cog className="mx-auto h-6 w-6 text-gray-300" />
              <p className="mt-2 text-sm font-medium text-gray-900 dark:text-white">No parts sold in this period</p>
              <p className="mt-1 text-xs text-gray-500">Parts appear here once they are billed on a finalized invoice.</p>
            </div>
          ) : (
            <>
              {/* Headline parts totals live in the Invoiced card row above; this
                  section is the day-by-day and per-part detail behind them. */}
              {ppUncosted > 0 && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/30 px-4 py-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  <p className="text-xs text-amber-800 dark:text-amber-200">
                    ₹{Math.round(ppUncosted).toLocaleString()} of parts revenue has no recorded buying price
                    (manually typed lines, or items with a zero cost price). Actual gross profit is lower than shown.
                  </p>
                </div>
              )}

              {ppDaily.length > 0 && (
                <div className="rounded-xl border bg-white dark:bg-gray-900 dark:border-gray-800 p-5">
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Profit Trend</h3>
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={ppDaily}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(d) => formatIST(d, { day: 'numeric', month: 'short' })} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                      <Tooltip
                        formatter={(v: any, name: any) => [`₹${Number(v).toLocaleString()}`, name]}
                        labelFormatter={(l) => formatIST(l, { day: 'numeric', month: 'long', year: 'numeric' })}
                      />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="cost" name="Cost" stackId="a" fill="#f59e0b" radius={[0, 0, 0, 0]} />
                      <Bar dataKey="profit" name="Gross profit" stackId="a" fill="#10b981" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                  <p className="mt-2 text-xs text-gray-500">Stacked bar height is parts revenue for the day; the green portion is gross profit.</p>
                </div>
              )}

              <div className="rounded-xl border bg-white dark:bg-gray-900 dark:border-gray-800 p-5">
                <div className="flex items-baseline justify-between mb-4">
                  <h3 className="font-semibold text-gray-900 dark:text-white">Profit by Part</h3>
                  {ppItems.length > ppTopItems.length && (
                    <span className="text-xs text-gray-500">Top {ppTopItems.length} of {ppItems.length}</span>
                  )}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b dark:border-gray-800 text-xs uppercase text-gray-500">
                        <th className="text-left font-medium py-2">Part</th>
                        <th className="text-right font-medium py-2">Qty</th>
                        <th className="text-right font-medium py-2">Sold for</th>
                        <th className="text-right font-medium py-2">Cost</th>
                        <th className="text-right font-medium py-2">Gross profit</th>
                        <th className="text-right font-medium py-2">Margin</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ppTopItems.map((i: any) => (
                        <tr key={i.itemId ?? '__unlinked__'} className="border-b last:border-0 dark:border-gray-800">
                          <td className="py-2 pr-3">
                            <span className="font-medium text-gray-900 dark:text-white">{i.itemName}</span>
                            {i.sku && <span className="block text-[11px] text-gray-400">{i.sku}</span>}
                            {!i.hasCostBasis && (
                              <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                                <AlertTriangle size={9} /> no cost recorded
                              </span>
                            )}
                          </td>
                          <td className="py-2 text-right tabular-nums text-gray-600 dark:text-gray-400">{Number(i.qty ?? 0)}</td>
                          <td className="py-2 text-right tabular-nums">₹{Math.round(Number(i.revenue ?? 0)).toLocaleString()}</td>
                          <td className="py-2 text-right tabular-nums text-gray-600 dark:text-gray-400">₹{Math.round(Number(i.cost ?? 0)).toLocaleString()}</td>
                          <td className={`py-2 text-right tabular-nums font-semibold ${Number(i.profit ?? 0) < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                            ₹{Math.round(Number(i.profit ?? 0)).toLocaleString()}
                          </td>
                          <td className="py-2 text-right tabular-nums text-gray-600 dark:text-gray-400">
                            {i.marginPct === null || i.marginPct === undefined ? '—' : `${Number(i.marginPct).toFixed(1)}%`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
