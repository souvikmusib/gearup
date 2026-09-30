'use client';

/**
 * Parts & Service report.
 *
 * Period selection drives the API. The grade filter and the search box narrow
 * the two problem lists client-side — they are a few hundred rows at most, so a
 * round trip per keystroke would be slower and no more correct.
 *
 * Overheads are edited inline here rather than buried in Settings, because the
 * number only means anything next to the profit it is being subtracted from.
 * They persist to `Setting` via the existing PATCH /admin/settings route.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api/client';
import { useAuth } from '@/lib/auth/auth-context';
import { PageHeader } from '@gearup/ui';
import { ProcessLoader } from '@/components/shared/process-loader';
import {
  AlertTriangle,
  Check,
  Download,
  FileText,
  Package,
  Percent,
  Search,
  Wallet,
  Wrench,
} from 'lucide-react';
import { RANGE_PRESETS, DEFAULT_PRESET_ID } from '@/lib/reports/date-presets';
import {
  OVERHEAD_KEYS,
  OVERHEAD_LABELS,
  PRORATION_DIVISOR,
  settingKeyFor,
  type OverheadKey,
} from '@/lib/reports/overheads';
import { PERMISSIONS } from '@gearup/types';
import type { PartsServiceReport } from '@/lib/reports/parts-service-query';

const inr = (n: number) => `₹${Math.round(Number(n || 0)).toLocaleString('en-IN')}`;
const inr2 = (n: number) =>
  `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (n: number | null) => (n === null ? '—' : `${Number(n).toFixed(1)}%`);

const GRADE_COLORS: Record<string, string> = {
  OK: '#16a34a',
  NO_COST: '#dc2626',
  UNLINKED: '#d97706',
  NO_MOVEMENT: '#0891b2',
};

const LINE_TYPE_LABELS: Record<string, string> = {
  PART: 'Parts',
  SERVICE_CHARGE: 'Service charge',
  CUSTOM_CHARGE: 'Custom charge',
  LABOR: 'Labour',
  AMC: 'AMC sold',
  DISCOUNT_ADJUSTMENT: 'Discount (line)',
};

type ListTab = 'noCost' | 'unlinked';

export default function PartsServiceReportPage() {
  const { hasPermission } = useAuth();
  const canEditOverheads = hasPermission(PERMISSIONS.SETTINGS_MANAGE);

  const [preset, setPreset] = useState(DEFAULT_PRESET_ID);
  const defaultRange = RANGE_PRESETS.find((p) => p.id === DEFAULT_PRESET_ID)!.resolve();
  const [from, setFrom] = useState(defaultRange.from);
  const [to, setTo] = useState(defaultRange.to);

  const [data, setData] = useState<PartsServiceReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Local edits to the monthly overheads, applied optimistically so the P&L
  // responds as you type. Persisted only when Save is pressed.
  const [draft, setDraft] = useState<Record<OverheadKey, string> | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const [tab, setTab] = useState<ListTab>('noCost');
  const [search, setSearch] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api
      .get<PartsServiceReport>(`/admin/reports/parts-service?from=${from}&to=${to}`)
      .then((r) => {
        if (r.success && r.data) {
          setData(r.data);
          setDraft(
            OVERHEAD_KEYS.reduce(
              (acc, k) => ({ ...acc, [k]: String(r.data!.overheads.monthly[k] ?? 0) }),
              {} as Record<OverheadKey, string>,
            ),
          );
        } else {
          setError(r.error?.message || 'Failed to load the Parts & Service report');
        }
      })
      .catch(() => setError('Unable to reach server. Please try again.'))
      .finally(() => setLoading(false));
  }, [from, to]);

  useEffect(load, [load]);

  const selectPreset = (id: string) => {
    setPreset(id);
    if (id === 'custom') return;
    const r = RANGE_PRESETS.find((p) => p.id === id)!.resolve();
    setFrom(r.from);
    setTo(r.to);
  };

  /* ---- overheads: recompute locally so editing is instant ---- */
  const localOverheads = useMemo(() => {
    if (!data || !draft) return null;
    const days = data.range.days;
    const lines = OVERHEAD_KEYS.map((key) => {
      const monthly = Number(draft[key]) || 0;
      const perDay = monthly / PRORATION_DIVISOR;
      return { key, label: OVERHEAD_LABELS[key], monthly, perDay, forPeriod: perDay * days };
    });
    const monthlyTotal = lines.reduce((s, l) => s + l.monthly, 0);
    const perDayTotal = monthlyTotal / PRORATION_DIVISOR;
    return { lines, monthlyTotal, perDayTotal, forPeriodTotal: perDayTotal * days, days };
  }, [data, draft]);

  /* ---- P&L recomputed against the edited overheads ---- */
  const profit = useMemo(() => {
    if (!data || !localOverheads) return null;
    const { netIncome } = data.totals;
    const recorded = data.partsIntegrity.cost;
    const margin = data.partsIntegrity.costedMarginPct;
    const implied =
      margin === null ? 0 : data.partsIntegrity.revenueWithoutCost * (1 - margin / 100);
    const oh = localOverheads.forPeriodTotal;
    const grossReported = netIncome - recorded;
    const grossAdjusted = grossReported - implied;
    return {
      implied,
      overheads: oh,
      reported: { gross: grossReported, net: grossReported - oh },
      adjusted: { gross: grossAdjusted, net: grossAdjusted - oh },
      uncertainty: implied,
    };
  }, [data, localOverheads]);

  const dirty = useMemo(() => {
    if (!data || !draft) return false;
    return OVERHEAD_KEYS.some((k) => (Number(draft[k]) || 0) !== (data.overheads.monthly[k] ?? 0));
  }, [data, draft]);

  const saveOverheads = async () => {
    if (!draft) return;
    setSaving(true);
    const body = OVERHEAD_KEYS.reduce(
      (acc, k) => ({ ...acc, [settingKeyFor(k)]: Number(draft[k]) || 0 }),
      {} as Record<string, number>,
    );
    const res = await api.patch<unknown>('/admin/settings', body);
    setSaving(false);
    if (res.success) {
      setSavedAt(Date.now());
      // Clear the GET cache so the next load reflects the new values.
      api.clearCache();
      load();
    } else {
      alert(res.error?.message || 'Failed to save overheads');
    }
  };

  /* ---- problem lists, filtered client-side ---- */
  const activeList = useMemo(() => {
    if (!data) return [];
    const rows = tab === 'noCost' ? data.partsIntegrity.noCostItems : data.partsIntegrity.unlinkedItems;
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        (r.sku ?? '').toLowerCase().includes(q) ||
        (r.category ?? '').toLowerCase().includes(q),
    );
  }, [data, tab, search]);

  const openPdf = async () => {
    try {
      const res = await window.fetch(
        `${window.location.origin}/api/admin/reports/parts-service/pdf?from=${from}&to=${to}`,
        { method: 'GET', credentials: 'same-origin' },
      );
      if (res.status === 401) {
        alert('Not authenticated. Please login again.');
        return;
      }
      if (!res.ok) {
        alert('Failed to generate the PDF');
        return;
      }
      const html = await res.text();
      const blobUrl = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
      // The document prints itself on load, so no listener is attached here.
      const w = window.open(blobUrl, '_blank');
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
      if (!w) alert('Please allow pop-ups to download the PDF.');
    } catch {
      alert('Failed to generate the PDF');
    }
  };

  const exportCsv = () => {
    if (!data) return;
    const pi = data.partsIntegrity;
    const q = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines: string[] = [];
    lines.push(`Parts & Service Report,${data.range.from} to ${data.range.to} (${data.range.days} days)`);
    lines.push('');
    lines.push('Summary,Amount');
    lines.push(`Parts sold,${data.totals.partsRevenue}`);
    lines.push(`Service charges,${data.totals.serviceRevenue}`);
    lines.push(`Total income ex-GST,${data.totals.totalIncome}`);
    lines.push(`Discount,${data.totals.discount}`);
    lines.push(`Net income,${data.totals.netIncome}`);
    lines.push(`Parts cost recorded,${pi.cost}`);
    lines.push(`Parts revenue with no cost basis,${pi.revenueWithoutCost}`);
    lines.push(`Cost coverage %,${pi.coveragePct}`);
    lines.push(`True margin on costed parts %,${pi.costedMarginPct ?? ''}`);
    lines.push('');
    lines.push('Overheads,Monthly,Per day,This period');
    localOverheads?.lines.forEach((l) =>
      lines.push([q(l.label), l.monthly, l.perDay.toFixed(2), l.forPeriod.toFixed(2)].join(',')),
    );
    lines.push('');
    lines.push('Grade,Lines,Units,Revenue,Known cost,Share %');
    pi.byGrade.forEach((g) =>
      lines.push([q(g.label), g.lines, g.qty, g.revenue, g.cost, g.sharePct].join(',')),
    );
    lines.push('');
    lines.push(`Parts with no buying price (${pi.noCostItems.length} items)`);
    lines.push('SKU,Item,Category,Lines,Units,Sell price,Revenue');
    pi.noCostItems.forEach((r) =>
      lines.push(
        [q(r.sku), q(r.name), q(r.category), r.lines, r.qty, r.maxUnitPrice, r.revenue].join(','),
      ),
    );
    lines.push('');
    lines.push(`Parts with no inventory link (${pi.unlinkedItems.length} descriptions)`);
    lines.push('Description,Lines,Units,Sell price,Revenue');
    pi.unlinkedItems.forEach((r) =>
      lines.push([q(r.name), r.lines, r.qty, r.maxUnitPrice, r.revenue].join(',')),
    );

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `parts-service-report_${from}_to_${to}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (loading && !data)
    return (
      <ProcessLoader
        title="Loading Parts & Service report"
        steps={['Reading finalized invoices', 'Resolving parts cost', 'Grading cost integrity']}
      />
    );

  if (error && !data) {
    return (
      <div className="space-y-6">
        <PageHeader title="Parts & Service Report" />
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      </div>
    );
  }
  if (!data || !localOverheads || !profit) return null;

  const pi = data.partsIntegrity;
  const noCost = pi.byGrade.find((g) => g.grade === 'NO_COST');
  const unlinked = pi.byGrade.find((g) => g.grade === 'UNLINKED');
  const maxDaily = Math.max(...data.daily.map((d) => d.service + d.parts), 1);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Parts & Service Report"
        description="Finalized invoices, excluding GST. Parts margin is only as good as the buying prices behind it."
      />

      {/* Period + actions */}
      <div className="flex flex-wrap items-center gap-2">
        {RANGE_PRESETS.map((p) => (
          <button
            key={p.id}
            onClick={() => selectPreset(p.id)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              preset === p.id
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300'
            }`}
          >
            {p.label}
          </button>
        ))}
        {preset === 'custom' && (
          <div className="ml-2 flex gap-2">
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="rounded-lg border px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-800"
            />
            <span className="self-center text-gray-400">to</span>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="rounded-lg border px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-800"
            />
          </div>
        )}
        <span className="ml-auto flex gap-2">
          <button
            onClick={exportCsv}
            className="inline-flex items-center gap-1.5 rounded-lg border bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
          >
            <Download className="h-4 w-4" /> Export CSV
          </button>
          <button
            onClick={openPdf}
            className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-red-700"
          >
            <FileText className="h-4 w-4" /> Download PDF
          </button>
        </span>
      </div>

      <p className="text-xs text-gray-400">
        {data.range.days} days · {data.invoiceCount} finalized invoices · {pi.lines} part lines ·{' '}
        {Math.round(pi.qty)} units
      </p>

      {/* Income KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Kpi
          icon={<Package className="h-5 w-5 text-blue-600" />}
          tint="bg-blue-50 dark:bg-blue-950"
          cap="Parts sold"
          value={inr(data.totals.partsRevenue)}
          foot={`${Math.round(pi.qty)} units · ${pi.lines} lines`}
        />
        <Kpi
          icon={<Wrench className="h-5 w-5 text-green-600" />}
          tint="bg-green-50 dark:bg-green-950"
          cap="Service charges"
          value={inr(data.totals.serviceRevenue)}
          foot="service, labour & custom charge"
        />
        <Kpi
          icon={<Wallet className="h-5 w-5 text-emerald-600" />}
          tint="bg-emerald-50 dark:bg-emerald-950"
          cap="Net income (ex-GST)"
          value={inr(data.totals.netIncome)}
          foot={`${inr(data.totals.totalIncome)} less ${inr(data.totals.discount)} discount`}
        />
      </div>

      {/* Integrity KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-red-200 bg-red-50 p-5 dark:border-red-900 dark:bg-red-950/40">
          <p className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
            No buying price
          </p>
          <p className="mt-1 text-2xl font-bold text-red-700 dark:text-red-400">
            {inr(noCost?.revenue ?? 0)}
          </p>
          <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
            {noCost?.lines ?? 0} lines · {pi.noCostItems.length} items ·{' '}
            {pct(noCost?.sharePct ?? 0)} of parts
          </p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-900 dark:bg-amber-950/40">
          <p className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
            No inventory link
          </p>
          <p className="mt-1 text-2xl font-bold text-amber-700 dark:text-amber-400">
            {inr(unlinked?.revenue ?? 0)}
          </p>
          <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
            {unlinked?.lines ?? 0} lines · {pi.unlinkedItems.length} descriptions ·{' '}
            {pct(unlinked?.sharePct ?? 0)}
          </p>
        </div>
        <Kpi
          icon={<Percent className="h-5 w-5 text-purple-600" />}
          tint="bg-purple-50 dark:bg-purple-950"
          cap="Cost coverage"
          value={pct(pi.coveragePct)}
          foot={`${inr(pi.cost)} of buying price known`}
        />
      </div>

      {/* Overheads + P&L */}
      <section className="rounded-xl border bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
          Monthly overheads &amp; profitability
        </h2>
        <p className="mb-4 mt-0.5 text-xs text-gray-500 dark:text-gray-400">
          Enter each cost as a <strong>monthly</strong> figure. Divided by {PRORATION_DIVISOR} for a
          daily rate and multiplied by the {data.range.days} days in this period, so filtering to a
          single day charges one-thirtieth of the month.
          {!canEditOverheads && ' Requires the settings.manage permission to edit.'}
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-[10px] uppercase tracking-wide text-gray-400 dark:border-gray-700">
                <th className="py-2 pr-3 font-semibold">Overhead</th>
                <th className="py-2 pr-3 text-right font-semibold">Monthly amount</th>
                <th className="py-2 pr-3 text-right font-semibold">Per day (÷{PRORATION_DIVISOR})</th>
                <th className="py-2 text-right font-semibold">This period (×{data.range.days})</th>
              </tr>
            </thead>
            <tbody>
              {localOverheads.lines.map((l) => (
                <tr key={l.key} className="border-b last:border-0 dark:border-gray-800">
                  <td className="py-2 pr-3 text-gray-700 dark:text-gray-300">{l.label}</td>
                  <td className="py-2 pr-3 text-right">
                    <span className="mr-1 text-xs text-gray-400">₹</span>
                    <input
                      type="number"
                      min={0}
                      step={100}
                      disabled={!canEditOverheads}
                      value={draft?.[l.key] ?? ''}
                      onChange={(e) =>
                        setDraft((d) => (d ? { ...d, [l.key]: e.target.value } : d))
                      }
                      className="w-28 rounded-md border border-gray-300 bg-amber-50 px-2 py-1 text-right text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-gray-100 dark:border-gray-600 dark:bg-gray-800 dark:disabled:bg-gray-800"
                    />
                  </td>
                  <td className="py-2 pr-3 text-right text-gray-500 dark:text-gray-400">
                    {inr2(l.perDay)}
                  </td>
                  <td className="py-2 text-right font-semibold text-gray-900 dark:text-white">
                    {inr(l.forPeriod)}
                  </td>
                </tr>
              ))}
              <tr className="border-t-2 border-gray-900 font-bold dark:border-gray-200">
                <td className="py-2 pr-3">Total overheads</td>
                <td className="py-2 pr-3 text-right">{inr(localOverheads.monthlyTotal)}</td>
                <td className="py-2 pr-3 text-right">{inr2(localOverheads.perDayTotal)}</td>
                <td className="py-2 text-right">{inr(localOverheads.forPeriodTotal)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {canEditOverheads && (
          <div className="mt-3 flex items-center gap-3">
            <button
              onClick={saveOverheads}
              disabled={!dirty || saving}
              className="rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-gray-900"
            >
              {saving ? 'Saving…' : 'Save overheads'}
            </button>
            {dirty && !saving && (
              <span className="text-xs text-amber-600">Unsaved changes</span>
            )}
            {!dirty && savedAt && (
              <span className="inline-flex items-center gap-1 text-xs text-green-600">
                <Check className="h-3.5 w-3.5" /> Saved
              </span>
            )}
          </div>
        )}

        <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Scenario
            title="As reported"
            note={`Uses only the ${pct(pi.coveragePct)} of parts cost actually recorded`}
            netIncome={data.totals.netIncome}
            recorded={pi.cost}
            implied={0}
            gross={profit.reported.gross}
            overheads={profit.overheads}
            net={profit.reported.net}
            days={data.range.days}
          />
          <Scenario
            accent
            title="Adjusted for missing cost data"
            note={`Charges the uncosted ${inr(pi.revenueWithoutCost)} at the ${pct(pi.costedMarginPct)} margin measured on costed parts`}
            netIncome={data.totals.netIncome}
            recorded={pi.cost}
            implied={profit.implied}
            gross={profit.adjusted.gross}
            overheads={profit.overheads}
            net={profit.adjusted.net}
            days={data.range.days}
          />
        </div>

        {profit.uncertainty > 0 && (
          <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
            Both columns use the same income and the same overheads. They differ only in how the{' '}
            {inr(pi.revenueWithoutCost)} of parts with no recorded buying price is treated. The{' '}
            {inr(profit.uncertainty)} gap between the two net-profit figures is the cost of the
            missing data, not a business result.
          </p>
        )}
      </section>

      {/* Integrity breakdown */}
      <section className="rounded-xl border bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Parts cost integrity</h2>
        <p className="mb-3 mt-0.5 text-xs text-gray-500 dark:text-gray-400">
          Each part line graded by whether a buying price can be established, and what would fix it.
        </p>

        <div className="mb-3 flex h-6 overflow-hidden rounded-md">
          {pi.byGrade
            .filter((g) => g.revenue > 0)
            .map((g) => (
              <div
                key={g.grade}
                title={`${g.label}: ${inr(g.revenue)}`}
                style={{ width: `${g.sharePct}%`, background: GRADE_COLORS[g.grade] ?? '#64748b' }}
                className="flex items-center justify-center text-[10px] font-bold text-white"
              >
                {g.sharePct > 8 ? `${g.sharePct.toFixed(0)}%` : ''}
              </div>
            ))}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-[10px] uppercase tracking-wide text-gray-400 dark:border-gray-700">
                <th className="py-2 pr-3 font-semibold">Grade</th>
                <th className="py-2 pr-3 text-right font-semibold">Lines</th>
                <th className="py-2 pr-3 text-right font-semibold">Units</th>
                <th className="py-2 pr-3 text-right font-semibold">Revenue</th>
                <th className="py-2 pr-3 text-right font-semibold">Known cost</th>
                <th className="py-2 pr-3 text-right font-semibold">Share</th>
                <th className="py-2 font-semibold">Fix</th>
              </tr>
            </thead>
            <tbody>
              {pi.byGrade.map((g) => (
                <tr key={g.grade} className="border-b last:border-0 dark:border-gray-800">
                  <td className="py-2 pr-3">
                    <span
                      className="mr-2 inline-block h-2 w-2 rounded-full align-middle"
                      style={{ background: GRADE_COLORS[g.grade] ?? '#64748b' }}
                    />
                    <span className="font-medium text-gray-900 dark:text-white">{g.label}</span>
                    <div className="text-[11px] text-gray-500 dark:text-gray-400">
                      {g.description}
                    </div>
                  </td>
                  <td className="py-2 pr-3 text-right">{g.lines}</td>
                  <td className="py-2 pr-3 text-right">{Math.round(g.qty)}</td>
                  <td className="py-2 pr-3 text-right font-semibold">{inr(g.revenue)}</td>
                  <td className="py-2 pr-3 text-right text-gray-500">
                    {g.grade === 'OK' ? inr(g.cost) : '—'}
                  </td>
                  <td className="py-2 pr-3 text-right">{g.sharePct.toFixed(1)}%</td>
                  <td className="py-2 text-[11px] text-gray-500 dark:text-gray-400">{g.fix}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/40">
          <p className="flex items-center gap-2 text-sm font-semibold text-red-800 dark:text-red-300">
            <AlertTriangle className="h-4 w-4" /> The headline parts margin cannot be trusted
          </p>
          <p className="mt-1.5 text-xs text-red-700 dark:text-red-300">
            Only {pct(pi.coveragePct)} of parts revenue has a real buying price behind it. Dividing
            total revenue by total recorded cost treats the remaining {inr(pi.revenueWithoutCost)} as
            pure profit.
          </p>
          <div className="mt-3 flex flex-wrap gap-6 border-t border-red-200 pt-3 dark:border-red-900">
            <Stat label="Naive margin (all parts)" value={pct(pi.naiveMarginPct)} strike />
            <Stat label="True margin (costed only)" value={pct(pi.costedMarginPct)} />
            <Stat label="Revenue with no cost basis" value={inr(pi.revenueWithoutCost)} />
          </div>
        </div>
      </section>

      {/* Daily + income mix */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-xl border bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
            Daily parts vs service
          </h2>
          <p className="mb-3 mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            Ex-GST, stacked. Hatching marks parts revenue with no cost basis.
          </p>
          <svg viewBox="0 0 760 160" className="h-44 w-full">
            <defs>
              <pattern
                id="ps-hatch"
                width="5"
                height="5"
                patternTransform="rotate(45)"
                patternUnits="userSpaceOnUse"
              >
                <line x1="0" y1="0" x2="0" y2="5" stroke="#fff" strokeWidth="2.2" opacity="0.55" />
              </pattern>
            </defs>
            <line x1="26" y1="136" x2="756" y2="136" stroke="#e2e8f0" />
            {data.daily.map((d, i) => {
              const bw = 730 / Math.max(data.daily.length, 1);
              const x = 26 + i * bw + bw * 0.15;
              const w = bw * 0.7;
              const ph = (d.parts / maxDaily) * 136;
              const sh = (d.service / maxDaily) * 136;
              const uh = (d.untraceable / maxDaily) * 136;
              return (
                <g key={d.date}>
                  <rect x={x} y={136 - ph} width={w} height={ph} fill="#2563eb" rx="1" />
                  <rect x={x} y={136 - ph} width={w} height={uh} fill="url(#ps-hatch)" />
                  <rect x={x} y={136 - ph - sh} width={w} height={sh} fill="#16a34a" rx="1" />
                </g>
              );
            })}
          </svg>
          <div className="mt-2 flex flex-wrap gap-4 text-[11px] text-gray-500 dark:text-gray-400">
            <Legend color="#16a34a" label="Service & labour" />
            <Legend color="#2563eb" label="Parts" />
            <Legend color="#94a3b8" label="of which: no cost basis" />
          </div>
        </section>

        <section className="rounded-xl border bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Income by line type</h2>
          <p className="mb-3 mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            Ex-GST. Discount shown as a reduction, not a category.
          </p>
          {data.income.map((i) => {
            const max = Math.max(...data.income.map((x) => Math.abs(x.amount)), 1);
            return (
              <div key={i.lineType} className="mb-2.5 flex items-center gap-3 text-sm">
                <span className="w-32 flex-none text-gray-700 dark:text-gray-300">
                  {LINE_TYPE_LABELS[i.lineType] ?? i.lineType}
                  <span className="block text-[11px] text-gray-400">{i.lines} lines</span>
                </span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                  <span
                    className="block h-full rounded-full"
                    style={{
                      width: `${(Math.abs(i.amount) / max) * 100}%`,
                      background: i.amount < 0 ? '#dc2626' : '#2563eb',
                    }}
                  />
                </span>
                <span className="w-24 flex-none text-right font-semibold">
                  {i.amount < 0 ? '−' : ''}
                  {inr(Math.abs(i.amount))}
                </span>
              </div>
            );
          })}
          <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
            GST billed {inr2(data.totals.taxBilled)} over the period, excluded from income above.
          </p>
        </section>
      </div>

      {/* Complete problem lists */}
      <section className="rounded-xl border bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setTab('noCost')}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              tab === 'noCost'
                ? 'bg-red-600 text-white'
                : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
            }`}
          >
            No buying price ({pi.noCostItems.length})
          </button>
          <button
            onClick={() => setTab('unlinked')}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              tab === 'unlinked'
                ? 'bg-amber-600 text-white'
                : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
            }`}
          >
            No inventory link ({pi.unlinkedItems.length})
          </button>
          <div className="relative ml-auto">
            <Search className="pointer-events-none absolute left-2.5 top-2 h-4 w-4 text-gray-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter by SKU, name or category"
              className="w-64 rounded-lg border py-1.5 pl-8 pr-3 text-sm dark:border-gray-600 dark:bg-gray-800"
            />
          </div>
        </div>

        <p className="mb-3 mt-2 text-xs text-gray-500 dark:text-gray-400">
          {tab === 'noCost'
            ? 'Complete list of items billed in this period whose costPrice is 0. Every sale books as 100% margin until it is filled in.'
            : 'Complete list of free-typed part descriptions with no catalog record. These never move stock and never carry a cost.'}{' '}
          Showing {activeList.length} of{' '}
          {tab === 'noCost' ? pi.noCostItems.length : pi.unlinkedItems.length}. The PDF and CSV
          include the full list.
        </p>

        <div className="max-h-[28rem] overflow-auto rounded-lg border dark:border-gray-800">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white dark:bg-gray-900">
              <tr className="border-b text-left text-[10px] uppercase tracking-wide text-gray-400 dark:border-gray-700">
                <th className="px-3 py-2 text-right font-semibold">#</th>
                {tab === 'noCost' && <th className="px-3 py-2 font-semibold">SKU</th>}
                <th className="px-3 py-2 font-semibold">
                  {tab === 'noCost' ? 'Item' : 'Description as typed'}
                </th>
                {tab === 'noCost' && <th className="px-3 py-2 font-semibold">Category</th>}
                <th className="px-3 py-2 text-right font-semibold">Lines</th>
                <th className="px-3 py-2 text-right font-semibold">Units</th>
                <th className="px-3 py-2 text-right font-semibold">Sell price</th>
                <th className="px-3 py-2 text-right font-semibold">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {activeList.map((r, i) => (
                <tr
                  key={`${r.sku ?? ''}-${r.name}-${i}`}
                  className="border-b last:border-0 dark:border-gray-800"
                >
                  <td className="px-3 py-2 text-right text-gray-400">{i + 1}</td>
                  {tab === 'noCost' && (
                    <td className="px-3 py-2 font-mono text-[11px]">{r.sku ?? '—'}</td>
                  )}
                  <td className="px-3 py-2 font-medium text-gray-900 dark:text-white">{r.name}</td>
                  {tab === 'noCost' && (
                    <td className="px-3 py-2 text-[11px] text-gray-500">{r.category ?? '—'}</td>
                  )}
                  <td className="px-3 py-2 text-right">{r.lines}</td>
                  <td className="px-3 py-2 text-right">{Math.round(r.qty)}</td>
                  <td className="px-3 py-2 text-right text-gray-500">{inr(r.maxUnitPrice)}</td>
                  <td className="px-3 py-2 text-right font-semibold">{inr(r.revenue)}</td>
                </tr>
              ))}
              {activeList.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-sm text-gray-500">
                    {search ? 'Nothing matches that filter.' : 'Nothing to fix here.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Catalog health */}
      <section className="rounded-xl border bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Catalog health</h2>
        <p className="mb-3 mt-0.5 text-xs text-gray-500 dark:text-gray-400">
          Root cause, across all active inventory items — not scoped to the selected period.
        </p>
        <Bar
          label="Missing cost price"
          value={data.catalogHealth.missingCostPrice}
          total={data.catalogHealth.total}
          color="#dc2626"
        />
        <Bar
          label="Has cost price"
          value={data.catalogHealth.total - data.catalogHealth.missingCostPrice}
          total={data.catalogHealth.total}
          color="#16a34a"
        />
        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
          <strong className="text-gray-700 dark:text-gray-200">
            {data.catalogHealth.missingCostPrice} of {data.catalogHealth.total} active items have no
            buying price.
          </strong>{' '}
          {pi.noCostItems.length} of them were sold in this period — that is the subset worth fixing
          first. Cost resolution recovered {inr2(data.nullifDiagnostic.costRecovered)} across{' '}
          {data.nullifDiagnostic.linesAffected} lines that a plain COALESCE would have dropped (
          {data.nullifDiagnostic.zeroCostRows} of {data.nullifDiagnostic.stockOutRows} stock-out rows
          store an explicit zero).
        </p>
      </section>
    </div>
  );
}

/* ---------------- small presentational helpers ---------------- */

function Kpi({
  icon,
  tint,
  cap,
  value,
  foot,
}: {
  icon: React.ReactNode;
  tint: string;
  cap: string;
  value: string;
  foot: string;
}) {
  return (
    <div className="rounded-xl border bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-center gap-3">
        <div className={`rounded-lg p-2.5 ${tint}`}>{icon}</div>
        <div>
          <p className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">{cap}</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
          <p className="text-[11px] text-gray-400">{foot}</p>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, strike }: { label: string; value: string; strike?: boolean }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wide text-red-800 dark:text-red-300">
        {label}
      </p>
      <p
        className={`text-xl font-bold text-red-900 dark:text-red-200 ${strike ? 'line-through opacity-60' : ''}`}
      >
        {value}
      </p>
    </div>
  );
}

function Scenario(props: {
  title: string;
  note: string;
  netIncome: number;
  recorded: number;
  implied: number;
  gross: number;
  overheads: number;
  net: number;
  days: number;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-4 ${
        props.accent
          ? 'border-orange-300 bg-orange-50 dark:border-orange-900 dark:bg-orange-950/30'
          : 'dark:border-gray-800'
      }`}
    >
      <p className="text-sm font-semibold text-gray-900 dark:text-white">{props.title}</p>
      <p className="mb-2.5 text-[11px] text-gray-500 dark:text-gray-400">{props.note}</p>
      <Row label="Net income (ex-GST, after discount)" value={inr(props.netIncome)} />
      <Row label="Parts cost, recorded" value={`− ${inr(props.recorded)}`} negative />
      {props.implied > 0 && (
        <Row label="Parts cost, implied on uncosted" value={`− ${inr(props.implied)}`} negative />
      )}
      <div className="mt-1.5 border-t pt-1.5 dark:border-gray-700">
        <Row label="Gross profit" value={inr(props.gross)} bold />
      </div>
      <Row label={`Overheads (${props.days} days)`} value={`− ${inr(props.overheads)}`} negative />
      <div className="mt-1.5 border-t-2 border-gray-900 pt-2 dark:border-gray-200">
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-gray-900 dark:text-white">Net profit</span>
          <span
            className={`text-lg font-bold ${props.net < 0 ? 'text-red-600' : 'text-green-600'}`}
          >
            {inr(props.net)}
          </span>
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  negative,
  bold,
}: {
  label: string;
  value: string;
  negative?: boolean;
  bold?: boolean;
}) {
  return (
    <div className="flex justify-between py-0.5 text-xs">
      <span className="text-gray-600 dark:text-gray-400">{label}</span>
      <span
        className={`${negative ? 'text-red-600' : 'text-gray-900 dark:text-white'} ${bold ? 'font-bold' : ''}`}
      >
        {value}
      </span>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span>
      <i
        className="mr-1.5 inline-block h-2 w-2 rounded-sm align-middle"
        style={{ background: color }}
      />
      {label}
    </span>
  );
}

function Bar({
  label,
  value,
  total,
  color,
}: {
  label: string;
  value: number;
  total: number;
  color: string;
}) {
  const share = total > 0 ? (value / total) * 100 : 0;
  return (
    <div className="mb-2 flex items-center gap-3 text-sm">
      <span className="w-36 flex-none text-gray-700 dark:text-gray-300">{label}</span>
      <span className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
        <span className="block h-full rounded-full" style={{ width: `${share}%`, background: color }} />
      </span>
      <span className="w-32 flex-none text-right text-xs font-semibold">
        {value} / {total}
        <span className="font-normal text-gray-400"> · {share.toFixed(1)}%</span>
      </span>
    </div>
  );
}
